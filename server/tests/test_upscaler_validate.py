"""Unit tests for upscaler validation (no GPU / CLI required)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from server.upscaler_backends import (
    RealEsrganNcnnBackend,
    UPSCALE_PRESETS,
    UpscalerConfigStatus,
    get_upscaler_backend,
)


class UpscalerValidateTests(unittest.TestCase):
    def test_invalid_scale(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            path = Path(handle.name)
        try:
            Image.new("RGB", (64, 64), color="red").save(path)
            backend = RealEsrganNcnnBackend()
            with self.assertRaises(ValueError) as ctx:
                backend.validate(path, 3, "standard")
            self.assertIn("scale must be 2 or 4", str(ctx.exception))
        finally:
            path.unlink(missing_ok=True)

    def test_invalid_preset_name(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            path = Path(handle.name)
        try:
            Image.new("RGB", (64, 64), color="red").save(path)
            backend = RealEsrganNcnnBackend()
            with self.assertRaises(ValueError) as ctx:
                backend.validate(path, 2, "neon")
            message = str(ctx.exception)
            self.assertIn("preset must be one of", message)
            for name in UPSCALE_PRESETS:
                self.assertIn(name, message)
        finally:
            path.unlink(missing_ok=True)

    def test_output_pixel_limit_when_configured(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            path = Path(handle.name)
        try:
            Image.new("RGB", (5000, 5000), color="blue").save(path)
            backend = RealEsrganNcnnBackend()
            ok_status = UpscalerConfigStatus(
                configured=True,
                bin_path="/tmp/realesrgan-ncnn-vulkan",
                model_dir="/tmp/models",
                available_presets=["standard"],
                backend="realesrgan_ncnn",
            )
            with patch.object(backend, "status", return_value=ok_status):
                with patch(
                    "server.upscaler_backends.UPSCALER_MAX_OUTPUT_PIXELS",
                    8192 * 8192,
                ):
                    with self.assertRaises(ValueError) as ctx:
                        backend.validate(path, 4, "standard")
                    self.assertIn("pixels", str(ctx.exception))
        finally:
            path.unlink(missing_ok=True)

    def test_unknown_backend_config(self) -> None:
        with patch("server.upscaler_backends.UPSCALER_BACKEND", "unknown_backend"):
            with self.assertRaises(RuntimeError) as ctx:
                get_upscaler_backend()
            self.assertIn("unknown_backend", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
