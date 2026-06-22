import { createFileRoute } from "@tanstack/react-router";
import { FavoritesGrid } from "@/components/FavoritesGrid";
import { useFavorites } from "@/state/favoritesContext";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/favorites/")({
  component: FavoritesIndexPage,
});

function FavoritesIndexPage() {
  const { entries } = useFavorites();

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-8">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-title font-semibold text-foreground">
            Favorites
          </h2>
          {entries.length > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {entries.length}
            </Badge>
          )}
        </div>
        <p className="mb-6 max-w-xl text-body-sm leading-relaxed text-muted-foreground">
          Saved generations — each favorite keeps the image and its settings together.
        </p>
        <FavoritesGrid />
      </div>
    </div>
  );
}