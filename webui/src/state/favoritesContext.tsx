import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  addFavoriteApi,
  getFavorites,
  removeFavoriteApi,
  type FavoriteRequest,
  type FavoriteRow,
} from "@/api/client";
import { useAppState } from "@/state/context";
import { toast } from "sonner";

interface FavoritesContextValue {
  entries: FavoriteRow[];
  isFavoriteImage: (imageId: number) => boolean;
  isFavoritePrompt: (promptId: number) => boolean;
  toggleFavorite: (target: FavoriteRequest) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useAppState();
  const [entries, setEntries] = useState<FavoriteRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    getFavorites()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [state.favoritesRefresh]);

  const favoriteImageIds = useMemo(
    () => new Set(entries.map((entry) => entry.image_id)),
    [entries],
  );

  const favoriteByPromptId = useMemo(() => {
    const map = new Map<number, number>();
    for (const entry of entries) {
      if (entry.prompt_id != null) {
        map.set(entry.prompt_id, entry.image_id);
      }
    }
    return map;
  }, [entries]);

  const isFavoriteImage = useCallback(
    (imageId: number) => favoriteImageIds.has(imageId),
    [favoriteImageIds],
  );

  const isFavoritePrompt = useCallback(
    (promptId: number) => favoriteByPromptId.has(promptId),
    [favoriteByPromptId],
  );

  const toggleFavorite = useCallback(
    async (target: FavoriteRequest) => {
      const wasFavorite = target.image_id != null
        ? favoriteImageIds.has(target.image_id)
        : target.prompt_id != null
          ? favoriteByPromptId.has(target.prompt_id)
          : false;

      try {
        if (wasFavorite) {
          await removeFavoriteApi(target);
          setEntries((prev) =>
            prev.filter((entry) => {
              if (target.image_id != null) return entry.image_id !== target.image_id;
              if (target.prompt_id != null) return entry.prompt_id !== target.prompt_id;
              return true;
            }),
          );
          toast.success("Removed from favorites");
        } else {
          const row = await addFavoriteApi(target);
          setEntries((prev) => [row, ...prev.filter((e) => e.image_id !== row.image_id)]);
          toast.success("Added to favorites");
        }
        dispatch({ type: "REFRESH_FAVORITES" });
      } catch {
        toast.error(wasFavorite ? "Failed to remove favorite" : "Failed to add favorite");
      }
    },
    [dispatch, favoriteByPromptId, favoriteImageIds],
  );

  const value = useMemo(
    () => ({ entries, isFavoriteImage, isFavoritePrompt, toggleFavorite }),
    [entries, isFavoriteImage, isFavoritePrompt, toggleFavorite],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return ctx;
}