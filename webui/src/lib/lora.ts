export interface AppliedLoraRef {
  name: string;
  strength: number;
}

function friendlySimpleTunerSubject(subject: string) {
  return subject.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function friendlyLoraName(name: string) {
  const simpleTuner = name.match(
    /^SimpleTuner_(.+?)(?:_v(\d+))?_rank(\d+)(?:_(\d+))?_step(\d+)\.safetensors$/i,
  );
  if (simpleTuner) {
    const [, subject, version, rank, resolution, step] = simpleTuner;
    return [
      friendlySimpleTunerSubject(subject),
      version ? `v${version}` : null,
      `r${rank}`,
      resolution ?? null,
      `step${step}`,
    ].filter(Boolean).join(" ");
  }
  return name
    .replace("Realism_Engine_Ideogram_", "Realism ")
    .replace("Realism_Engine_", "Realism ")
    .replace(".safetensors", "")
    .replace("zjourneyv", "zjourney V");
}

export function formatLoraLabel(
  appliedLoras?: AppliedLoraRef[] | null,
  loraName?: string | null,
  loraStrength?: number | null,
): string | null {
  if (appliedLoras && appliedLoras.length > 0) {
    return appliedLoras
      .map((lora) => `${friendlyLoraName(lora.name)} ${lora.strength}`)
      .join(" + ");
  }
  if (!loraName) return null;
  const names = loraName.split(" + ").map(friendlyLoraName);
  if (loraStrength != null && loraStrength > 0 && names.length === 1) {
    return `${names[0]} ${loraStrength}`;
  }
  return names.join(" + ");
}

export function appliedLorasFromImage(image: {
  applied_loras?: AppliedLoraRef[] | null;
  lora_name?: string | null;
  lora_strength?: number | null;
}): AppliedLoraRef[] {
  if (image.applied_loras && image.applied_loras.length > 0) {
    return image.applied_loras;
  }
  if (!image.lora_name) return [];
  return image.lora_name.split(" + ").map((name) => ({
    name: name.trim(),
    strength: image.lora_strength ?? 0,
  }));
}
