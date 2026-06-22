import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getFavoriteApi } from "@/api/client";
import { useAppState } from "@/state/context";
import { EditorWorkspace } from "@/components/EditorWorkspace";
import {
  findLatestDoneJobResult,
  formSeedFromImage,
  imageEntryFromRow,
  shouldReplaceResultImage,
} from "@/lib/image";
import { invalidateImageCache, invalidatePromptsCache, loadPromptHistory } from "@/state/storage";
import { DEFAULT_FORM } from "@/state/types";
import { toast } from "sonner";

export const Route = createFileRoute("/favorites/$favoriteId")({
  component: FavoritePage,
});

function FavoritePage() {
  const { favoriteId } = Route.useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useAppState();
  const genQueueRef = useRef(state.genQueue);
  const resultImageRef = useRef(state.resultImage);
  const resultImagePinnedRef = useRef(state.resultImagePinned);
  const loadedRef = useRef(false);

  useEffect(() => {
    genQueueRef.current = state.genQueue;
  }, [state.genQueue]);

  useEffect(() => {
    resultImageRef.current = state.resultImage;
  }, [state.resultImage]);

  useEffect(() => {
    resultImagePinnedRef.current = state.resultImagePinned;
  }, [state.resultImagePinned]);

  useEffect(() => {
    loadedRef.current = false;
  }, [favoriteId]);

  useEffect(() => {
    const id = Number(favoriteId);
    if (!id) return;

    let cancelled = false;
    dispatch({ type: "SHOW_RESULT", entry: null });
    invalidatePromptsCache();
    invalidateImageCache();

    getFavoriteApi(id)
      .then(async (favorite) => {
        if (cancelled) return;

        if (favorite.history_linked && favorite.prompt_id != null) {
          const entries = await loadPromptHistory();
          if (cancelled) return;
          const entry = entries.find((e) => e._id === favorite.prompt_id);
          if (entry) {
            const { _id, ...form } = entry;
            void _id;
            dispatch({ type: "RESTORE_FORM", form, promptId: favorite.prompt_id ?? undefined });
          }
        } else {
          dispatch({
            type: "RESTORE_FORM",
            form: {
              ...DEFAULT_FORM,
              hld: favorite.hld,
              w: favorite.w ?? DEFAULT_FORM.w,
              h: favorite.h ?? DEFAULT_FORM.h,
              preset: (favorite.preset as typeof DEFAULT_FORM.preset) ?? DEFAULT_FORM.preset,
            },
            promptId: undefined,
          });
        }

        dispatch({
          type: "SHOW_RESULT",
          entry: imageEntryFromRow({
            id: favorite.image_id,
            hld: favorite.hld,
            prompt_id: favorite.prompt_id,
          }, undefined, favorite.history_linked),
        });
        loadedRef.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          if (!loadedRef.current) toast.error("Favorite not found");
          navigate({ to: "/favorites" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [favoriteId, dispatch, navigate, state.historyRefresh, state.favoritesRefresh]);

  useEffect(() => {
    const favId = Number(favoriteId);
    if (!favId) return;

    getFavoriteApi(favId).then((favorite) => {
      const promptId = favorite.prompt_id;
      if (promptId == null) return;

      const doneResult = findLatestDoneJobResult(genQueueRef.current, promptId);
      if (
        doneResult
        && shouldReplaceResultImage(
          resultImageRef.current,
          doneResult,
          resultImagePinnedRef.current,
        )
      ) {
        dispatch({ type: "SHOW_RESULT", entry: doneResult });
        const seed = formSeedFromImage(doneResult.seed);
        if (seed) {
          dispatch({ type: "SET_FORM", form: { seed } });
        }
      }
    }).catch(() => {});
  }, [state.genQueue, favoriteId, dispatch]);

  return <EditorWorkspace />;
}