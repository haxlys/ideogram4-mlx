import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAppState } from "@/state/context";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { useGeneratePolling } from "@/hooks/useGeneratePolling";
import { submitGenerate, verifyCaption } from "@/api/client";
import { buildCaptionJson } from "@/validation/caption";
import { savePrompt, loadLastForm } from "@/state/storage";
import { CaptionEditor } from "@/components/CaptionEditor";
import { GenerationSettings } from "@/components/GenerationSettings";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: EditorPage,
});

function EditorPage() {
  const { state, dispatch } = useAppState();
  const { startPolling } = useGeneratePolling();

  useFormAutosave(state.form);

  useEffect(() => {
    const saved = loadLastForm();
    dispatch({ type: "RESTORE_FORM", form: saved });
  }, [dispatch]);

  const handleGenerate = useCallback(async () => {
    if (state.modelState !== "loaded") {
      toast.error("Model is not loaded. Please load the model first.");
      return;
    }

    const caption = buildCaptionJson(state.form);

    if (!state.form.rawJson.trim()) {
      try {
        const verifyRes = await verifyCaption(caption);
        if (!verifyRes.valid && verifyRes.warnings.length > 0) {
          const proceed = confirm(
            `Caption verification warnings:\n\n${verifyRes.warnings.join("\n")}\n\nProceed anyway?`,
          );
          if (!proceed) return;
        }
      } catch {
      }
    }

    savePrompt({
      ...state.form,
      hld: state.form.rawJson.trim() ? (caption.high_level_description || state.form.hld) : state.form.hld,
    });
    dispatch({ type: "SET_GEN_STATUS", status: "submitting", msg: "Submitting…" });

    try {
      const res = await submitGenerate({
        caption,
        width: state.form.w,
        height: state.form.h,
        preset: state.form.preset,
        seed: Number(state.form.seed) || Math.floor(Math.random() * 2**32),
      });

      dispatch({ type: "SET_GEN_STATUS", status: "running", msg: "Starting…", taskId: res.task_id });
      startPolling(res.task_id);
    } catch (e) {
      dispatch({ type: "SET_GEN_STATUS", status: "error", msg: String(e) });
    }
  }, [state, dispatch, startPolling]);

  const isGenerating = state.genStatus === "submitting" || state.genStatus === "running";
  const canGenerate = state.modelState === "loaded" && !isGenerating;

  return (
    <ScrollArea className="flex-1">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <ScrollArea className="lg:max-h-[calc(100dvh-10rem)]">
            <CaptionEditor />
          </ScrollArea>

          <div className="space-y-5">
            <GenerationSettings />

            <Button
              className="w-full h-12 text-[15px] font-semibold tracking-[-0.01em]"
              disabled={!canGenerate}
              onClick={handleGenerate}
            >
              {isGenerating ? (
                <Spinner className="mr-2 size-4" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              {isGenerating ? "Generating…" : "Generate"}
            </Button>
          </div>
        </div>
      </main>
    </ScrollArea>
  );
}
