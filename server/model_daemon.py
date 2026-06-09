#!/usr/bin/env python3
"""Model daemon: standalone process that owns the Ideogram 4 pipeline.
Survives API server restarts. Communicates via HTTP on port 8001.
"""
import json
import logging
import math
import os
import sys
import time
import threading
import uuid
import base64
from io import BytesIO
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import socketserver

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from logger import get_logger

logger = get_logger("daemon")

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


FP8_DTYPE = torch.float8_e4m3fn
DEFAULT_REPO = "ideogram-ai/ideogram-4-fp8"

_pipeline = None
_device = None
_snapshot = None
_state = "idle"
_state_msg = ""
_tasks: dict = {}
_lock = threading.Lock()


# ── model loading ────────────────────────────────────────────────

def _download_repo(repo_id: str) -> Path:
    logger.info("Downloading/verifying %s ...", repo_id)
    t0 = time.time()
    try:
        local = snapshot_download(repo_id)
    except Exception as e:
        logger.error("Failed to download %s: %s", repo_id, e)
        raise RuntimeError(f"Failed to download {repo_id}: {e}") from e
    logger.info("  done in %.1fs  ->  %s", time.time() - t0, local)
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
    logger.info("Loading text encoder (CPU dequant)...")
    t0 = time.time()
    cfg = AutoConfig.from_pretrained(str(snapshot / "text_encoder"), trust_remote_code=True)
    model = AutoModel.from_config(cfg, trust_remote_code=True)
    sd = sf.load_file(str(snapshot / "text_encoder" / "model.safetensors"), device="cpu")
    model.load_state_dict(_dequant_state_dict(sd), strict=False)
    model.to(device, dtype=torch.bfloat16).eval()
    logger.info("  done in %.1fs", time.time() - t0)
    return model


def _load_transformer(snapshot: Path, subdir: str, device):
    index_fn = f"{subdir}/diffusion_pytorch_model.safetensors.index.json"
    logger.info("Loading %s (CPU dequant)...", subdir)
    t0 = time.time()
    model = Ideogram4Transformer(Ideogram4Config())
    model.to(torch.bfloat16)
    model.load_state_dict(_load_and_dequant_shard(snapshot, index_fn), strict=False)
    model.to(device, dtype=torch.bfloat16).eval()
    n = sum(p.numel() for p in model.parameters())
    logger.info("  done in %.1fs, %.1fB params", time.time() - t0, n / 1e9)
    return model


def _load_vae(snapshot: Path, device):
    t0 = time.time()
    vae = _load_autoencoder(
        str(snapshot / "vae" / "diffusion_pytorch_model.safetensors"),
        device,
        torch.bfloat16,
    )
    logger.info("  VAE done in %.1fs", time.time() - t0)
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
    logger.info("Pipeline loaded in %.1fs", time.time() - t0)
    return pipe


# ── API actions ───────────────────────────────────────────────────

def handle_load():
    global _pipeline, _device, _snapshot, _state, _state_msg

    with _lock:
        if _state == "loaded" or _state == "loading":
            return {"ok": _state == "loaded", "msg": _state_msg}
        _state = "loading"
        _state_msg = "Starting model load..."

    logger.info("Model load requested")

    try:
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
        logger.info("Model loaded successfully")
        return {"ok": True, "msg": "Model loaded successfully."}

    except Exception as e:
        logger.exception("Model load failed")
        with _lock:
            _state = "idle"
            _state_msg = str(e)
        return {"ok": False, "msg": str(e)}


def handle_unload():
    global _pipeline, _device, _snapshot, _state, _state_msg
    logger.info("Model unload requested")
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
    logger.info("Model unloaded")
    return {"ok": True}


def handle_status():
    return {"state": _state, "msg": _state_msg}


