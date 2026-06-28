#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-$ROOT/.venv/bin/python}"

if [[ $# -lt 1 ]]; then
  echo "usage: scripts/train_lora_subject.sh <subject-config.json> [command] [pipeline-options...]"
  echo "example: scripts/train_lora_subject.sh local/lora_subjects/my_subject.json --overwrite --steps 450,600,750"
  echo "example: scripts/train_lora_subject.sh local/lora_subjects/my_subject.json status"
  exit 2
fi

SUBJECT_CONFIG="$1"
shift

if [[ "$SUBJECT_CONFIG" != /* ]]; then
  SUBJECT_CONFIG="$ROOT/$SUBJECT_CONFIG"
fi

COMMAND="all"
if [[ $# -gt 0 && "$1" != -* ]]; then
  COMMAND="$1"
  shift
fi

exec "$PYTHON" "$ROOT/scripts/ideogram_lora_pipeline.py" --subject "$SUBJECT_CONFIG" "$COMMAND" "$@"
