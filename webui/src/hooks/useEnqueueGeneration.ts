import { useCallback } from "react";
import { verifyCaption } from "@/api/client";
import { useConfirm } from "@/components/ConfirmDialogProvider";
import { useAppState } from "@/state/context";
import type { FormState, GenJob, HistoryLinkMode } from "@/state/types";
import { MAX_GEN_QUEUE_SIZE } from "@/state/types";
import { randomSeed } from "@/lib/seed";
import { getCaptionForGeneration, getCaptionHld } from "@/validation/caption";
import { toast } from "sonner";

export interface EnqueueOptions {
  historyLink: HistoryLinkMode;
  /** When true, picks a fresh seed and updates the form before enqueueing. */
  newSeed?: boolean;
}

function isPendingJob(job: GenJob) {
  return (
    job.status === "queued"
    || job.status === "waiting"
    || job.status === "submitting"
    || job.status === "running"
  );
}

export function useEnqueueGeneration() {
  const { state, dispatch } = useAppState();
  const confirm = useConfirm();

  const hasPendingJobs = state.genQueue.some(isPendingJob);
  const canGenerate = state.modelState === "loaded";
  const hasActiveHistory = state.selectedPromptId != null;

  const enqueue = useCallback(async (options: EnqueueOptions) => {
    if (!canGenerate) {
      toast.error("Model is not loaded. Please load the model first.");
      return;
    }

    if (state.genQueue.length >= MAX_GEN_QUEUE_SIZE) {
      toast.error(`Queue is full (max ${MAX_GEN_QUEUE_SIZE}).`);
      return;
    }

    const { historyLink, newSeed = false } = options;

    if (historyLink === "regenerate" && state.selectedPromptId == null) {
      toast.error("Open a history entry to regenerate.");
      return;
    }

    let caption: Record<string, unknown>;
    try {
      caption = getCaptionForGeneration(state.form);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Raw JSON is invalid.");
      return;
    }

    if (!state.form.rawJson.trim()) {
      try {
        const verifyRes = await verifyCaption(caption);
        if (!verifyRes.valid && verifyRes.warnings.length > 0) {
          const proceed = await confirm({
            title: "Caption verification warnings",
            description: verifyRes.warnings.join("\n"),
            confirmLabel: "Proceed anyway",
          });
          if (!proceed) return;
        }
      } catch {
        // Verification is best-effort; generation can still proceed.
      }
    }

    try {
      const resolvedSeed = newSeed
        ? randomSeed()
        : state.form.seed.trim()
          ? Number(state.form.seed)
          : randomSeed();
      const seedForForm = String(resolvedSeed);

      if (newSeed || !state.form.seed.trim()) {
        dispatch({ type: "SET_FORM", form: { seed: seedForForm } });
      }

      const label = getCaptionHld(caption, state.form.hld).trim() || "Untitled";
      const formSnapshot: FormState = {
        ...state.form,
        seed: seedForForm,
        hld: getCaptionHld(caption, state.form.hld),
      };
      const job: GenJob = {
        id: crypto.randomUUID(),
        promptId: historyLink === "regenerate" ? state.selectedPromptId ?? undefined : undefined,
        historyLinkMode: historyLink,
        formSnapshot,
        label: label.length > 80 ? `${label.slice(0, 77)}…` : label,
        status: "queued",
        msg: "Queued",
        progress: 0,
        totalSteps: 0,
        createdAt: Date.now(),
        request: {
          caption,
          width: state.form.w,
          height: state.form.h,
          preset: state.form.preset,
          seed: resolvedSeed,
          format: state.form.format,
        },
      };

      dispatch({ type: "ENQUEUE_JOB", job });

      const actionLabel = historyLink === "regenerate" ? "Regeneration" : "New generation";
      toast.success(hasPendingJobs ? `${actionLabel} added to queue` : `${actionLabel} queued`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [
    canGenerate,
    confirm,
    dispatch,
    hasPendingJobs,
    state.form,
    state.genQueue.length,
    state.selectedPromptId,
  ]);

  return {
    enqueue,
    canGenerate,
    hasPendingJobs,
    hasActiveHistory,
  };
}