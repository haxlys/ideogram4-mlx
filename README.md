# Ideogram 4 MLX WebUI

Local Ideogram 4 image generation for Apple Silicon using MLX-native weights.
The default model is `MLXBits/ideogram-4-mlx-q8`, an int8 MLX conversion of
Ideogram 4 intended for `mflux`.

## Architecture

```text
WebUI (:5173) -> FastAPI (:8000) -> Model daemon (:8001) -> mflux/MLX
```

- `server/model_daemon.py` owns the single local MLX model instance and handles
  load/unload, generation jobs, cancellation, short-lived artifacts, and local
  LoRA reloads.
- `server/mlx_runtime.py` resolves the Hugging Face or local MLX model path,
  loads the mflux Ideogram 4 runtime, tracks MLX memory, and runs image
  generation.
- `server/main.py` is the WebUI gateway and persistence layer. It stores prompts
  and generated images, runs Magic Prompt, and proxies generation work to the
  daemon.
- `webui/` is the React/Vite interface.
- `ideogram4_mlx.py` is the CLI. It uses the daemon by default and can run
  direct local MLX generation with `--daemon off`.

The FastAPI/WebUI generation contract stays stable: submit a structured caption,
width, height, preset, seed, and output format.

## Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r server/requirements.txt
cd webui && pnpm install
```

`server/requirements.txt` pins `mflux` to PR #445 commit
`8d80b9cb53688b62a2f814604b9f8b48987c5acd` because the MLXBits q8 loader is not
in the latest stable mflux release yet.

## Model Access

Default:

```bash
IDEOGRAM4_MODEL_REPO=MLXBits/ideogram-4-mlx-q8
```

For an already downloaded model directory:

```bash
IDEOGRAM4_MODEL_PATH=/path/to/ideogram-4-mlx-q8
```

The model root must contain `split_model.json`. If `IDEOGRAM4_MODEL_PATH` is not
set, the daemon downloads/verifies the Hugging Face repo with
`huggingface_hub.snapshot_download`.

The MLXBits conversion is distributed under the original Ideogram 4
Non-Commercial Model Agreement. Check the model card before using it outside
personal or research workflows.

## Run

```bash
./run.sh          # model daemon + FastAPI + WebUI
./run.sh backend  # restart FastAPI only
./run.sh client   # restart Vite only
```

Manual debugging:

```bash
set -a && source .env && set +a
.venv/bin/python server/model_daemon.py
.venv/bin/python server/main.py
cd webui && pnpm dev
```

CLI:

```bash
python3 ideogram4_mlx.py --prompt-file examples/caption.json --out examples/result.png
python3 ideogram4_mlx.py --daemon off --prompt-file examples/caption.json --out examples/result.png
```

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/model/status` | Daemon state, backend, model repo/path, quantization, MLX memory |
| `POST` | `/api/model/load` | Load the MLX model |
| `POST` | `/api/model/unload` | Unload the MLX model |
| `POST` | `/api/generate` | Start one local generation job |
| `GET` | `/api/status/{task_id}` | Poll generation progress |
| `POST` | `/api/cancel/{task_id}` | Request cancellation |
| `GET` | `/api/lora/status` | Local LoRA files and active stack |
| `POST` | `/api/lora/apply` | Reload model with a local LoRA stack |
| `POST` | `/api/lora/remove` | Reload model without LoRA |

Generation is single-slot. A second concurrent generation returns HTTP `409`.
LoRA apply/remove also uses the same model operation lock because mflux applies
LoRA at model load time.

## Configuration

See `.env.example` for all settings. Common values:

| Variable | Default | Description |
| --- | --- | --- |
| `IDEOGRAM4_MODEL_REPO` | `MLXBits/ideogram-4-mlx-q8` | Hugging Face MLX model repo |
| `IDEOGRAM4_MODEL_REVISION` | empty | Optional repo revision |
| `IDEOGRAM4_MODEL_PATH` | empty | Optional local model root containing `split_model.json` |
| `IDEOGRAM4_MLX_CACHE_LIMIT_GB` | empty | Optional MLX cache limit |
| `IDEOGRAM4_MODEL_DAEMON_AUTOLOAD` | `1` | Load model when daemon starts |
| `IDEOGRAM4_DEFAULT_PRESET` | `V4_QUALITY_48` | Default sampler preset |
| `IDEOGRAM4_MIN_IMAGE_SIZE` | `256` | Minimum API dimension |
| `IDEOGRAM4_MAX_IMAGE_SIZE` | `2048` | Maximum API dimension |
| `IDEOGRAM4_LORA_DIR` | `models/loras` | Local mflux-compatible LoRA files |

## Magic Prompt

`POST /api/magic-prompt` expands a plain idea into the structured JSON caption
Ideogram 4 expects. It uses the existing OpenAI-compatible provider abstraction
and local llama.cpp option. Caption validation now uses mflux's Ideogram 4
caption verifier instead of the old `ideogram4` Python package.

## Verification

```bash
python3 -m compileall server ideogram4_mlx.py
rg "torch|safetensors.torch|from ideogram4|import ideogram4" server ideogram4_mlx.py
cd webui && pnpm lint && pnpm build
```

With model files available, also verify:

```bash
curl http://127.0.0.1:8001/health
curl -X POST http://127.0.0.1:8001/model/load
curl http://127.0.0.1:8001/model/status
```
