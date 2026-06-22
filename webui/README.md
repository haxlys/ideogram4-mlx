# Ideogram 4 MLX WebUI

React + TypeScript + Vite + TanStack Router frontend for the local Ideogram 4
MLX app.

The WebUI talks to the FastAPI server through Vite's `/api/*` dev proxy. By
default the app runs at `http://localhost:5173` and proxies API calls to
`http://localhost:8000`. `vite.config.ts` reads `IDEOGRAM4_SERVER_PORT`, and
`../run.sh` reads both `IDEOGRAM4_SERVER_PORT` and `IDEOGRAM4_WEBUI_PORT`.

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
```

Use `pnpm`, not npm or yarn.

For full-stack local launch, prefer:

```bash
cd ..
./run.sh
```

## Runtime Notes

- Routes:
  - `/` is the editor workspace.
  - `/gallery` lists persisted generated images.
  - `/history/$promptId` restores a saved prompt and shows linked images.
  - `/favorites` and `/favorites/$favoriteId` show favorited images/prompts.
- Generation uses a client-side queue: multiple jobs can be queued, reordered,
  or cancelled, but the model daemon still runs one generation at a time.
  Progress and queue status appear in the bottom dock panel without blocking
  the editor. Direct concurrent generation still resolves at the daemon as a
  single local slot; if the slot is busy, the client retries after a short delay.
  Running jobs can be cancelled via `POST /api/cancel/{task_id}`.
- Prompt history, image records, favorites, and the latest editor form are
  stored through the FastAPI SQLite-backed endpoints. Generated files are served
  through `/outputs/*` or `/api/images/{image_id}/file`.
- LoRA preset downloads, apply/remove reloads, and their progress polling are
  exposed through `/api/lora/*`; the frontend expects apply/remove to return a
  task id and then polls `/api/lora/operation/{task_id}`.
- If raw JSON is present in the caption editor, that JSON object is submitted
  directly for generation.
- Form state uses `useReducer` plus controlled inputs; do not add
  `react-hook-form`/`zod` usage just because they appear in older dependency
  history.
- The generated `src/routeTree.gen.ts` file is maintained by TanStack Router.
  Temporary files under `.tanstack/tmp/` can appear during dev/build runs and
  are not hand-authored source.

See `../README.md` and `../AGENTS.md` for architecture, environment variables,
and server behavior.
