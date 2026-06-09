#!/usr/bin/env python3
"""FastAPI server — thin proxy to model_daemon on port 8001.
The daemon owns the pipeline. This server can restart without losing the model.
"""
import base64
import logging
import threading
import time
import uuid
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import init_db, get_images, delete_image, get_prompts, save_prompt, delete_prompt, get_last_form, save_last_form, add_image, OUTPUT_DIR
from logger import get_logger, get_log_file

logger = get_logger("server")

DAEMON_URL = "http://127.0.0.1:8001"

app = FastAPI(title="Ideogram 4 MPS Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    logger.info("FastAPI server started")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    dt = (time.time() - t0) * 1000
    logger.debug("%s %s → %s (%.1fms)", request.method, request.url.path, response.status_code, dt)
    return response

_client = httpx.Client(timeout=10)


@app.get("/api/model/status")
def model_status():
    try:
        r = _client.get(f"{DAEMON_URL}/model/status")
        return r.json()
    except Exception:
        logger.debug("Daemon unreachable for status check")
        return {"state": "idle", "msg": "Daemon unreachable."}


@app.post("/api/model/load")
def post_load_model():
    logger.info("Model load requested via API")
    try:
        r = _client.post(f"{DAEMON_URL}/model/load", timeout=5)
        return r.json()
    except Exception:
        logger.debug("Daemon busy, queuing background load retry")
        def _load_bg():
            for attempt in range(30):
                try:
                    with httpx.Client(timeout=5) as c2:
                        c2.post(f"{DAEMON_URL}/model/load")
                    return
                except Exception:
                    time.sleep(10)
        threading.Thread(target=_load_bg, daemon=True).start()
        return {"ok": True, "msg": "Load request queued (daemon busy, will retry)."}


@app.post("/api/model/unload")
def post_unload_model():
    try:
        r = _client.post(f"{DAEMON_URL}/model/unload")
        return r.json()
    except Exception:
        return {"ok": False, "msg": "Daemon unreachable."}


class VerifyRequest(BaseModel):
    caption: dict


@app.post("/api/verify")
def api_verify(req: VerifyRequest):
    try:
        from ideogram4.caption_verifier import CaptionVerifier
        verifier = CaptionVerifier()
        warnings = verifier.verify(req.caption)
        return {"valid": len(warnings) == 0, "warnings": warnings}
    except Exception:
        return {"valid": True, "warnings": []}


class GenerateRequest(BaseModel):
    caption: dict
    width: int = 1024
    height: int = 1024
    preset: str = "V4_QUALITY_48"
    seed: int = 20260608


@app.post("/api/generate")
def api_generate(req: GenerateRequest):
    logger.info("Generate request: %dx%d, %s, seed=%d", req.width, req.height, req.preset, req.seed)
    r = _client.post(
        f"{DAEMON_URL}/generate",
        json={"caption": req.caption, "width": req.width, "height": req.height, "preset": req.preset, "seed": req.seed},
        timeout=10,
    )
    return r.json()


@app.get("/api/status/{task_id}")
def api_task_status(task_id: str):
    r = _client.get(f"{DAEMON_URL}/status/{task_id}")
    data = r.json()
    image_b64 = data.pop("image_b64", None)
    if image_b64:
        meta = data.pop("image_meta", {}) or {}
        image_bytes = base64.b64decode(image_b64)
        timestamp = uuid.uuid4().hex[:12]
        filename = f"{timestamp}.png"
        filepath = OUTPUT_DIR / filename
        filepath.write_bytes(image_bytes)
        image_id = add_image(
            meta.get("hld", ""),
            meta.get("width", 1024),
            meta.get("height", 1024),
            meta.get("preset", "V4_QUALITY_48"),
            meta.get("seed", 0),
            str(filepath),
        )
        data["image"] = {
            "id": image_id,
            "url": f"/api/images/{image_id}/file",
            "hld": meta.get("hld", ""),
            "time": time.strftime("%H:%M:%S"),
        }
    return data


@app.get("/outputs/{path:path}")
def serve_output(path: str):
    from fastapi.responses import FileResponse
    import os
    full = os.path.join("outputs", path)
    if os.path.isfile(full):
        return FileResponse(full)
    return {"error": "not found"}


@app.get("/api/images")
def api_get_images():
    return get_images()

@app.post("/api/images")
def api_add_image(req: dict):
    from pydantic import BaseModel
    class AddReq(BaseModel):
        hld: str = ""
        width: int = 1024
        height: int = 1024
        preset: str = "V4_QUALITY_48"
        seed: int = 0
        file_path: str
    body = AddReq(**req)
    from db import add_image as db_add_image
    img_id = db_add_image(body.hld, body.width, body.height, body.preset, body.seed, body.file_path)
    return {"id": img_id}

@app.delete("/api/images/{image_id}")
def api_delete_image(image_id: int):
    ok = delete_image(image_id)
    return {"ok": ok}

@app.get("/api/images/{image_id}/file")
def api_serve_image(image_id: int):
    rows = get_images()
    for r in rows:
        if r.get("id") == image_id:
            from fastapi.responses import FileResponse
            path = r["file_path"]
            import os
            if os.path.isfile(path):
                return FileResponse(path)
    return {"error": "not found"}

@app.get("/api/prompts")
def api_get_prompts():
    return get_prompts()

@app.post("/api/prompts")
def api_save_prompt(req: dict):
    from pydantic import BaseModel
    class PReq(BaseModel):
        hld: str
        form_json: str
    body = PReq(**req)
    pid = save_prompt(body.hld, body.form_json)
    return {"id": pid}

@app.delete("/api/prompts/{prompt_id}")
def api_delete_prompt(prompt_id: int):
    ok = delete_prompt(prompt_id)
    return {"ok": ok}

@app.get("/api/form")
def api_get_last_form():
    fj = get_last_form()
    return {"form_json": fj}

@app.post("/api/form")
def api_save_last_form(req: dict):
    save_last_form(req["form_json"])
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    log_file = get_log_file()
    if log_file:
        uvicorn_fh = logging.FileHandler(str(log_file), encoding="utf-8")
        uvicorn_fh.setLevel(logging.DEBUG)
        uvicorn_fh.setFormatter(logging.Formatter(
            "%(asctime)s  %(levelname)-7s  [uvicorn] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
        ))
        for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            ulog = logging.getLogger(name)
            ulog.handlers.clear()
            ulog.addHandler(uvicorn_fh)
            ulog.setLevel(logging.DEBUG)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
