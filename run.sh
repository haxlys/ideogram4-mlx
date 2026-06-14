#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="$ROOT/.venv/bin/python"
PNPM="$(command -v pnpm)"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

SERVER_PORT="${IDEOGRAM4_SERVER_PORT:-8000}"
WEBUI_PORT="${IDEOGRAM4_WEBUI_PORT:-5173}"

stop_port() {
  local port="$1"
  local label="$2"
  local pids
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return
  fi

  echo "Stopping existing process on $label port $port..."
  kill $pids 2>/dev/null || true
  sleep 1

  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Force stopping process on $label port $port..."
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $SERVER_PID $WEBUI_PID 2>/dev/null
  wait $SERVER_PID $WEBUI_PID 2>/dev/null
  echo "Done."
}

trap cleanup EXIT INT TERM

echo "Installing Python dependencies..."
$VENV_PYTHON -m pip install -r "$ROOT/server/requirements.txt" -q

echo "Installing webui dependencies..."
(cd "$ROOT/webui" && $PNPM install --silent)

stop_port "$SERVER_PORT" "server"
stop_port "$WEBUI_PORT" "webui"

echo ""
echo "Starting server (port $SERVER_PORT) and webui (port $WEBUI_PORT)..."
echo "  API: http://localhost:$SERVER_PORT"
echo "  Web: http://localhost:$WEBUI_PORT"
echo ""

$VENV_PYTHON "$ROOT/server/main.py" &
SERVER_PID=$!

(cd "$ROOT/webui" && $PNPM run dev -- --port "$WEBUI_PORT") &
WEBUI_PID=$!

wait $SERVER_PID $WEBUI_PID
