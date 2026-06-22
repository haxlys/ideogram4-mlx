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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <CaptionEditor />
            <ResultCanvas />
          </div>

          <aside className="lg:sticky lg:top-[var(--header-height)] lg:max-h-[calc(100dvh-var(--header-height))] lg:overflow-y-auto lg:space-y-4 lg:py-1">
            <GenerationActions />
            <GenerationSettings />
          </aside>
        </div>
      </div>
    </ScrollArea>
  );
}