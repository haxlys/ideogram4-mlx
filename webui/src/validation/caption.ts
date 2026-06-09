import type { FormState } from "@/state/types";

export function buildCaptionJson(form: FormState) {
  if (form.rawJson.trim()) {
    try {
      return JSON.parse(form.rawJson);
    } catch {
      // fall through to form-built JSON
    }
  }

  const cp = form.cp
    .split(",")
    .flatMap((s) => {
      const t = s.trim();
      return t ? [t] : [];
    });

  const style = {
    aesthetics: form.aes || undefined,
    lighting: form.light || undefined,
    medium: form.med,
    ...(form.med === "photograph"
      ? { photo: form.cam || undefined }
      : { art_style: form.cam || undefined }),
    ...(cp.length > 0 ? { color_palette: cp } : {}),
  };

  const elements: Record<string, unknown>[] = [];
  for (const el of form.els) {
    if (!el.type && !el.desc && !el.text) continue;
    const obj: Record<string, unknown> = { type: el.type };
    if (el.text) obj.text = el.text;
    if (el.bbox.trim()) obj.bbox = el.bbox.split(",").map(Number);
    if (el.desc) obj.desc = el.desc;
    elements.push(obj);
  }

  return {
    high_level_description: form.hld,
    style_description: style,
    compositional_deconstruction: {
      background: form.bg,
      elements,
    },
  };
}
