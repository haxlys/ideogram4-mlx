import { useNavigate } from "@tanstack/react-router";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ImageUpscaleButton } from "@/components/ImageUpscaleButton";
import { PreviewableImage } from "@/components/PreviewableImage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImageEntry } from "@/state/types";
import { History, Trash2 } from "lucide-react";

export interface GalleryImageCardProps {
  src: string;
  alt: string;
  imageId: number;
  image?: ImageEntry;
  onPreview: () => void;
  historyPromptId?: number | null;
  caption?: string;
  previewHint?: string;
  onUpscaleComplete?: (image: ImageEntry) => void;
  onDelete?: () => void;
  deleteLabel?: string;
  className?: string;
  imageClassName?: string;
  borderClassName?: string;
}

export function GalleryImageCard({
  src,
  alt,
  imageId,
  image,
  onPreview,
  historyPromptId = null,
  caption,
  previewHint,
  onUpscaleComplete,
  onDelete,
  deleteLabel = "Delete image",
  className,
  imageClassName = "h-auto",
  borderClassName,
}: GalleryImageCardProps) {
  const navigate = useNavigate();
  const showHistory = historyPromptId != null;

  const openHistory = () => {
    if (historyPromptId == null) return;
    navigate({
      to: "/history/$promptId",
      params: { promptId: String(historyPromptId) },
    });
  };

  return (
    <article className="group relative break-inside-avoid">
      <PreviewableImage
        src={src}
        alt={alt}
        onPreview={onPreview}
        className={cn("rounded-lg border border-border", borderClassName, className)}
        imageClassName={imageClassName}
        caption={caption}
        hint={previewHint ?? `Preview ${alt}`}
        loading="lazy"
      />

      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {showHistory && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="bg-background/85 shadow-sm"
            aria-label="Open in history"
            onClick={(e) => {
              e.stopPropagation();
              openHistory();
            }}
          >
            <History className="size-3" />
          </Button>
        )}
        <FavoriteButton
          imageId={imageId}
          className="bg-background/85 text-amber-500 shadow-sm"
          size="icon-sm"
        />
        {image && (
          <ImageUpscaleButton
            image={image}
            className="text-foreground"
            size="icon-sm"
            onComplete={onUpscaleComplete}
          />
        )}
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            size="icon-xs"
            className="bg-background/85 shadow-sm"
            aria-label={deleteLabel}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>
    </article>
  );
}
