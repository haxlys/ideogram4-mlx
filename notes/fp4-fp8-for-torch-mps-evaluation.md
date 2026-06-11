# fp4-fp8-for-torch-mps Evaluation

Date: 2026-06-11

## Conclusion
**NOT beneficial for this project.** Do not integrate.

## What it does
- Registers FP8/FP4 dtype support for PyTorch MPS via Metal shaders
- Monkey-patches `aten::mm`, `aten::matmul`, `aten::linear`, `aten::_to_copy` for MPS device
- Provides fused fp8 matmul kernel (`_scaled_mm`) on MPS

## Benchmarks (M4 Pro, macOS 26, PyTorch 2.12)

| Operation | CPU | MPS (with package) | Ratio |
|-----------|-----|-----|-------|
| Dequant 3M fp8 → bf16 | 3ms | 295ms | CPU 100x faster |
| Full pipeline (512px, TURBO_12) | 285s load + 175s gen | 290s load + timed out | Slower |

## Why it doesn't help
1. **CPU dequant is 100x faster** than per-element MPS dequant for weight loading
2. All weights are already dequantized to bf16 **before** inference — no fp8 tensors participate in matmul
3. The monkey-patched `aten::mm` adds redispatch overhead that slows bf16 matmul
4. PyTorch 2.12 already supports fp8→MPS memory transfer natively

## When it would help
- If ideogram4 pipeline supported **fp8 Linear layers** (keep weights fp8, fused dequant+matmul on GPU)
- For LLM inference where fp8 fused matmul can beat bf16 due to memory bandwidth savings
