import { type CSSProperties, type KeyboardEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { FavoriteRow } from "@/api/client";
import { FavoriteButton } from "@/components/FavoriteButton";
import { MasonryGallery } from "@/components/MasonryGallery";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { favoriteThumbnailUrl } from "@/lib/favorites";
import { useFavorites } from "@/state/favoritesContext";
import { History, LayoutGrid, Star } from "lucide-react";

import { presetShortLabel } from "@/lib/presetLabels";

function aspectStyle(entry: FavoriteRow): CSSProperties | undefined {
  if (entry.w != null && entry.h != null && entry.w > 0 && entry.h > 0) {
    return { aspectRatio: `${entry.w} / ${entry.h}` };
  }
  return { aspectRatio: "4 / 3" };
}

function FavoriteCard({ entry }: { entry: FavoriteRow }) {
  const navigate = useNavigate();
  const thumbnail = favoriteThumbnailUrl(entry);
  const presetLabel = entry.preset ? presetShortLabel(entry.preset) : null;
  const historyPromptId = entry.history_linked && entry.prompt_id != null
    ? entry.prompt_id
    : null;

  const openFavorite = () => {
    navigate({
      to: "/favorites/$favoriteId",
      params: { favoriteId: String(entry.id) },
    });
  };

  const openHistory = () => {
    if (historyPromptId == null) return;
    navigate({
      to: "/history/$promptId",
      params: { promptId: String(historyPromptId) },
    });
  };

  const handleCardKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFavorite();
    }
  };

  return (
    <article className="group relative">
      <div
        role="button"
        tabIndex={0}
        className="relative block w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left shadow-card transition-all hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={aspectStyle(entry)}
        onClick={openFavorite}
        onKeyDown={handleCardKeyDown}
        aria-label={`Open favorite: ${entry.hld.slice(0, 60) || "untitled"}`}
      >
        <img
          src={thumbnail}
          alt={entry.hld.slice(0, 80) || "Favorite thumbnail"}
          className="size-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
          loading="lazy"
        />

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-2.5 pb-2 pt-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <p className="truncate text-[11px] font-medium text-white">
            {entry.hld.slice(0, 48) || "(empty)"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {historyPromptId != null && (
              <span className="inline-flex items-center gap-0.5 rounded bg-white/15 px-1.5 py-0.5 text-[10px] text-white/90">
                <History className="size-2.5" />
                History
              </span>
            )}
            {presetLabel && (
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] text-white/90">
                {presetLabel}
              </span>
            )}
            {entry.w != null && entry.h != null && (
              <span className="text-[10px] text-white/70">
                {entry.w}×{entry.h}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {historyPromptId != null && (
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
          imageId={entry.image_id}
          className="bg-background/85 text-amber-500 shadow-sm"
          size="icon-sm"
        />
      </div>
    </article>
  );
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

  if (entries.length === 0) {
    return <FavoritesEmptyState />;
  }

  return (
    <MasonryGallery>
      {entries.map((entry) => (
        <FavoriteCard key={entry.id} entry={entry} />
      ))}
    </MasonryGallery>
  );
}