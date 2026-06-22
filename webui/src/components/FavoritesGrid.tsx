import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { FavoriteRow } from "@/api/client";
import { GalleryImageCard } from "@/components/GalleryImageCard";
import { ImagePreviewLightbox } from "@/components/ImagePreviewLightbox";
import { MasonryGallery } from "@/components/MasonryGallery";
import { buttonVariants } from "@/components/ui/button";
import { favoriteThumbnailUrl } from "@/lib/favorites";
import { favoriteRowToImageEntry } from "@/lib/gallery";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/state/favoritesContext";
import type { ImageEntry } from "@/state/types";
import { LayoutGrid, Star } from "lucide-react";

import { presetShortLabel } from "@/lib/presetLabels";

function favoriteCaption(entry: FavoriteRow): string | undefined {
  const parts: string[] = [];
  if (entry.hld) parts.push(entry.hld.slice(0, 32));
  if (entry.preset) parts.push(presetShortLabel(entry.preset));
  if (entry.w != null && entry.h != null) parts.push(`${entry.w}×${entry.h}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function FavoritesEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-amber-500/10">
        <Star className="size-5 text-amber-500" />
      </div>
      <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
        No favorites yet
      </h3>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        Star a generation in History or Gallery to save the image and its settings together.
      </p>
      <Link
        to="/gallery"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5")}
      >
        <LayoutGrid className="size-3.5 mr-1.5" />
        Browse Gallery
      </Link>
    </div>
  );
}

export function FavoritesGrid() {
  const { entries } = useFavorites();
  const [previewImage, setPreviewImage] = useState<ImageEntry | null>(null);

  if (entries.length === 0) {
    return <FavoritesEmptyState />;
  }

  return (
    <>
      <MasonryGallery>
        {entries.map((entry) => (
          <GalleryImageCard
            key={entry.id}
            src={favoriteThumbnailUrl(entry)}
            alt={entry.hld.slice(0, 80) || "Favorite thumbnail"}
            imageId={entry.image_id}
            historyPromptId={
              entry.history_linked && entry.prompt_id != null ? entry.prompt_id : null
            }
            caption={favoriteCaption(entry)}
            previewHint={`Preview ${entry.hld.slice(0, 40) || "favorite"}`}
            onPreview={() => setPreviewImage(favoriteRowToImageEntry(entry))}
          />
        ))}
      </MasonryGallery>

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