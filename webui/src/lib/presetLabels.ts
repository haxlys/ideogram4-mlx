import type { FormState } from "@/state/types";

export const PRESET_LABELS: Record<FormState["preset"], string> = {
  V4_TURBO_12: "Turbo (12 steps)",
  V4_DEFAULT_20: "Default (20 steps)",
  V4_QUALITY_48: "Quality (48 steps)",
};

export const PRESET_SHORT_LABELS: Record<FormState["preset"], string> = {
  V4_TURBO_12: "Turbo",
  V4_DEFAULT_20: "Default",
  V4_QUALITY_48: "Quality",
};

export function presetLabel(preset: string): string {
  return PRESET_LABELS[preset as FormState["preset"]] ?? preset;
}

export function presetShortLabel(preset: string): string {
  return PRESET_SHORT_LABELS[preset as FormState["preset"]] ?? preset;
}