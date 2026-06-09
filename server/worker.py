#!/usr/bin/env python3
"""Worker module: manages Ideogram 4 pipeline lifecycle and task queue."""
import json
import math
import os
import sys
import time
import threading
import uuid
from pathlib import Path
from typing import Optional

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import torch
import safetensors.torch as sf
from ideogram4 import Ideogram4Pipeline, Ideogram4PipelineConfig
from ideogram4.modeling_ideogram4 import Ideogram4Transformer
from ideogram4 import Ideogram4Config
from ideogram4.scheduler import LogitNormalSchedule
from ideogram4.sampler_configs import PRESETS
from transformers import AutoTokenizer, AutoConfig, AutoModel
from ideogram4.pipeline_ideogram4 import _load_autoencoder
from huggingface_hub import snapshot_download

import db

FP8_DTYPE = torch.float8_e4m3fn
DEFAULT_REPO = "ideogram-ai/ideogram-4-fp8"

# -- Shared state --
_lock = threading.Lock()
_pipeline: Optional[Ideogram4Pipeline] = None
_device: Optional[torch.device] = None
_snapshot: Optional[Path] = None
_tasks: dict = {}  # task_id -> { "state": "running"|"done", "msg": str, "image_url": str|None }
_state: str = "idle"  # idle | loading | loaded
_state_msg: str = ""


def get_state() -> dict:
    return {"state": _state, "msg": _state_msg}


def _download_repo(repo_id: str) -> Path:
    print(f"Downloading/verifying {repo_id} ...")
    t0 = time.time()
    try:
        local = snapshot_download(repo_id)
    except Exception as e:
        print(f"ERROR: failed to download {repo_id}: {e}")
        raise RuntimeError(f"Failed to download {repo_id}: {e}") from e
    print(f"  done in {time.time() - t0:.1f}s  ->  {local}")
    return Path(local)


def _dequant_state_dict(state_dict: dict) -> dict:
    new = {}
    for k, v in state_dict.items():
        if k.endswith(".weight_scale"):
            continue
        if v.dtype == FP8_DTYPE:
            scale = state_dict[k + "_scale"]
            w = v.to(torch.float32) * scale.to(torch.float32).unsqueeze(1)
            new[k] = w.to(torch.bfloat16)
        else:
            new[k] = v
    return new


def _load_and_dequant_shard(snapshot: Path, index_filename: str) -> dict:
    with open(snapshot / index_filename) as f:
        idx = json.load(f)
    sdir = index_filename.rsplit("/", 1)[0]
    combined = {}
    for sf_name in sorted(set(idx["weight_map"].values())):
        sd = sf.load_file(str(snapshot / sdir / sf_name), device="cpu")
        combined.update(sd)
    return _dequant_state_dict(combined)


def _load_text_encoder(snapshot: Path, device):
    print("Loading text encoder (CPU dequant)...")
    t0 = time.time()
    cfg = AutoConfig.from_pretrained(str(snapshot / "text_encoder"), trust_remote_code=True)
    model = AutoModel.from_config(cfg, trust_remote_code=True)
    sd = sf.load_file(str(snapshot / "text_encoder" / "model.safetensors"), device="cpu")
    n = sum(1 for v in sd.values() if v.dtype == torch.float8_e4m3fn)
    model.load_state_dict(_dequant_state_dict(sd), strict=False)
    model.to(device, dtype=torch.bfloat16).eval()
    print(f"  done in {time.time() - t0:.1f}s, dequantized {n} fp8 weights")
    return model


def _load_transformer(snapshot: Path, subdir: str, device):
    index_fn = f"{subdir}/diffusion_pytorch_model.safetensors.index.json"
    print(f"Loading {subdir} (CPU dequant)...")
    t0 = time.time()
    model = Ideogram4Transformer(Ideogram4Config())
    model.to(torch.bfloat16)
    model.load_state_dict(_load_and_dequant_shard(snapshot, index_fn), strict=False)
    model.to(device, dtype=torch.bfloat16).eval()
    n = sum(p.numel() for p in model.parameters())
    print(f"  done in {time.time() - t0:.1f}s, {n / 1e9:.1f}B params")
    return model


def _load_vae(snapshot: Path, device):
    t0 = time.time()
    vae = _load_autoencoder(
        str(snapshot / "vae" / "diffusion_pytorch_model.safetensors"),
        device,
        torch.bfloat16,
    )
    print(f"  VAE done in {time.time() - t0:.1f}s")
    return vae


def _patch_scheduler():
    def patched(self, t):
        t = t.to(torch.float32).cpu()
        y = self.mean + self.std * torch.special.ndtri(t)
        t_ = 1 - torch.special.expit(y)
        t_min = 1.0 / (1 + math.exp(0.5 * self.logsnr_max))
        t_max = 1.0 / (1 + math.exp(0.5 * self.logsnr_min))
        return t_.clamp(t_min, t_max).to(t.device)
    LogitNormalSchedule.__call__ = patched


def _load_pipeline(snapshot: Path, device) -> Ideogram4Pipeline:
    from ideogram4 import Ideogram4Pipeline, Ideogram4PipelineConfig
    from transformers import AutoTokenizer

    t0 = time.time()
    _patch_scheduler()

    tokenizer = AutoTokenizer.from_pretrained(str(snapshot / "tokenizer"), trust_remote_code=True)
    text_encoder = _load_text_encoder(snapshot, device)
    cond = _load_transformer(snapshot, "transformer", device)
    uncond = _load_transformer(snapshot, "unconditional_transformer", device)
    vae = _load_vae(snapshot, device)

    pipe = Ideogram4Pipeline(
        conditional_transformer=cond,
        unconditional_transformer=uncond,
        text_encoder=text_encoder,
        text_tokenizer=tokenizer,
        autoencoder=vae,
        config=Ideogram4PipelineConfig(weights_repo=DEFAULT_REPO),
        device=device,
        dtype=torch.bfloat16,
    )
    print(f"Pipeline loaded in {time.time() - t0:.1f}s")
    return pipe


