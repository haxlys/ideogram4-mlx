import { useAppState } from "@/state/context";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { CaptionEditor } from "@/components/CaptionEditor";
import { GenerationActions } from "@/components/GenerationActions";
import { GenerationSettings } from "@/components/GenerationSettings";
import { HistoryImagesPanel } from "@/components/HistoryImagesPanel";
import { ResultImagePanel } from "@/components/ResultImagePanel";
import { ScrollArea } from "@/components/ui/scroll-area";

export function EditorWorkspace() {
  const { state, dispatch } = useAppState();

  useFormAutosave(state.form);

  const resultImage = state.resultImage;

  return (
    <ScrollArea className="flex-1">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <CaptionEditor />

          <div className="sticky top-[53px] max-h-[calc(100dvh-53px)] overflow-y-auto space-y-5 py-8 px-1">
            <GenerationSettings />

            <GenerationActions />

            {resultImage && (
              <ResultImagePanel
                image={resultImage}
                onDismiss={() => dispatch({ type: "SHOW_RESULT", entry: null })}
              />
            )}

            <HistoryImagesPanel />
          </div>
        </div>
      </main>
    </ScrollArea>
  );
}