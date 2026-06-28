#!/usr/bin/env python3
"""Prepare, configure, train, and export Ideogram 4 SimpleTuner identity LoRAs."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError:  # pragma: no cover - reported by main().
    Image = None
    ImageDraw = None
    ImageFont = None
    ImageOps = None


ROOT = Path(__file__).resolve().parent.parent
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
STEP_RE = re.compile(
    r"Steps:\s+\d+%.*?\|\s*(?P<step>\d+)/(?P<total>\d+)\s*"
    r"\[(?P<elapsed>[^<\]]+)<(?P<eta>[^,\]]+),\s*(?P<seconds>[\d.]+)s/it"
    r"(?:,\s*lr=(?P<lr>[^,\]]+))?(?:,\s*step_loss=(?P<loss>[^\]\s]+))?"
)
DEFAULT_SIMPLETUNER_ROOT = Path(
    os.environ.get("IDEOGRAM4_SIMPLETUNER_ROOT", str(ROOT.parent / "ideogram4-simpletuner-compat" / "SimpleTuner"))
)


def fail(message: str) -> None:
    raise SystemExit(f"error: {message}")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_safe_identifier(value: Any, *, label: str) -> None:
    if not isinstance(value, str) or not SAFE_ID_RE.fullmatch(value):
        fail(f"{label} must match {SAFE_ID_RE.pattern}: {value!r}")
    if value in {".", ".."} or "/" in value or "\\" in value:
        fail(f"{label} must be a filename-safe identifier: {value!r}")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_sha256(data: Any) -> str:
    payload = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def write_json_file(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_subject(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"subject config not found: {path}")
    data = read_json(path)
    required = [
        "subject_id",
        "display_name",
        "caption_subject",
        "trigger_token",
        "source_dir",
        "simpletuner_dataset_dir",
        "data_backend_config",
        "train_config",
        "output_dir",
        "lora_output_prefix",
        "training",
    ]
    missing = [key for key in required if key not in data]
    if missing:
        fail(f"subject config missing required fields: {', '.join(missing)}")
    validate_safe_identifier(data["subject_id"], label="subject_id")
    validate_safe_identifier(data["lora_output_prefix"], label="lora_output_prefix")
    if data.get("simpletuner_dataset_id"):
        validate_safe_identifier(data["simpletuner_dataset_id"], label="simpletuner_dataset_id")
    return data


def expanded_path(value: str | Path, *, label: str) -> Path:
    raw = str(value)
    expanded = os.path.expandvars(raw)
    if "$" in expanded:
        fail(f"unresolved environment variable in {label}: {raw}")
    return Path(expanded).expanduser()


def mps_path(value: str | Path) -> Path:
    path = expanded_path(value, label="project path")
    return path if path.is_absolute() else ROOT / path


def simpletuner_root(subject: dict[str, Any]) -> Path:
    configured = subject.get("simpletuner_root")
    root = expanded_path(configured, label="simpletuner_root") if configured else DEFAULT_SIMPLETUNER_ROOT
    if str(root) == ".":
        root = DEFAULT_SIMPLETUNER_ROOT
    if not root.is_absolute():
        root = ROOT / root
    return root


def st_path(subject: dict[str, Any], value: str | Path) -> Path:
    path = expanded_path(value, label="SimpleTuner path")
    return path if path.is_absolute() else simpletuner_root(subject) / path


def run_text(command: list[str]) -> str:
    try:
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    except FileNotFoundError:
        return ""
    return result.stdout


def ps_rows() -> list[dict[str, str]]:
    output = run_text(["ps", "-axo", "pid=,ppid=,pcpu=,pmem=,command="])
    rows = []
    for line in output.splitlines():
        parts = line.strip().split(None, 4)
        if len(parts) < 5:
            continue
        pid, ppid, pcpu, pmem, command = parts
        if pid == str(os.getpid()):
            continue
        rows.append({"pid": pid, "ppid": ppid, "pcpu": pcpu, "pmem": pmem, "command": command})
    return rows


def matching_processes(tokens: list[str]) -> list[dict[str, str]]:
    result = []
    for row in ps_rows():
        command = row["command"]
        if all(token in command for token in tokens):
            result.append(row)
    return result


def macos_swap_usage() -> dict[str, float | str] | None:
    output = run_text(["sysctl", "vm.swapusage"]).strip()
    match = re.search(
        r"total = (?P<total>[\d.]+)M\s+used = (?P<used>[\d.]+)M\s+free = (?P<free>[\d.]+)M",
        output,
    )
    if not match:
        return None
    return {
        "raw": output,
        "total_gb": round(float(match.group("total")) / 1024, 2),
        "used_gb": round(float(match.group("used")) / 1024, 2),
        "free_gb": round(float(match.group("free")) / 1024, 2),
    }


def process_label(command: str) -> str:
    if "server/model_daemon.py" in command:
        return "model_daemon"
    if "simpletuner/train.py" in command:
        return "simpletuner"
    if "ltx-2-mlx" in command:
        return "ltx-2-mlx"
    return Path(command.split()[0]).name if command.split() else "process"


def disk_free_gb(path: Path) -> float:
    target = path
    while not target.exists() and target != target.parent:
        target = target.parent
    usage = shutil.disk_usage(target)
    return round(usage.free / (1024**3), 1)


def preflight_report(subject: dict[str, Any]) -> dict[str, Any]:
    root = simpletuner_root(subject)
    output_dir = st_path(subject, subject["output_dir"])
    source_dir = mps_path(subject["source_dir"])
    warnings: list[str] = []
    errors: list[str] = []

    if not (root / "simpletuner" / "train.py").is_file():
        errors.append(f"SimpleTuner root is invalid: {root}")
    if not (root / ".venv" / "bin" / "python").is_file():
        errors.append(f"SimpleTuner Python is missing: {root / '.venv' / 'bin' / 'python'}")
    if not source_dir.is_dir():
        errors.append(f"source image directory is missing: {source_dir}")

    simpletuner_processes = matching_processes(["simpletuner/train.py"])
    if simpletuner_processes:
        warnings.append(
            "another SimpleTuner training process is running: "
            + ", ".join(row["pid"] for row in simpletuner_processes)
        )

    heavy_processes = []
    for row in ps_rows():
        command = row["command"]
        if "ltx-2-mlx" in command or ("server/model_daemon.py" in command and "python" in command):
            heavy_processes.append(row)
    if heavy_processes:
        warnings.append(
            "other ML/runtime processes are active: "
            + ", ".join(f"{row['pid']}:{process_label(row['command'])}" for row in heavy_processes[:6])
        )

    swap = macos_swap_usage()
    if swap and isinstance(swap.get("used_gb"), float):
        used_gb = float(swap["used_gb"])
        if used_gb >= 8:
            warnings.append(f"macOS swap is high: {used_gb} GB used")
        if used_gb >= 14:
            warnings.append("swap is very high; step time may be several times slower until memory pressure clears")

    free_gb = disk_free_gb(output_dir)
    if free_gb < 20:
        warnings.append(f"low free disk space near output directory: {free_gb} GB")

    return {
        "ok": not errors,
        "subject_id": subject["subject_id"],
        "simpletuner_root": str(root),
        "source_dir": str(source_dir),
        "output_dir": str(output_dir),
        "disk_free_gb": free_gb,
        "swap": swap,
        "warnings": warnings,
        "errors": errors,
    }


def print_preflight(report: dict[str, Any], *, strict: bool, json_output: bool = False) -> None:
    if json_output:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return
    print(f"preflight: {report['subject_id']}")
    print(f"SimpleTuner: {report['simpletuner_root']}")
    print(f"source: {report['source_dir']}")
    print(f"output: {report['output_dir']}")
    print(f"disk free: {report['disk_free_gb']} GB")
    swap = report.get("swap")
    if swap:
        print(f"swap: {swap.get('used_gb')} GB used / {swap.get('total_gb')} GB total")
    for warning in report["warnings"]:
        print(f"warning: {warning}")
    for error in report["errors"]:
        print(f"error: {error}")
    if strict and report["warnings"]:
        print("strict preflight: warnings are treated as blockers")


def enforce_preflight(subject: dict[str, Any], *, strict: bool) -> dict[str, Any]:
    report = preflight_report(subject)
    print_preflight(report, strict=strict)
    if report["errors"] or (strict and report["warnings"]):
        fail("preflight failed")
    return report


def ensure_pillow() -> None:
    if Image is None or ImageOps is None or ImageDraw is None:
        fail("Pillow is required. Install project dependencies or run with .venv/bin/python.")


def load_manifest(path: Path | None) -> dict[str, dict[str, str]]:
    if not path or not path.is_file():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    return {row.get("filename", ""): row for row in rows if row.get("filename")}


def image_files(source_dir: Path) -> list[Path]:
    if not source_dir.is_dir():
        fail(f"source image directory not found: {source_dir}")
    files = [path for path in source_dir.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES]
    if not files:
        fail(f"no images found in {source_dir}")
    return sorted(files, key=lambda path: path.name.lower())


def safe_rmtree_dataset(path: Path, subject: dict[str, Any]) -> None:
    root = simpletuner_root(subject).resolve()
    target = path.resolve()
    datasets_root = (root / "datasets").resolve()
    if datasets_root not in target.parents:
        fail(f"refusing to remove non-dataset directory: {path}")
    shutil.rmtree(target)


def crop_square(image: Any, focus_y: float) -> Any:
    width, height = image.size
    side = min(width, height)
    left = max(0, (width - side) // 2)
    if height == side:
        top = 0
    else:
        available = height - side
        top = int(max(0, min(available, available * focus_y)))
    return image.crop((left, top, left + side, top + side))


def flatten_rgb(image: Any) -> Any:
    if image.mode in {"RGBA", "LA"}:
        background = Image.new("RGB", image.size, "white")
        alpha = image.getchannel("A") if image.mode == "RGBA" else image.getchannel(1)
        background.paste(image.convert("RGB"), mask=alpha)
        return background
    return image.convert("RGB")


def caption_context(row: dict[str, str]) -> str:
    title = " ".join((row.get("source_title") or "").replace("+", " ").split()).lower()
    if any(token in title for token in ["화보", "photoshoot", "campaign", "editorial", "magazine"]):
        return "fashion editorial photoshoot"
    if any(token in title for token in ["press", "제작발표회", "포토", "시사회", "blue carpet"]):
        return "press event portrait"
    if any(token in title for token in ["drama", "film", "series", "still", "스틸컷", "드라마", "영화"]):
        return "drama still portrait"
    if any(token in title for token in ["인스타", "instagram", "셀카", "일상", "airport", "공항"]):
        return "candid lifestyle portrait"
    return "portrait reference photo"


def framing_for(width: int, height: int) -> str:
    ratio = width / max(height, 1)
    if ratio < 0.72:
        return "vertical upper-body or full-body framing"
    if ratio > 1.25:
        return "horizontal editorial framing"
    return "close-up or half-body portrait framing"


def build_caption(subject: dict[str, Any], source_path: Path, row: dict[str, str], width: int, height: int) -> str:
    trigger = subject["trigger_token"]
    caption_subject = subject["caption_subject"]
    context = caption_context(row)
    framing = framing_for(width, height)
    return (
        f"{trigger}, {caption_subject}, {context}, {framing}, single person, "
        "natural facial identity, realistic eyes, detailed hair, clean skin texture, "
        "high quality portrait photograph"
    )


def make_contact_sheet(rows: list[dict[str, Any]], output_path: Path) -> None:
    ensure_pillow()
    if not rows:
        return
    thumb = 180
    label_h = 28
    columns = 8
    visible = rows[:160]
    sheet_width = columns * thumb
    sheet_height = ((len(visible) + columns - 1) // columns) * (thumb + label_h)
    sheet = Image.new("RGB", (sheet_width, sheet_height), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    except Exception:
        font = None
    for idx, row in enumerate(visible):
        x = (idx % columns) * thumb
        y = (idx // columns) * (thumb + label_h)
        image = Image.open(row["prepared_image"]).convert("RGB")
        image.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
        ox = x + (thumb - image.width) // 2
        oy = y + (thumb - image.height) // 2
        sheet.paste(image, (ox, oy))
        draw.rectangle((x, y + thumb, x + thumb, y + thumb + label_h), fill=(245, 245, 245))
        draw.text((x + 6, y + thumb + 7), row["prepared_image"].name[:24], fill=(20, 20, 20), font=font)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, quality=92)


def prepare_dataset(subject: dict[str, Any], *, overwrite: bool) -> Path:
    ensure_pillow()
    prepare = subject.get("prepare", {})
    source_dir = mps_path(subject["source_dir"])
    manifest_path = mps_path(subject["source_manifest"]) if subject.get("source_manifest") else None
    manifest = load_manifest(manifest_path)
    dest_dir = st_path(subject, subject["simpletuner_dataset_dir"])
    if dest_dir.exists():
        if not overwrite:
            fail(f"prepared dataset already exists: {dest_dir} (use --overwrite)")
        safe_rmtree_dataset(dest_dir, subject)
    dest_dir.mkdir(parents=True, exist_ok=True)

    output_size = int(prepare.get("output_size", 1024))
    jpeg_quality = int(prepare.get("jpeg_quality", 95))
    crop_enabled = bool(prepare.get("square_crop", True))
    focus_y = float(prepare.get("crop_focus_y", 0.5))
    min_short_side = int(prepare.get("min_short_side", 512))
    trigger = re.sub(r"[^a-zA-Z0-9]+", "_", subject["trigger_token"]).strip("_").lower()
    subject_slug = re.sub(r"[^a-zA-Z0-9]+", "_", subject["subject_id"]).strip("_").lower()

    rows: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    for idx, source_path in enumerate(image_files(source_dir), start=1):
        try:
            original = ImageOps.exif_transpose(Image.open(source_path))
            width, height = original.size
            if min(width, height) < min_short_side:
                skipped.append({"source": str(source_path), "reason": f"short side {min(width, height)} < {min_short_side}"})
                continue
            image = flatten_rgb(original)
            if crop_enabled:
                image = crop_square(image, focus_y)
            image = image.resize((output_size, output_size), Image.Resampling.LANCZOS)
            stem = f"{trigger}_{subject_slug}_{len(rows) + 1:03d}"
            prepared_image = dest_dir / f"{stem}.jpg"
            image.save(prepared_image, quality=jpeg_quality, optimize=True)
            row = manifest.get(source_path.name, {})
            caption = build_caption(subject, source_path, row, width, height)
            caption_path = dest_dir / f"{stem}.txt"
            caption_path.write_text(caption + "\n", encoding="utf-8")
            rows.append(
                {
                    "index": len(rows) + 1,
                    "source_image": str(source_path),
                    "prepared_image": str(prepared_image),
                    "caption_file": str(caption_path),
                    "caption": caption,
                    "source_width": width,
                    "source_height": height,
                    "prepared_width": output_size,
                    "prepared_height": output_size,
                    "source_title": row.get("source_title", ""),
                    "source_page": row.get("source_page", ""),
                    "rights_status": row.get("rights_status", ""),
                }
            )
        except Exception as exc:
            skipped.append({"source": str(source_path), "reason": str(exc)})

    if not rows:
        fail("no images were prepared")

    contact_sheet_path = dest_dir.parent / "_reviews" / f"{dest_dir.name}_contact_sheet.jpg"
    metadata = {
        "subject_id": subject["subject_id"],
        "display_name": subject["display_name"],
        "trigger_token": subject["trigger_token"],
        "source_dir": str(source_dir),
        "source_manifest": str(manifest_path) if manifest_path else None,
        "prepared_dir": str(dest_dir),
        "contact_sheet": str(contact_sheet_path),
        "prepared_count": len(rows),
        "skipped_count": len(skipped),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "prepare": prepare,
        "rows": rows,
        "skipped": skipped,
    }
    (dest_dir / "metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    contact_rows = [{"prepared_image": Path(row["prepared_image"])} for row in rows]
    make_contact_sheet(contact_rows, contact_sheet_path)
    print(f"prepared {len(rows)} images -> {dest_dir}")
    print(f"contact sheet -> {contact_sheet_path}")
    if skipped:
        print(f"skipped {len(skipped)} images; see {dest_dir / 'metadata.json'}")
    return dest_dir


def lint_prepared_dataset(subject: dict[str, Any]) -> dict[str, Any]:
    dest_dir = st_path(subject, subject["simpletuner_dataset_dir"])
    errors: list[str] = []
    warnings: list[str] = []
    if not dest_dir.is_dir():
        return {
            "ok": False,
            "dataset_dir": str(dest_dir),
            "image_count": 0,
            "caption_count": 0,
            "errors": [f"prepared dataset directory not found: {dest_dir}"],
            "warnings": [],
        }

    images = sorted(path for path in dest_dir.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES)
    captions = sorted(path for path in dest_dir.iterdir() if path.is_file() and path.suffix.lower() == ".txt")
    caption_stems = {path.stem for path in captions}
    image_stems = {path.stem for path in images}

    for image in images:
        if "contact_sheet" in image.stem.lower():
            errors.append(f"review image is inside training dataset: {image.name}")
        caption = image.with_suffix(".txt")
        if not caption.is_file():
            errors.append(f"missing caption for image: {image.name}")
        elif not caption.read_text(encoding="utf-8").strip():
            errors.append(f"empty caption for image: {image.name}")

    for caption in captions:
        if caption.stem not in image_stems:
            warnings.append(f"caption has no matching image: {caption.name}")

    metadata_path = dest_dir / "metadata.json"
    metadata_count = None
    if metadata_path.is_file():
        try:
            metadata = read_json(metadata_path)
            metadata_count = metadata.get("prepared_count")
            if metadata_count != len(images):
                warnings.append(f"metadata prepared_count={metadata_count} but found {len(images)} images")
            contact_sheet = metadata.get("contact_sheet")
            if contact_sheet and Path(contact_sheet).parent == dest_dir:
                errors.append("metadata contact_sheet points inside the training dataset directory")
        except Exception as exc:
            warnings.append(f"metadata.json could not be read: {exc}")
    else:
        warnings.append("metadata.json is missing")

    if not images:
        errors.append("dataset contains no training images")
    if len(captions) < len(images):
        errors.append(f"caption count is lower than image count: {len(captions)} < {len(images)}")

    return {
        "ok": not errors,
        "dataset_dir": str(dest_dir),
        "image_count": len(images),
        "caption_count": len(captions),
        "metadata_count": metadata_count,
        "orphan_caption_count": len(caption_stems - image_stems),
        "errors": errors,
        "warnings": warnings,
    }


def print_lint_report(report: dict[str, Any], *, json_output: bool = False) -> None:
    if json_output:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return
    print(f"dataset: {report['dataset_dir']}")
    print(f"images: {report['image_count']}")
    print(f"captions: {report['caption_count']}")
    if report.get("metadata_count") is not None:
        print(f"metadata prepared_count: {report['metadata_count']}")
    for warning in report["warnings"]:
        print(f"warning: {warning}")
    for error in report["errors"]:
        print(f"error: {error}")
    print("lint: ok" if report["ok"] else "lint: failed")


def enforce_lint_dataset(subject: dict[str, Any]) -> dict[str, Any]:
    report = lint_prepared_dataset(subject)
    print_lint_report(report)
    if not report["ok"]:
        fail("dataset lint failed")
    return report


def data_backend_config(subject: dict[str, Any]) -> list[dict[str, Any]]:
    training = subject["training"]
    resolution = int(training.get("resolution", 768))
    return [
        {
            "id": subject.get("simpletuner_dataset_id", f"{subject['subject_id']}-{resolution}"),
            "type": "local",
            "crop": True,
            "crop_style": "center",
            "crop_aspect": "square",
            "minimum_image_size": 512,
            "maximum_image_size": 1024,
            "target_downsample_size": resolution,
            "resolution": resolution,
            "resolution_type": training.get("resolution_type", "pixel_area"),
            "metadata_backend": "discovery",
            "caption_strategy": "textfile",
            "instance_data_dir": subject["simpletuner_dataset_dir"],
            "cache_dir_vae": f"cache/vae/{subject['subject_id']}-r{training.get('lora_rank', 16)}-{resolution}",
        },
        {
            "id": "text-embeds",
            "dataset_type": "text_embeds",
            "default": True,
            "type": "local",
            "cache_dir": f"cache/text/{subject['subject_id']}-r{training.get('lora_rank', 16)}-{resolution}",
        },
    ]


def train_config(subject: dict[str, Any], *, resume: str | None = None) -> dict[str, Any]:
    training = subject["training"]
    config = {
        "base_model_precision": training.get("base_model_precision", "int8-sdnq"),
        "caption_dropout_probability": training.get("caption_dropout_probability", 0.04),
        "checkpoint_step_interval": training.get("checkpoint_step_interval", 150),
        "checkpoints_total_limit": training.get("checkpoints_total_limit", 6),
        "compress_disk_cache": False,
        "data_backend_config": subject["data_backend_config"],
        "disable_bucket_pruning": True,
        "gradient_checkpointing": training.get("gradient_checkpointing", True),
        "gradient_accumulation_steps": training.get("gradient_accumulation_steps", 1),
        "hub_model_id": subject.get("hub_model_id", subject["subject_id"]),
        "ideogram_auto_json": True,
        "ideogram_prompt_upsample": False,
        "ideogram_schedule_mu": 0.0,
        "ideogram_schedule_std": 1.5,
        "ideogram_validation": False,
        "ignore_final_epochs": True,
        "learning_rate": training.get("learning_rate", 0.00006),
        "lora_rank": training.get("lora_rank", 16),
        "lora_type": "standard",
        "lr_scheduler": training.get("lr_scheduler", "constant_with_warmup"),
        "lr_warmup_steps": training.get("lr_warmup_steps", 60),
        "max_grad_norm": training.get("max_grad_norm", 0.01),
        "max_train_steps": training.get("max_train_steps", 750),
        "minimum_image_size": 0,
        "mixed_precision": training.get("mixed_precision", "bf16"),
        "model_family": "ideogram",
        "model_flavour": "fp8",
        "model_type": "lora",
        "num_eval_images": 0,
        "num_train_epochs": 0,
        "optimizer": training.get("optimizer", "optimi-lion"),
        "output_dir": subject["output_dir"],
        "pretrained_model_name_or_path": training.get("pretrained_model_name_or_path", "ideogram-ai/ideogram-4-fp8"),
        "push_checkpoints_to_hub": False,
        "push_to_hub": False,
        "quantize_via": "cpu",
        "report_to": "none",
        "resolution": training.get("resolution", 768),
        "resolution_type": training.get("resolution_type", "pixel_area"),
        "seed": training.get("seed", 20260627),
        "skip_file_discovery": False,
        "tracker_project_name": subject.get("tracker_project_name", f"lora-{subject['subject_id']}"),
        "tracker_run_name": subject.get("tracker_run_name", subject["subject_id"]),
        "train_batch_size": training.get("train_batch_size", 1),
        "use_ema": False,
        "vae_batch_size": training.get("vae_batch_size", 1),
        "validation_prompt_library": False,
        "validation_step_interval": 0,
    }
    resume_value = resume or training.get("resume_from_checkpoint")
    if resume_value:
        config["resume_from_checkpoint"] = resume_value
    return config


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path}")


def configure(subject: dict[str, Any], *, resume: str | None = None) -> tuple[Path, Path]:
    root = simpletuner_root(subject)
    if not (root / "simpletuner" / "train.py").is_file():
        fail(f"SimpleTuner root does not look valid: {root}")
    backend_path = st_path(subject, subject["data_backend_config"])
    config_path = st_path(subject, subject["train_config"])
    write_json(backend_path, data_backend_config(subject))
    write_json(config_path, train_config(subject, resume=resume))
    return backend_path, config_path


def patch_train_config_resume(subject: dict[str, Any], resume: str | None) -> None:
    if not resume:
        return
    config_path = st_path(subject, subject["train_config"])
    if not config_path.is_file():
        fail(f"train config not found for resume patch: {config_path}")
    config = read_json(config_path)
    config["resume_from_checkpoint"] = resume
    write_json(config_path, config)


def dataset_fingerprint(subject: dict[str, Any]) -> dict[str, Any]:
    dest_dir = st_path(subject, subject["simpletuner_dataset_dir"])
    entries = []
    if dest_dir.is_dir():
        for path in sorted(dest_dir.iterdir(), key=lambda item: item.name):
            if path.is_file() and (path.suffix.lower() in IMAGE_SUFFIXES or path.suffix.lower() == ".txt"):
                stat = path.stat()
                entries.append({"name": path.name, "size": stat.st_size})
    return {"file_count": len(entries), "sha256": json_sha256(entries)}


def create_run_manifest(
    subject: dict[str, Any],
    *,
    subject_path: Path,
    command: str,
    preflight: dict[str, Any] | None,
    dataset_lint: dict[str, Any] | None,
    dry_run: bool,
    resume: str | None,
    steps: list[int] | None,
) -> Path:
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    run_dir = ROOT / "generated" / "lora_runs" / subject["subject_id"] / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    train_config_path = st_path(subject, subject["train_config"])
    data_backend_path = st_path(subject, subject["data_backend_config"])
    manifest = {
        "run_id": run_id,
        "status": "created",
        "created_at": now_iso(),
        "subject_id": subject["subject_id"],
        "display_name": subject["display_name"],
        "trigger_token": subject["trigger_token"],
        "command": command,
        "dry_run": dry_run,
        "resume": resume,
        "export_steps": steps,
        "subject_config": {
            "path": str(subject_path.resolve()),
            "sha256": file_sha256(subject_path) if subject_path.is_file() else None,
        },
        "simpletuner_root": str(simpletuner_root(subject)),
        "train_config": {
            "path": str(train_config_path),
            "sha256": file_sha256(train_config_path) if train_config_path.is_file() else None,
        },
        "data_backend_config": {
            "path": str(data_backend_path),
            "sha256": file_sha256(data_backend_path) if data_backend_path.is_file() else None,
        },
        "dataset": dataset_fingerprint(subject),
        "preflight": preflight,
        "dataset_lint": dataset_lint,
        "events": [],
    }
    manifest_path = run_dir / "manifest.json"
    write_json_file(manifest_path, manifest)
    print(f"run manifest -> {manifest_path}")
    return manifest_path


def update_run_manifest(path: Path | None, **updates: Any) -> None:
    if not path:
        return
    try:
        data = read_json(path)
    except Exception:
        return
    events = data.setdefault("events", [])
    event = {"at": now_iso()}
    event.update(updates)
    events.append(event)
    data.update(updates)
    write_json_file(path, data)


def train(subject: dict[str, Any], *, dry_run: bool, resume: str | None = None, run_manifest: Path | None = None) -> None:
    root = simpletuner_root(subject)
    config_path = subject["train_config"]
    python = root / ".venv" / "bin" / "python"
    if not python.is_file():
        fail(f"SimpleTuner Python not found: {python}")
    patch_train_config_resume(subject, resume)
    command = [str(python), "simpletuner/train.py"]
    env = os.environ.copy()
    env.update(
        {
            "PYTORCH_ENABLE_MPS_FALLBACK": "1",
            "TOKENIZERS_PARALLELISM": "false",
            "CONFIG_BACKEND": "json",
            "CONFIG_PATH": config_path,
        }
    )
    print("training command:")
    print(f"cd {root} && CONFIG_BACKEND=json CONFIG_PATH={config_path} {python} simpletuner/train.py")
    update_run_manifest(run_manifest, status="train_dry_run" if dry_run else "training", train_started_at=now_iso())
    if dry_run:
        return
    try:
        subprocess.run(command, cwd=root, env=env, check=True)
    except subprocess.CalledProcessError as exc:
        update_run_manifest(run_manifest, status="failed", train_failed_at=now_iso(), returncode=exc.returncode)
        raise
    update_run_manifest(run_manifest, status="trained", train_finished_at=now_iso())


def checkpoint_sources(subject: dict[str, Any], steps: list[int] | None) -> list[tuple[int, Path]]:
    output_dir = st_path(subject, subject["output_dir"])
    if not output_dir.exists():
        fail(f"training output directory not found: {output_dir}")
    result: list[tuple[int, Path]] = []
    if steps is None:
        for checkpoint in sorted(output_dir.glob("checkpoint-*")):
            if not checkpoint.is_dir():
                continue
            try:
                step = int(checkpoint.name.split("-", 1)[1])
            except (IndexError, ValueError):
                continue
            file = checkpoint / "pytorch_lora_weights.safetensors"
            if file.is_file():
                result.append((step, file))
        final_file = output_dir / "pytorch_lora_weights.safetensors"
        max_steps = int(subject["training"].get("max_train_steps", 0))
        if final_file.is_file() and max_steps and all(step != max_steps for step, _ in result):
            result.append((max_steps, final_file))
    else:
        for step in steps:
            file = output_dir / f"checkpoint-{step}" / "pytorch_lora_weights.safetensors"
            if not file.is_file() and step == int(subject["training"].get("max_train_steps", 0)):
                final_file = output_dir / "pytorch_lora_weights.safetensors"
                if final_file.is_file():
                    file = final_file
            if not file.is_file():
                fail(f"checkpoint not found for step {step}: {file}")
            result.append((step, file))
    if not result:
        fail(f"no LoRA safetensors found in {output_dir}")
    return sorted(result, key=lambda item: item[0])


def parse_steps(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    values = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        values.append(int(part))
    return values or None


def export_loras(subject: dict[str, Any], *, steps: list[int] | None, overwrite: bool) -> None:
    lora_dir = mps_path(os.environ.get("IDEOGRAM4_LORA_DIR", "models/loras"))
    lora_dir.mkdir(parents=True, exist_ok=True)
    copied = []
    for step, source in checkpoint_sources(subject, steps):
        target = lora_dir / f"{subject['lora_output_prefix']}_step{step}.safetensors"
        if target.exists() and not overwrite:
            fail(f"export target already exists: {target} (use --overwrite)")
        shutil.copy2(source, target)
        copied.append({"step": step, "source": str(source), "target": str(target), "bytes": target.stat().st_size})
        print(f"exported step {step}: {target}")
    manifest = {
        "subject_id": subject["subject_id"],
        "display_name": subject["display_name"],
        "trigger_token": subject["trigger_token"],
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "loras": copied,
    }
    manifest_path = lora_dir / f"{subject['lora_output_prefix']}_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {manifest_path}")


def latest_log_for_subject(subject: dict[str, Any]) -> Path | None:
    log_dir = ROOT / "logs"
    if not log_dir.is_dir():
        return None
    candidates = list(log_dir.glob(f"lora-{subject['subject_id']}-*.log"))
    candidates.extend(log_dir.glob(f"*{subject['subject_id']}*.log"))
    candidates = [path for path in set(candidates) if path.is_file()]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def clean_log_text(text: str) -> str:
    return ANSI_RE.sub("", text).replace("\r", "\n")


def parse_training_log(path: Path | None) -> dict[str, Any]:
    if path is None or not path.is_file():
        return {"log": str(path) if path else None, "found": False}
    text = clean_log_text(path.read_text(encoding="utf-8", errors="replace"))
    latest_step = None
    for line in text.splitlines():
        match = STEP_RE.search(line)
        if not match:
            continue
        latest_step = {
            "step": int(match.group("step")),
            "total": int(match.group("total")),
            "elapsed": match.group("elapsed").strip(),
            "eta": match.group("eta").strip(),
            "seconds_per_step": float(match.group("seconds")),
            "lr": match.group("lr"),
            "step_loss": match.group("loss"),
        }
        latest_step["percent"] = round(latest_step["step"] / latest_step["total"] * 100, 1)
    failed = "Traceback (most recent call last)" in text or "returned non-zero exit status" in text
    return {
        "log": str(path),
        "found": True,
        "latest_step": latest_step,
        "failed": failed,
        "size_bytes": path.stat().st_size,
        "modified_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
    }


def checkpoint_status(subject: dict[str, Any]) -> list[dict[str, Any]]:
    output_dir = st_path(subject, subject["output_dir"])
    result = []
    if not output_dir.is_dir():
        return result
    for path in sorted(output_dir.glob("checkpoint-*")):
        if not path.is_dir():
            continue
        try:
            step = int(path.name.split("-", 1)[1])
        except (IndexError, ValueError):
            continue
        result.append(
            {
                "step": step,
                "path": str(path),
                "has_lora": (path / "pytorch_lora_weights.safetensors").is_file(),
                "modified_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
            }
        )
    return result


def active_training_processes(subject: dict[str, Any]) -> list[dict[str, str]]:
    subject_id = subject["subject_id"]
    output_dir = subject["output_dir"]
    result = []
    for row in ps_rows():
        command = row["command"]
        if "simpletuner/train.py" in command or "ideogram_lora_pipeline.py" in command:
            if subject_id in command or output_dir in command or "simpletuner/train.py" in command:
                result.append(row)
    return result


def training_status(subject: dict[str, Any], *, log_path: Path | None = None) -> dict[str, Any]:
    log = log_path or latest_log_for_subject(subject)
    parsed_log = parse_training_log(log)
    checkpoints = checkpoint_status(subject)
    return {
        "subject_id": subject["subject_id"],
        "display_name": subject["display_name"],
        "processes": active_training_processes(subject),
        "log": parsed_log,
        "checkpoints": checkpoints,
        "latest_checkpoint": checkpoints[-1] if checkpoints else None,
    }


def print_status(status: dict[str, Any], *, json_output: bool = False) -> None:
    if json_output:
        print(json.dumps(status, indent=2, ensure_ascii=False))
        return
    print(f"subject: {status['subject_id']} ({status['display_name']})")
    processes = status["processes"]
    if processes:
        print("processes: " + ", ".join(f"{row['pid']} cpu={row['pcpu']}% mem={row['pmem']}%" for row in processes))
    else:
        print("processes: none")
    log = status["log"]
    print(f"log: {log.get('log') or 'not found'}")
    latest_step = log.get("latest_step")
    if latest_step:
        print(
            "progress: "
            f"{latest_step['step']}/{latest_step['total']} ({latest_step['percent']}%), "
            f"{latest_step['seconds_per_step']}s/step, eta {latest_step['eta']}, "
            f"loss {latest_step.get('step_loss')}, lr {latest_step.get('lr')}"
        )
    elif log.get("found"):
        print("progress: no step record yet")
    if log.get("failed"):
        print("warning: log contains a failure traceback")
    latest_checkpoint = status.get("latest_checkpoint")
    if latest_checkpoint:
        print(
            "latest checkpoint: "
            f"step {latest_checkpoint['step']} "
            f"has_lora={latest_checkpoint['has_lora']} "
            f"{latest_checkpoint['path']}"
        )
    else:
        print("latest checkpoint: none")


def monitor_status(subject: dict[str, Any], *, log_path: Path | None, interval: float) -> None:
    try:
        while True:
            print_status(training_status(subject, log_path=log_path))
            print("---")
            time.sleep(interval)
    except KeyboardInterrupt:
        print("monitor stopped")


def validate(subject: dict[str, Any]) -> None:
    source_dir = mps_path(subject["source_dir"])
    files = image_files(source_dir)
    root = simpletuner_root(subject)
    print(f"subject: {subject['subject_id']} ({subject['display_name']})")
    print(f"trigger: {subject['trigger_token']}")
    print(f"source images: {len(files)} in {source_dir}")
    print(f"SimpleTuner root: {root}")
    print(f"prepared dataset: {st_path(subject, subject['simpletuner_dataset_dir'])}")
    print(f"data backend config: {st_path(subject, subject['data_backend_config'])}")
    print(f"train config: {st_path(subject, subject['train_config'])}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subject", type=Path, required=True, help="subject JSON config")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare_parser = subparsers.add_parser("prepare", help="copy/crop images and write .txt captions")
    prepare_parser.add_argument("--overwrite", action="store_true")

    configure_parser = subparsers.add_parser("configure", help="write SimpleTuner backend/train configs")
    configure_parser.add_argument("--resume", help="set SimpleTuner resume_from_checkpoint, e.g. latest")

    train_parser = subparsers.add_parser("train", help="run SimpleTuner training")
    train_parser.add_argument("--dry-run", action="store_true")
    train_parser.add_argument("--resume", help="set SimpleTuner resume_from_checkpoint before training")
    train_parser.add_argument("--skip-preflight", action="store_true")
    train_parser.add_argument("--strict-preflight", action="store_true")
    train_parser.add_argument("--no-run-manifest", action="store_true")

    export_parser = subparsers.add_parser("export", help="copy trained LoRA checkpoints into models/loras")
    export_parser.add_argument("--steps", help="comma-separated checkpoint steps; default exports all found")
    export_parser.add_argument("--overwrite", action="store_true")

    all_parser = subparsers.add_parser("all", help="prepare, configure, train, and export")
    all_parser.add_argument("--overwrite", action="store_true")
    all_parser.add_argument("--dry-run", action="store_true")
    all_parser.add_argument("--steps", help="comma-separated checkpoint steps to export after training")
    all_parser.add_argument("--resume", help="set SimpleTuner resume_from_checkpoint before training")
    all_parser.add_argument("--skip-preflight", action="store_true")
    all_parser.add_argument("--strict-preflight", action="store_true")
    all_parser.add_argument("--no-run-manifest", action="store_true")

    subparsers.add_parser("validate", help="print resolved paths and image counts")

    lint_parser = subparsers.add_parser("lint-dataset", help="verify prepared dataset image/caption integrity")
    lint_parser.add_argument("--json", action="store_true", dest="json_output")

    preflight_parser = subparsers.add_parser("preflight", help="check local training readiness and machine pressure")
    preflight_parser.add_argument("--strict", action="store_true")
    preflight_parser.add_argument("--json", action="store_true", dest="json_output")

    status_parser = subparsers.add_parser("status", help="show active training progress from logs/checkpoints")
    status_parser.add_argument("--log", type=Path, help="explicit training log path")
    status_parser.add_argument("--json", action="store_true", dest="json_output")

    monitor_parser = subparsers.add_parser("monitor", help="poll training status until interrupted")
    monitor_parser.add_argument("--log", type=Path, help="explicit training log path")
    monitor_parser.add_argument("--interval", type=float, default=30.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    subject = load_subject(args.subject)
    run_manifest: Path | None = None
    if args.command == "validate":
        validate(subject)
    elif args.command == "prepare":
        prepare_dataset(subject, overwrite=args.overwrite)
        enforce_lint_dataset(subject)
    elif args.command == "configure":
        configure(subject, resume=args.resume)
    elif args.command == "train":
        preflight = None if args.skip_preflight else enforce_preflight(subject, strict=args.strict_preflight)
        dataset_lint = enforce_lint_dataset(subject)
        if not args.no_run_manifest:
            run_manifest = create_run_manifest(
                subject,
                subject_path=args.subject,
                command="train",
                preflight=preflight,
                dataset_lint=dataset_lint,
                dry_run=args.dry_run,
                resume=args.resume,
                steps=None,
            )
        train(subject, dry_run=args.dry_run, resume=args.resume, run_manifest=run_manifest)
    elif args.command == "export":
        export_loras(subject, steps=parse_steps(args.steps), overwrite=args.overwrite)
    elif args.command == "all":
        preflight = None if args.skip_preflight else enforce_preflight(subject, strict=args.strict_preflight)
        prepare_dataset(subject, overwrite=args.overwrite)
        dataset_lint = enforce_lint_dataset(subject)
        configure(subject, resume=args.resume)
        steps = parse_steps(args.steps)
        if not args.no_run_manifest:
            run_manifest = create_run_manifest(
                subject,
                subject_path=args.subject,
                command="all",
                preflight=preflight,
                dataset_lint=dataset_lint,
                dry_run=args.dry_run,
                resume=args.resume,
                steps=steps,
            )
        train(subject, dry_run=args.dry_run, resume=args.resume, run_manifest=run_manifest)
        if not args.dry_run:
            export_loras(subject, steps=steps, overwrite=args.overwrite)
            update_run_manifest(run_manifest, status="exported", exported_at=now_iso())
    elif args.command == "lint-dataset":
        report = lint_prepared_dataset(subject)
        print_lint_report(report, json_output=args.json_output)
        if not report["ok"]:
            return 1
    elif args.command == "preflight":
        report = preflight_report(subject)
        print_preflight(report, strict=args.strict, json_output=args.json_output)
        if report["errors"] or (args.strict and report["warnings"]):
            return 1
    elif args.command == "status":
        log_path = args.log.expanduser() if args.log else None
        print_status(training_status(subject, log_path=log_path), json_output=args.json_output)
    elif args.command == "monitor":
        log_path = args.log.expanduser() if args.log else None
        monitor_status(subject, log_path=log_path, interval=args.interval)
    else:  # pragma: no cover
        fail(f"unknown command: {args.command}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
