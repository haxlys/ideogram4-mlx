import { useAppState } from "@/state/context";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { CaptionEditor } from "@/components/CaptionEditor";
import { GenerationActions } from "@/components/GenerationActions";
import { GenerationSettings } from "@/components/GenerationSettings";
import { ResultCanvas } from "@/components/ResultCanvas";
import { ScrollArea } from "@/components/ui/scroll-area";

export function EditorLayout() {
  const { state } = useAppState();

  useFormAutosave(state.form);

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-8">
        <div className="sticky top-0 z-10 -mx-4 mb-6 flex justify-end border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md lg:static lg:z-auto lg:mx-0 lg:mb-6 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <GenerationActions className="w-full sm:w-auto" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <CaptionEditor />
            <ResultCanvas />
          </div>

          <aside className="lg:sticky lg:top-[var(--header-height)] lg:max-h-[calc(100dvh-var(--header-height))] lg:overflow-y-auto lg:py-1">
            <GenerationSettings />
          </aside>
        </div>
      </div>
    </ScrollArea>
  );
}