def handle_generate(body: dict) -> dict:
    caption = body.get("caption", {})
    width = body.get("width", 1024)
    height = body.get("height", 1024)
    preset = body.get("preset", "V4_QUALITY_48")
    seed = body.get("seed", 20260608)

    task_id = uuid.uuid4().hex
    _tasks[task_id] = {"state": "running", "msg": "Queued...", "image": None, "progress": 0, "total_steps": 0}
    logger.info("Generation task %s started: %dx%d, %s, seed=%d", task_id, width, height, preset, seed)

    t = threading.Thread(
        target=_run_generate,
        args=(task_id, caption, width, height, preset, seed),
        daemon=True,
    )
    t.start()
    return {"task_id": task_id}


def _run_generate(task_id, caption, width, height, preset, seed):
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
        _tasks[task_id]["msg"] = f"Done in {gen_s:.1f}s"
        logger.info("Task %s done in %.1fs", task_id, gen_s)

        buf = BytesIO()
        images[0].save(buf, format="PNG")
        buf.seek(0)

        hld_text = json.loads(prompt_str).get("high_level_description", "") if isinstance(caption, dict) else ""

        _tasks[task_id]["state"] = "done"
        _tasks[task_id]["image_b64"] = base64.b64encode(buf.getvalue()).decode()
        _tasks[task_id]["image_meta"] = {
            "hld": hld_text,
            "width": width,
            "height": height,
            "preset": preset,
            "seed": seed,
        }

    except Exception as e:
        logger.exception("Generation task %s failed", task_id)
        _tasks[task_id]["state"] = "done"
        _tasks[task_id]["msg"] = f"Error: {e}"
        _tasks[task_id]["image"] = None


def handle_task_status(task_id):
    task = _tasks.get(task_id)
    if task is None:
        return {"state": "done", "msg": "Task not found.", "image": None, "progress": 0, "total_steps": 0}
    image = task.get("image")
    image_b64 = task.pop("image_b64", None)
    image_meta = task.pop("image_meta", None)
    return {
        "state": task["state"],
        "msg": task["msg"],
        "image": image,
        "image_b64": image_b64,
        "image_meta": image_meta,
        "progress": task.get("progress", 0),
        "total_steps": task.get("total_steps", 0),
    }


# ── HTTP server ───────────────────────────────────────────────────

ROUTES = {
    ("GET", "/model/status"): lambda _body: handle_status(),
    ("POST", "/model/load"): lambda _body: handle_load_fire(),
    ("POST", "/model/unload"): lambda _body: handle_unload(),
}


def handle_load_fire():
    if _state == "loaded" or _state == "loading":
        return {"ok": _state == "loaded", "msg": _state_msg}
    threading.Thread(target=handle_load, daemon=True).start()
    return {"ok": True, "msg": "Load started."}


class DaemonHandler(BaseHTTPRequestHandler):
    def _reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_POST(self):
        body = self._read_body()
        if self.path.startswith("/generate"):
            data = handle_generate(body)
            self._reply(200, data)
        else:
            key = ("POST", self.path)
            if key in ROUTES:
                self._reply(200, ROUTES[key](body))
            else:
                self._reply(404, {"error": "not found"})

    def do_GET(self):
        if self.path.startswith("/status/"):
            task_id = self.path.split("/status/", 1)[1]
            self._reply(200, handle_task_status(task_id))
        else:
            key = ("GET", self.path)
            if key in ROUTES:
                self._reply(200, ROUTES[key](None))
            else:
                self._reply(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        logger.debug("HTTP %s", args[0])


DAEMON_PORT = 8001


class ThreadingHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    """Multi-threaded HTTP server so load/generate don't block status calls."""
    allow_reuse_address = True
    daemon_threads = True


def run():
    if not torch.backends.mps.is_available():
        logger.error("MPS not available. Requires Apple Silicon.")
        sys.exit(1)

    server = ThreadingHTTPServer(("127.0.0.1", DAEMON_PORT), DaemonHandler)
    logger.info("Model daemon listening on 127.0.0.1:%s", DAEMON_PORT)
    logger.info("PID: %s", os.getpid())
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down.")


if __name__ == "__main__":
    run()