def load_model():
    global _pipeline, _device, _snapshot, _state, _state_msg
    with _lock:
        if _state == "loaded" or _state == "loading":
            return {"ok": _state == "loaded", "msg": _state_msg}

        _state = "loading"
        _state_msg = "Starting model load..."

    try:
        if not torch.backends.mps.is_available():
            raise RuntimeError("MPS not available. Requires Apple Silicon.")

        device = torch.device("mps")
        snapshot = _download_repo(DEFAULT_REPO)

        with _lock:
            _state_msg = "Loading pipeline (~140s)..."
        pipe = _load_pipeline(snapshot, device)

        with _lock:
            _pipeline = pipe
            _device = device
            _snapshot = snapshot
            _state = "loaded"
            _state_msg = "Model loaded."
        return {"ok": True, "msg": "Model loaded successfully."}

    except Exception as e:
        with _lock:
            _state = "idle"
            _state_msg = str(e)
        return {"ok": False, "msg": str(e)}


def unload_model():
    global _pipeline, _device, _snapshot, _state, _state_msg
    with _lock:
        _pipeline = None
        _device = None
        _snapshot = None
        _state = "idle"
        _state_msg = ""
    import gc
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
    return {"ok": True}


def submit_generate(caption: dict, width: int, height: int, preset: str, seed: int) -> dict:
    task_id = uuid.uuid4().hex
    _tasks[task_id] = {"state": "running", "msg": "Queued...", "image": None}

    thread = threading.Thread(
        target=_run_generate,
        args=(task_id, caption, width, height, preset, seed),
        daemon=True,
    )
    thread.start()
    return {"task_id": task_id}


def _run_generate(task_id: str, caption: dict, width: int, height: int, preset: str, seed: int):
    try:
        _tasks[task_id]["msg"] = "Encoding prompt..."

        with _lock:
            pipe = _pipeline
        if pipe is None:
            raise RuntimeError("Model not loaded.")

        if isinstance(caption, dict):
            prompt_str = json.dumps(caption, ensure_ascii=False)
        else:
            prompt_str = str(caption)

        preset_cfg = PRESETS.get(preset, PRESETS["V4_QUALITY_48"])

        if width % 16:
            width = (width // 16) * 16
        if height % 16:
            height = (height // 16) * 16

        total_steps = preset_cfg.num_steps
        _tasks[task_id]["msg"] = f"Generating ({width}x{height}, {total_steps} steps)..."
        _tasks[task_id]["progress"] = 0
        _tasks[task_id]["total_steps"] = total_steps

        t0 = time.time()
        pipe = None
        with _lock:
            pipe = _pipeline
        if pipe is None:
            raise RuntimeError("Model unloaded during generation.")

        step_count = [0]
        _orig_forward = pipe.unconditional_transformer.forward

        def _patched_forward(*args, **kwargs):
            result = _orig_forward(*args, **kwargs)
            step_count[0] += 1
            pct = min(int(step_count[0] / total_steps * 100), 99)
            _tasks[task_id]["progress"] = pct
            _tasks[task_id]["msg"] = f"Generating ({width}x{height}, {step_count[0]}/{total_steps} steps)..."
            return result

        pipe.unconditional_transformer.forward = _patched_forward
        try:
            images = pipe(
                prompts=prompt_str,
                height=height,
                width=width,
                num_steps=total_steps,
                guidance_schedule=preset_cfg.guidance_schedule,
                mu=preset_cfg.mu,
                std=preset_cfg.std,
                seed=seed,
                raise_on_caption_issues=False,
            )
        finally:
            pipe.unconditional_transformer.forward = _orig_forward

        gen_s = time.time() - t0
        _tasks[task_id]["progress"] = 100
        _tasks[task_id]["msg"] = f"Generation done in {gen_s:.1f}s, saving..."

        import base64
        from io import BytesIO

        buf = BytesIO()
        images[0].save(buf, format="PNG")
        buf.seek(0)

        hld_line = prompt_str.split("\n")[0] if "\n" in prompt_str else prompt_str
        hld_text = json.loads(prompt_str).get("high_level_description", "") if isinstance(caption, dict) else hld_line[:120]

        timestamp = uuid.uuid4().hex[:12]
        filename = f"{timestamp}.png"
        filepath = db.OUTPUT_DIR / filename
        with open(filepath, "wb") as f:
            f.write(buf.getvalue())

        image_id = db.add_image(hld_text, width, height, preset, seed, str(filepath))

        b64 = base64.b64encode(buf.getvalue()).decode()
        img_url = f"/api/images/{image_id}/file"
        _tasks[task_id]["msg"] = f"Done in {gen_s:.1f}s"
        _tasks[task_id]["state"] = "done"
        _tasks[task_id]["image"] = {
            "id": image_id,
            "url": img_url,
            "hld": hld_text,
            "time": time.strftime("%H:%M:%S"),
        }

    except Exception as e:
        _tasks[task_id]["state"] = "done"
        _tasks[task_id]["msg"] = f"Error: {e}"
        _tasks[task_id]["image_url"] = None


def get_task_status(task_id: str) -> dict:
    task = _tasks.get(task_id)
    if task is None:
        return {"state": "done", "msg": "Task not found.", "image": None}
    return {
        "state": task["state"],
        "msg": task["msg"],
        "image": task.get("image"),
        "progress": task.get("progress", 0),
        "total_steps": task.get("total_steps", 0),
    }
