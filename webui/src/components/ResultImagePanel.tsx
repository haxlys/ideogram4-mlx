import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ImageLoraMeta } from "@/components/ImageLoraMeta";
import { ImagePreviewLightbox } from "@/components/ImagePreviewLightbox";
import { PreviewableImage } from "@/components/PreviewableImage";
import { downloadImageFile } from "@/lib/image";
import type { ImageEntry } from "@/state/types";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Download, History, Maximize2, X } from "lucide-react";
import { toast } from "sonner";

interface ResultImagePanelProps {
  image: ImageEntry;
  onDismiss: () => void;
}

export function ResultImagePanel({ image, onDismiss }: ResultImagePanelProps) {
  const navigate = useNavigate();
  const [previewOpen, setPreviewOpen] = useState(false);
  const alt = image.hld?.slice(0, 100) ?? "Generated image";
  const promptId = image.historyLinked ? image.prompt_id : null;

  const handleOpenHistory = useCallback(() => {
    if (promptId == null) return;
    navigate({ to: "/history/$promptId", params: { promptId: String(promptId) } });
  }, [promptId, navigate]);

  const handleDownload = useCallback(async () => {
    try {
      await downloadImageFile(image.url, `ideogram4-${image.id}.png`);
    } catch {
      toast.error("Failed to download image");
    }
  }, [image.id, image.url]);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
          <h2 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[-0.01em] text-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Result
          </h2>
          <div className="flex items-center gap-0.5">
            <FavoriteButton
              imageId={image.id}
              className="text-amber-500 hover:text-amber-600"
            />
            {promptId != null && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open in history"
                onClick={handleOpenHistory}
              >
                <History className="size-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open preview"
              onClick={() => setPreviewOpen(true)}
            >
              <Maximize2 className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Download"
              onClick={() => void handleDownload()}
            >
              <Download className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss"
              onClick={onDismiss}
            >
              <X className="size-3" />
            </Button>
          </div>
        </div>

        <div className="p-3">
          <PreviewableImage
            src={image.url}
            alt={alt}
            onPreview={() => setPreviewOpen(true)}
            hint="Open image preview"
          />
          <ImageLoraMeta image={image} className="mt-2" />
          {promptId != null && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={handleOpenHistory}
            >
              <History className="size-3 mr-1.5" />
              Open in History
            </Button>
          )}
          {image.hld && (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
              {image.hld}
            </p>
          )}
        </div>
      </div>

      <ImagePreviewLightbox
        image={image}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}