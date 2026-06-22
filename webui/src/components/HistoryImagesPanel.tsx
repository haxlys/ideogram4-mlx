import { useCallback, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ImagePreviewLightbox } from "@/components/ImagePreviewLightbox";
import { useHistoryImages, type HistoryImageItem } from "@/hooks/useHistoryImages";
import { formSeedFromImage } from "@/lib/image";
import { deleteImage } from "@/state/storage";
import { useAppState } from "@/state/context";
import { cn } from "@/lib/utils";
import { Images, Maximize2, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatImageTimestamp(createdAt: string): string {
  const date = new Date(createdAt.includes("T") ? createdAt : `${createdAt.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryImagesPanel() {
  const confirm = useConfirm();
  const { state, dispatch } = useAppState();
  const { promptId, images, previewImageId, loading } = useHistoryImages();
  const [previewImage, setPreviewImage] = useState<HistoryImageItem | null>(null);

  const handleSelect = useCallback((image: HistoryImageItem) => {
    dispatch({ type: "SHOW_RESULT", entry: image });
    const seed = formSeedFromImage(image.seed);
    if (seed) {
      dispatch({ type: "SET_FORM", form: { seed } });
    }
  }, [dispatch]);

  const handleDelete = useCallback(async (image: HistoryImageItem) => {
    if (promptId == null) return;
    const proceed = await confirm({
      title: `Delete image #${image.id}?`,
      description: "This removes the image from this history entry.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!proceed) return;

    try {
      await deleteImage(image.id);
      dispatch({ type: "REMOVE_IMAGE", imageId: image.id });

      if (state.resultImage?.id === image.id) {
        const remaining = images.filter((entry) => entry.id !== image.id);
        const next = remaining[0] ?? null;
        dispatch({ type: "SHOW_RESULT", entry: next });
        const seed = next ? formSeedFromImage(next.seed) : undefined;
        if (seed) {
          dispatch({ type: "SET_FORM", form: { seed } });
        }
      }

      dispatch({ type: "REFRESH_HISTORY" });
      dispatch({ type: "REFRESH_FAVORITES" });
      toast.success("Image deleted");
    } catch {
      toast.error("Failed to delete image");
    }
  }, [confirm, dispatch, images, promptId, state.resultImage]);

  if (promptId == null) return null;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-body-sm font-semibold text-foreground">
            <Images className="size-3.5 text-muted-foreground" />
            Images
            {images.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                {images.length}
              </Badge>
            )}
          </h2>
        </div>

        <div className="p-2">
          {loading && images.length === 0 ? (
            <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
              Loading images…
            </p>
          ) : images.length === 0 ? (
            <p className="px-1 py-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              No images linked yet. Regenerate to add versions.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {images.map((image) => {
                const selected = state.resultImage?.id === image.id;
                const isPreview = previewImageId === image.id;

                return (
                  <li key={image.id}>
                    <div
                      className={cn(
                        "group flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors",
                        selected
                          ? "border-foreground/20 bg-muted/60"
                          : "border-transparent hover:border-border hover:bg-muted/35",
                      )}
                    >
                      <button
                        type="button"
                        className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => handleSelect(image)}
                        aria-label={`Show image ${image.id}`}
                      >
                        <img
                          src={image.url}
                          alt={image.hld?.slice(0, 60) ?? `Image ${image.id}`}
                          className="size-full object-cover"
                        />
                        {selected && (
                          <span className="absolute inset-x-0 bottom-0 bg-foreground/75 py-0.5 text-center text-[9px] font-medium text-background">
                            Showing
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => handleSelect(image)}
                      >
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[11px] font-medium text-foreground">
                            #{image.id}
                          </span>
                          {isPreview && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                              Latest
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatImageTimestamp(image.createdAt) || image.time}
                        </p>
                        {image.seed != null && (
                          <p className="truncate text-[10px] text-muted-foreground/80">
                            seed {image.seed}
                          </p>
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <FavoriteButton
                          imageId={image.id}
                          className="text-amber-500 hover:text-amber-600"
                          size="icon-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Preview image ${image.id}`}
                          onClick={() => setPreviewImage(image)}
                        >
                          <Maximize2 className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete image ${image.id}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDelete(image)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ImagePreviewLightbox
        image={previewImage}
        open={previewImage != null}
        onOpenChange={(open) => {
          if (!open) setPreviewImage(null);
        }}
      />
    </>
  );
}