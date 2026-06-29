"""Upscaler facade — delegates to the configured backend."""

from __future__ import annotations

from pathlib import Path

try:
    from .upscaler_backends import (
        UpscaleResult,
        UpscalerConfigStatus,
        get_upscaler_backend,
        inspect_image_size,
    )
except ImportError:  # pragma: no cover
    from upscaler_backends import (  # type: ignore
        UpscaleResult,
        UpscalerConfigStatus,
        get_upscaler_backend,
        inspect_image_size,
    )


def upscaler_status() -> UpscalerConfigStatus:
    return get_upscaler_backend().status()


def validate_upscale_request(source_path: Path, scale: int, preset: str) -> None:
    get_upscaler_backend().validate(source_path, scale, preset)


def run_upscale(
    *,
    source_path: Path,
    output_name: str,
    scale: int,
    preset: str,
) -> UpscaleResult:
    return get_upscaler_backend().run(
        source_path=source_path,
        output_name=output_name,
        scale=scale,
        preset=preset,
    )


__all__ = [
    "UpscaleResult",
    "UpscalerConfigStatus",
    "inspect_image_size",
    "run_upscale",
    "upscaler_status",
    "validate_upscale_request",
]