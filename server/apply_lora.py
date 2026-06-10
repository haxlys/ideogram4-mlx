#!/usr/bin/env python3
"""Apply Lokr-format LoRA to Ideogram4Transformer state dict."""

import re
import torch
import safetensors.torch as sf


def apply_lokr_lora(state_dict: dict, lora_path: str, strength: float = 0.6) -> dict:
    """Merge Lokr-format LoRA weights into model state dict in-place.

    Lokr: Low-rank Kronecker decomposition with factor R=4.
      w1: [R, R] kernel
      w2: block(s) — shape varies by submodule
    """
    lora_sd = sf.load_file(lora_path)
    device = None
    for v in state_dict.values():
        if hasattr(v, "device"):
            device = v.device
            break
    if device is None:
        device = torch.device("cpu")
    factor = 4

    groups = {}
    for key, tensor in lora_sd.items():
        m = re.match(r"diffusion_model\.layers\.(\d+)\.(.+)\.(lokr_w1|lokr_w2|alpha)", key)
        if not m:
            continue
        layer = int(m.group(1))
        submod = m.group(2)
        part = m.group(3)
        groups.setdefault((layer, submod), {})[part] = tensor

    merged = 0
    for (layer, submod), parts in groups.items():
        w1 = parts["lokr_w1"].to(device, dtype=torch.float32)        # [4, 4]
        w2 = parts["lokr_w2"].to(device, dtype=torch.float32)
        model_key = f"layers.{layer}.{submod}.weight"

        if model_key not in state_dict:
            continue

        weight = state_dict[model_key].to(torch.float32)
        out_dim, in_dim = weight.shape
        p, q = out_dim // factor, in_dim // factor
        delta = torch.zeros_like(weight)

        w2_shape = w2.shape  # pyright: ignore[reportAttributeAccessIssue]

        if w2_shape == (out_dim, in_dim):
            w2_grid = w2.view(factor, p, factor, q).permute(0, 2, 1, 3)
            for i in range(factor):
                for j in range(factor):
                    delta[i * p : (i + 1) * p, j * q : (j + 1) * q] += w1[i, j] * w2_grid[i, j]
        elif w2_shape == (out_dim, q):
            w2_row = w2.view(factor, p, q)
            for i in range(factor):
                for j in range(factor):
                    delta[i * p : (i + 1) * p, j * q : (j + 1) * q] += w1[i, j] * w2_row[i]
        elif w2_shape == (p, q):
            for i in range(factor):
                for j in range(factor):
                    delta[i * p : (i + 1) * p, j * q : (j + 1) * q] += w1[i, j] * w2
        else:
            continue

        weight.add_(delta * strength)
        state_dict[model_key] = weight.to(state_dict[model_key].dtype)
        merged += 1

    return state_dict


def apply_std_lora(state_dict: dict, lora_path: str, strength: float = 1.0) -> dict:
    """Merge standard LoRA (lora_A/lora_B) weights into model state dict."""
    lora_sd = sf.load_file(lora_path)
    device = None
    for v in state_dict.values():
        if hasattr(v, "device"):
            device = v.device
            break
    if device is None:
        device = torch.device("cpu")

    groups = {}
    for key, tensor in lora_sd.items():
        m = re.match(r"diffusion_model\.layers\.(\d+)\.(.+)\.(lora_A|lora_B)\.weight", key)
        if not m:
            continue
        layer = int(m.group(1))
        submod = m.group(2)
        part = m.group(3)
        groups.setdefault((layer, submod), {})[part] = tensor

    merged = 0
    skipped = 0
    for (layer, submod), parts in groups.items():
        if "lora_A" not in parts or "lora_B" not in parts:
            continue
        lora_A = parts["lora_A"].to(device, dtype=torch.float32)
        lora_B = parts["lora_B"].to(device, dtype=torch.float32)
        rank = lora_A.shape[0]
        delta = (lora_B @ lora_A) * (strength / rank)

        model_key = f"layers.{layer}.{submod}.weight"
        if model_key not in state_dict:
            skipped += 1
            continue

        weight = state_dict[model_key].to(torch.float32)
        if delta.shape == weight.shape:
            weight.add_(delta)
            state_dict[model_key] = weight.to(state_dict[model_key].dtype)
            merged += 1
        else:
            skipped += 1

    return state_dict
