import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAppState } from "@/state/context";
import { getImages } from "@/api/client";
import { EditorWorkspace } from "@/components/EditorWorkspace";
import {
  findLatestDoneJobResult,
  formSeedFromImage,
  resolveHistoryResultEntry,
  shouldReplaceResultImage,
} from "@/lib/image";
import { invalidateImageCache, invalidatePromptsCache, loadPromptHistory } from "@/state/storage";
import { toast } from "sonner";

export const Route = createFileRoute("/history/$promptId")({
  component: HistoryPage,
});

function HistoryPage() {
  const { promptId } = Route.useParams();
  const { state, dispatch } = useAppState();
  const genQueueRef = useRef(state.genQueue);
  const resultImageRef = useRef(state.resultImage);

  useEffect(() => {
    genQueueRef.current = state.genQueue;
  }, [state.genQueue]);

  useEffect(() => {
    resultImageRef.current = state.resultImage;
  }, [state.resultImage]);

  useEffect(() => {
    const id = Number(promptId);
    if (!id) return;
    dispatch({ type: "SHOW_RESULT", entry: null });
  }, [promptId, dispatch]);

  useEffect(() => {
    const id = Number(promptId);
    if (!id) return;

    let cancelled = false;
    invalidatePromptsCache();
    invalidateImageCache();

    loadPromptHistory().then((entries) => {
      if (cancelled) return;
      const entry = entries.find((e) => e._id === id);
      if (!entry) {
        toast.error("Prompt not found");
        return;
      }
      const { _savedAt, _id, ...form } = entry;
      dispatch({ type: "RESTORE_FORM", form, promptId: _id ?? undefined });
      getImages({ promptId: _id! }).then((images) => {
        if (cancelled) return;

        const nextResult = resolveHistoryResultEntry({
          promptId: _id!,
          images,
          savedAt: _savedAt,
          genQueue: genQueueRef.current,
          currentResult: resultImageRef.current,
        });
        if (
          nextResult
          && shouldReplaceResultImage(resultImageRef.current, nextResult)
        ) {
          dispatch({ type: "SHOW_RESULT", entry: nextResult });
          const seed = formSeedFromImage(nextResult.seed);
          if (seed) {
            dispatch({ type: "SET_FORM", form: { seed } });
          }
        } else if (!nextResult && !resultImageRef.current) {
          dispatch({ type: "SHOW_RESULT", entry: null });
        }
      }).catch(() => {
        // Missing images should not prevent restoring the prompt.
      });
    });

    return () => {
      cancelled = true;
    };
  }, [promptId, dispatch, state.historyRefresh]);

  useEffect(() => {
    const id = Number(promptId);
    if (!id) return;

    const doneResult = findLatestDoneJobResult(state.genQueue, id);
    if (
      doneResult
      && shouldReplaceResultImage(state.resultImage, doneResult)
    ) {
      dispatch({ type: "SHOW_RESULT", entry: doneResult });
      const seed = formSeedFromImage(doneResult.seed);
      if (seed) {
        dispatch({ type: "SET_FORM", form: { seed } });
      }
    }
  }, [state.genQueue, state.resultImage, promptId, dispatch]);

  return <EditorWorkspace />;
}