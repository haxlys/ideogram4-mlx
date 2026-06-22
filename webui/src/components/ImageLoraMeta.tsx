import { Badge } from "@/components/ui/badge";
import { Layers2 } from "lucide-react";
import { appliedLorasFromImage, friendlyLoraName } from "@/lib/lora";
import { cn } from "@/lib/utils";
import type { ImageEntry } from "@/state/types";

interface ImageLoraMetaProps {
  image: Pick<ImageEntry, "lora_name" | "lora_strength" | "applied_loras">;
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

  if (loras.length === 0) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-1">
          <Layers2 className={cn("size-3", iconClass)} />
          <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px]", badgeClass)}>
            none
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1">
        <Layers2 className={cn("size-3", iconClass)} />
        {loras.map((lora) => (
          <Badge
            key={`${lora.name}-${lora.strength}`}
            variant="outline"
            className={badgeClass}
          >
            {friendlyLoraName(lora.name)}
            {lora.strength > 0 ? ` ${lora.strength}` : ""}
          </Badge>
        ))}
      </div>
    </div>
  );
}