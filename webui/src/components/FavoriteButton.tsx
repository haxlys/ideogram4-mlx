import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/state/favoritesContext";

interface FavoriteButtonProps {
  imageId?: number;
  promptId?: number;
  className?: string;
  size?: "icon-xs" | "icon-sm";
  labeled?: boolean;
}

export function FavoriteButton({
  imageId,
  promptId,
  className,
  size = "icon-sm",
  labeled = false,
}: FavoriteButtonProps) {
  const { isFavoriteImage, isFavoritePrompt, toggleFavorite } = useFavorites();
  const active = imageId != null
    ? isFavoriteImage(imageId)
    : promptId != null
      ? isFavoritePrompt(promptId)
      : false;

  const target = imageId != null
    ? { image_id: imageId }
    : promptId != null
      ? { prompt_id: promptId }
      : null;

  return (
    <Button
      type="button"
      variant="ghost"
      size={labeled ? "sm" : size}
      className={
        (active ? "text-amber-500 hover:text-amber-600 " : "")
        + (className ?? "")
      }
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={active}
      disabled={target == null}
      onClick={(e) => {
        e.stopPropagation();
        if (target) void toggleFavorite(target);
      }}
    >
      <Star
        className={labeled ? "size-3.5 mr-1.5" : "size-3.5"}
        fill={active ? "currentColor" : "none"}
        strokeWidth={active ? 1.5 : 2}
      />
      {labeled && (active ? "Favorited" : "Favorite")}
    </Button>
  );
}