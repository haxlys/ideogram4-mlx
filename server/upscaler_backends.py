"""Pluggable upscaler backends (default: local Real-ESRGAN ncnn-vulkan CLI)."""

from __future__ import annotations

import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from PIL import Image

try:
    from .config import (
    OUTPUT_DIR,
    UPSCALER_BACKEND,
    UPSCALER_BIN,
    UPSCALER_MAX_OUTPUT_PIXELS,
    UPSCALER_MODEL_DIR,
        UPSCALER_TIMEOUT_SECONDS,
    )
except ImportError:  # pragma: no cover
    from config import (  # type: ignore
    OUTPUT_DIR,
    UPSCALER_BACKEND,
    UPSCALER_BIN,
    UPSCALER_MAX_OUTPUT_PIXELS,
    UPSCALER_MODEL_DIR,
        UPSCALER_TIMEOUT_SECONDS,
    )

UPSCALE_PRESETS: dict[str, str] = {
    "standard": "realesrgan-x4plus",
    "sharp": "ultrasharp-4x",
}

UPSCALER_BACKEND_ENV = "IDEOGRAM4_UPSCALER_BACKEND"


@dataclass(frozen=True)
class UpscalerConfigStatus:
    configured: bool
    bin_path: str | None
    model_dir: str | None
    available_presets: list[str]
    backend: str
    error: str | None = None


@dataclass(frozen=True)
class UpscaleResult:
    output_path: Path
    width: int
    height: int
    seconds: float
    stdout: str
    stderr: str


class UpscalerBackend(Protocol):
    backend_id: str

    def status(self) -> UpscalerConfigStatus: ...

    def validate(self, source_path: Path, scale: int, preset: str) -> None: ...

    def run(
        self,
        *,
        source_path: Path,
        output_name: str,
        scale: int,
        preset: str,
    ) -> UpscaleResult: ...


def inspect_image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return int(image.width), int(image.height)


def _resolve_bin() -> Path | None:
    if UPSCALER_BIN is not None:
        return UPSCALER_BIN if UPSCALER_BIN.is_file() else None
    found = shutil.which("realesrgan-ncnn-vulkan")
    return Path(found) if found else None


def _resolve_model_dir(bin_path: Path | None) -> Path | None:
    if UPSCALER_MODEL_DIR is not None:
        return UPSCALER_MODEL_DIR if UPSCALER_MODEL_DIR.is_dir() else None
    if bin_path is not None:
        sibling = bin_path.parent / "models"
        if sibling.is_dir():
            return sibling
    return None


def _available_presets(model_dir: Path | None) -> list[str]:
    if model_dir is None:
        return []
    available: list[str] = []
    for preset, model_name in UPSCALE_PRESETS.items():
        if (model_dir / f"{model_name}.bin").is_file() and (model_dir / f"{model_name}.param").is_file():
            available.append(preset)
    return available


