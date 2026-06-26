import { Badge } from "@/components/ui/badge";
import { Dna, Gauge, Layers2 } from "lucide-react";
import { appliedLorasFromImage, friendlyLoraName } from "@/lib/lora";
import { presetShortLabel } from "@/lib/presetLabels";
import { cn } from "@/lib/utils";
import type { ImageEntry } from "@/state/types";

interface ImageLoraMetaProps {
  image: Pick<
    ImageEntry,
    "lora_name" | "lora_strength" | "applied_loras" | "seed" | "preset"
  >;
  className?: string;
  tone?: "default" | "on-dark";
}

export function ImageLoraMeta({ image, className, tone = "default" }: ImageLoraMetaProps) {
  const loras = appliedLorasFromImage(image);
  const onDark = tone === "on-dark";
  const iconClass = onDark ? "text-white/55" : "text-muted-foreground";
  const badgeClass = onDark
    ? "border-white/20 bg-white/10 text-white/90"
    : "h-auto max-w-full whitespace-normal px-1.5 py-0.5 text-[10px] leading-snug";
  const metaBadgeClass = cn(
    badgeClass,
    onDark ? "" : "h-4 px-1.5 text-[10px] tabular-nums",
  );

  const qualityLabel = image.preset ? presetShortLabel(image.preset) : null;
  const seedLabel =
    image.seed != null && Number.isFinite(image.seed) ? String(image.seed) : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {qualityLabel != null && (
        <div className="flex items-center gap-1">
          <Gauge className={cn("size-3 shrink-0", iconClass)} aria-hidden />
          <Badge variant="outline" className={metaBadgeClass}>
            {qualityLabel}
          </Badge>
        </div>
      )}
      {seedLabel != null && (
        <div className="flex items-center gap-1">
          <Dna className={cn("size-3 shrink-0", iconClass)} aria-hidden />
          <Badge variant="outline" className={metaBadgeClass}>
            {seedLabel}
          </Badge>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Layers2 className={cn("size-3 shrink-0", iconClass)} aria-hidden />
        {loras.length === 0 ? (
          <Badge variant="outline" className={metaBadgeClass}>
            none
          </Badge>
        ) : (
          loras.map((lora) => (
            <Badge
              key={`${lora.name}-${lora.strength}`}
              variant="outline"
              className={badgeClass}
            >
              {friendlyLoraName(lora.name)}
              {lora.strength > 0 ? ` ${lora.strength}` : ""}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}