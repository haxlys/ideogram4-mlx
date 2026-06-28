# Ideogram 4 SimpleTuner LoRA Pipeline

This repository keeps Ideogram 4 generation/runtime code in `ideogram4-mps`.
LoRA training is delegated to a local SimpleTuner checkout so this project stays
small, local-first, and open-source safe.

Private image datasets, subject configs, and generated training notes should not
be committed. Keep them under ignored paths such as `datasets/` and `local/`.

## Setup

Set the SimpleTuner checkout path when it is not located next to this repo:

```bash
export IDEOGRAM4_SIMPLETUNER_ROOT=/path/to/SimpleTuner
```

The pipeline entry point is:

```bash
.venv/bin/python scripts/ideogram_lora_pipeline.py --subject local/lora_subjects/my_subject.json validate
```

A generic wrapper is also available:

```bash
scripts/train_lora_subject.sh local/lora_subjects/my_subject.json --overwrite --steps 450,600,750
```

The wrapper preserves that short form as `all`. It also accepts explicit
pipeline commands:

```bash
scripts/train_lora_subject.sh local/lora_subjects/my_subject.json status
scripts/train_lora_subject.sh local/lora_subjects/my_subject.json monitor --interval 60
scripts/train_lora_subject.sh local/lora_subjects/my_subject.json preflight
scripts/train_lora_subject.sh local/lora_subjects/my_subject.json lint-dataset
```

## Subject Config

Use the public template as a starting point:

```bash
mkdir -p local/lora_subjects
cp configs/lora_subjects/example.identity.json local/lora_subjects/my_subject.json
```

Then edit the ignored local copy for your dataset, trigger token, output names,
and SimpleTuner paths.

Important fields:

| Field | Purpose |
| --- | --- |
| `subject_id` | Stable local identifier for this training run |
| `display_name` | Human-readable name shown in metadata |
| `caption_subject` | Caption phrase after the trigger token |
| `trigger_token` | Unique token to use in generation prompts |
| `source_dir` | Curated private source images in this repo |
| `source_manifest` | Optional CSV with source metadata and rights notes |
| `simpletuner_dataset_dir` | Prepared dataset path under SimpleTuner |
| `train_config` | Generated SimpleTuner training config |
| `output_dir` | SimpleTuner training output directory |
| `lora_output_prefix` | Exported `.safetensors` filename prefix |
| `training` | Rank, steps, learning rate, resolution, and optimizer knobs |

## Workflow

Validate resolved paths and source image count:

```bash
.venv/bin/python scripts/ideogram_lora_pipeline.py \
  --subject local/lora_subjects/my_subject.json \
  validate
```

Prepare the SimpleTuner dataset:

```bash
.venv/bin/python scripts/ideogram_lora_pipeline.py \
  --subject local/lora_subjects/my_subject.json \
  prepare --overwrite
```

This writes resized training images, `.txt` captions, and `metadata.json` to the
configured SimpleTuner dataset folder. A review `contact_sheet.jpg` is written
to a sibling `_reviews/` folder so it is not picked up as a training image.

Generate SimpleTuner configs:

```bash
.venv/bin/python scripts/ideogram_lora_pipeline.py \
  --subject local/lora_subjects/my_subject.json \
  configure
```

Dry-run the training command:

```bash
.venv/bin/python scripts/ideogram_lora_pipeline.py \
  --subject local/lora_subjects/my_subject.json \
  train --dry-run
```

Run the full prepare, configure, train, and export flow:

```bash
scripts/train_lora_subject.sh local/lora_subjects/my_subject.json --overwrite --steps 450,600,750
```

Resume from the latest SimpleTuner checkpoint after a dataset/config has already
been prepared:

```bash
scripts/train_lora_subject.sh local/lora_subjects/my_subject.json train --resume latest
```

The `all` and `train` commands run a local preflight check unless
`--skip-preflight` is supplied. Preflight reports active training processes,
other heavy local ML processes, macOS swap pressure, SimpleTuner path validity,
and output disk space. Use `--strict-preflight` to treat warnings as blockers.

Each real run writes a manifest under:

```bash
generated/lora_runs/<subject-id>/<timestamp>/manifest.json
```

The manifest records the subject/config hashes, dataset fingerprint, preflight
report, dataset lint result, command, resume mode, and export steps.

Exported LoRAs land in:

```bash
models/loras/
```

The WebUI groups exported files matching `SimpleTuner_*_rank*_step*.safetensors`
under the `Identity` LoRA family.

## Open-Source Hygiene

- Do not commit private source images, manifests, local configs, generated
  SimpleTuner datasets, training outputs, or generated research notes.
- Public configs should be templates only. Put real subject names, local paths,
  and trigger tokens in `local/lora_subjects/*.json`.
- Use rights-reviewed images before training or sharing LoRA weights.
- Keep subject filenames generic when publishing examples.
- Generated `.safetensors` identity LoRAs may encode likeness. Treat them as
  sensitive artifacts unless you have permission to share them.
