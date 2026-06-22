import type { FavoriteRow } from "@/api/client";

export function favoriteThumbnailUrl(entry: FavoriteRow): string {
  return `/api/images/${entry.image_id}/file`;
}