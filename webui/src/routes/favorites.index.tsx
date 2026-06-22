import { createFileRoute } from "@tanstack/react-router";
import { FavoritesGrid } from "@/components/FavoritesGrid";
import { useFavorites } from "@/state/favoritesContext";

export const Route = createFileRoute("/favorites/")({
  component: FavoritesIndexPage,
});

function FavoritesIndexPage() {
  const { entries } = useFavorites();

  return (
    <div className="px-4 py-8">
      <div className="mb-5 flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          Favorites
        </h2>
        {entries.length > 0 && (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {entries.length}
          </span>
        )}
      </div>
      <p className="mb-6 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        Saved generations — each favorite keeps the image and its history settings together.
      </p>
      <FavoritesGrid />
    </div>
  );
}