class RealEsrganNcnnBackend:
    backend_id = "realesrgan_ncnn"

    def status(self) -> UpscalerConfigStatus:
        bin_path = _resolve_bin()
        model_dir = _resolve_model_dir(bin_path)
        available = _available_presets(model_dir)
        if bin_path is None:
            return UpscalerConfigStatus(
                configured=False,
                bin_path=None,
                model_dir=str(model_dir) if model_dir else None,
                available_presets=available,
                backend=self.backend_id,
                error="Real-ESRGAN ncnn-vulkan binary not found. Set IDEOGRAM4_UPSCALER_BIN.",
            )
        if model_dir is None:
            return UpscalerConfigStatus(
                configured=False,
                bin_path=str(bin_path),
                model_dir=None,
                available_presets=available,
                backend=self.backend_id,
                error="Real-ESRGAN model directory not found. Set IDEOGRAM4_UPSCALER_MODEL_DIR.",
            )
        if "standard" not in available:
            return UpscalerConfigStatus(
                configured=False,
                bin_path=str(bin_path),
                model_dir=str(model_dir),
                available_presets=available,
                backend=self.backend_id,
                error="Standard Real-ESRGAN model files were not found in the upscaler model directory.",
            )
        return UpscalerConfigStatus(
            configured=True,
            bin_path=str(bin_path),
            model_dir=str(model_dir),
            available_presets=available,
            backend=self.backend_id,
        )

    def validate(self, source_path: Path, scale: int, preset: str) -> None:
        if scale not in {2, 4}:
            raise ValueError("scale must be 2 or 4")
        if preset not in UPSCALE_PRESETS:
            raise ValueError(f"preset must be one of: {', '.join(sorted(UPSCALE_PRESETS))}")
        status = self.status()
        if not status.configured:
            raise RuntimeError(status.error or "Upscaler is not configured.")
        if preset not in status.available_presets:
            raise RuntimeError(f"Upscaler preset is not installed: {preset}")
        width, height = inspect_image_size(source_path)
        output_pixels = width * scale * height * scale
        if output_pixels > UPSCALER_MAX_OUTPUT_PIXELS:
            raise ValueError(
                f"upscaled image would be {output_pixels:,} pixels; "
                f"limit is {UPSCALER_MAX_OUTPUT_PIXELS:,}"
            )

    def run(
        self,
        *,
        source_path: Path,
        output_name: str,
        scale: int,
        preset: str,
    ) -> UpscaleResult:
        self.validate(source_path, scale, preset)
        status = self.status()
        if status.bin_path is None or status.model_dir is None:
            raise RuntimeError(status.error or "Upscaler is not configured.")

        bin_path = Path(status.bin_path)
        model_dir = status.model_dir
        source_width, source_height = inspect_image_size(source_path)
        model_name = UPSCALE_PRESETS[preset]
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path = (OUTPUT_DIR / output_name).resolve()
        output_root = OUTPUT_DIR.resolve()
        if output_root not in output_path.parents:
            raise ValueError("upscale output path must stay inside IDEOGRAM4_OUTPUT_DIR")

        cli_scale = 4
        cli_output_path = output_path
        if scale == 2:
            cli_output_path = output_path.with_name(f"{output_path.stem}.native4x{output_path.suffix}")
            if output_root not in cli_output_path.parents:
                raise ValueError("temporary upscale output path must stay inside IDEOGRAM4_OUTPUT_DIR")

        cmd = [
            str(bin_path),
            "-i",
            str(source_path),
            "-o",
            str(cli_output_path),
            "-m",
            model_dir,
            "-n",
            model_name,
            "-s",
            str(cli_scale),
            "-f",
            "png",
        ]

        start = time.time()
        proc = subprocess.run(
            cmd,
            cwd=str(bin_path.parent),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=UPSCALER_TIMEOUT_SECONDS,
            check=False,
        )
        seconds = time.time() - start
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "Real-ESRGAN failed").strip()
            raise RuntimeError(detail)
        if not cli_output_path.is_file():
            raise RuntimeError("Real-ESRGAN finished without writing an output image.")

        if cli_output_path != output_path:
            # The bundled x4 models can produce broken crops with direct 2x output.
            # Running native 4x first and resizing down keeps framing stable.
            target_size = (source_width * scale, source_height * scale)
            with Image.open(cli_output_path) as image:
                image.resize(target_size, Image.Resampling.LANCZOS).save(output_path, format="PNG")
            try:
                cli_output_path.unlink()
            except OSError:
                pass

        if not output_path.is_file():
            raise RuntimeError("Real-ESRGAN finished without writing an output image.")

        width, height = inspect_image_size(output_path)
        return UpscaleResult(
            output_path=output_path,
            width=width,
            height=height,
            seconds=seconds,
            stdout=proc.stdout,
            stderr=proc.stderr,
        )


_BACKENDS: dict[str, UpscalerBackend] = {
    RealEsrganNcnnBackend.backend_id: RealEsrganNcnnBackend(),
}


def get_upscaler_backend() -> UpscalerBackend:
    backend_id = UPSCALER_BACKEND
    backend = _BACKENDS.get(backend_id)
    if backend is None:
        supported = ", ".join(sorted(_BACKENDS))
        raise RuntimeError(f"Unknown {UPSCALER_BACKEND_ENV}={backend_id!r}. Supported: {supported}")
    return backend
