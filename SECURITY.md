# Security Policy

## Local-Only Scope

This project is designed as a local single-user application. The API has no
built-in account system or authentication layer.

Default bindings are loopback-only:

- FastAPI: `IDEOGRAM4_SERVER_HOST=127.0.0.1`
- WebUI: `IDEOGRAM4_WEBUI_HOST=127.0.0.1`
- CORS: local Vite origins only

If you expose the server on a LAN or the public internet, put it behind your
own access controls. The API includes expensive model operations and destructive
local actions such as deleting generated images.

## Secrets

Do not commit `.env`, Hugging Face tokens, LLM provider keys, model files, LoRA
weights, SQLite databases, or runtime logs. The default `.gitignore` excludes
these local artifacts.

Before publishing a fork, run a history-aware secret scan such as GitHub secret
scanning, gitleaks, or trufflehog.

## Model And LoRA Supply Chain

The project downloads Hugging Face model repositories and loads local weights
through the installed MLX/mflux runtime. Treat model files and LoRA weights as
trusted local inputs, and use `IDEOGRAM4_MODEL_REVISION` to pin a known model
commit when reproducibility or supply-chain review matters. LoRA files are
currently local `.safetensors` files under `IDEOGRAM4_LORA_DIR`; pin and review
their source repositories outside this app when provenance matters.

## Reporting

Please open a private security advisory or contact the maintainer privately for
issues involving credential exposure, arbitrary file access, or unintended
network exposure.
