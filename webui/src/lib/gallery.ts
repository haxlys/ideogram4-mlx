import type { FavoriteRow } from "@/api/client";
import { favoriteThumbnailUrl } from "@/lib/favorites";
import type { ImageEntry } from "@/state/types";

export function favoriteRowToImageEntry(entry: FavoriteRow): ImageEntry {
  const createdAt = entry.created_at.includes("T")
    ? entry.created_at
    : `${entry.created_at.replace(" ", "T")}Z`;

  return {
    id: entry.image_id,
    url: favoriteThumbnailUrl(entry),
    hld: entry.hld,
    time: new Date(createdAt).toLocaleTimeString(),
    prompt_id: entry.prompt_id,
    historyLinked: entry.history_linked,
  };
}

export function galleryImageHistoryPromptId(
  image: Pick<ImageEntry, "historyLinked" | "prompt_id">,
): number | null {
  return image.historyLinked && image.prompt_id != null ? image.prompt_id : null;
}