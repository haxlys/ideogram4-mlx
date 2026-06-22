import { useAppState } from "@/state/context";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { GenerationActions } from "@/components/GenerationActions";
import { GenerationSettings } from "@/components/GenerationSettings";
import { HistoryOutputPanel } from "@/components/HistoryOutputPanel";
import { PromptSection } from "@/components/PromptSection";
import { ScrollArea } from "@/components/ui/scroll-area";

export function HistoryEditorLayout() {
  const { state } = useAppState();

  useFormAutosave(state.form);

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:py-8">
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
          <aside className="lg:sticky lg:top-[var(--header-height)] lg:max-h-[calc(100dvh-var(--header-height))] lg:overflow-y-auto space-y-4 lg:py-1">
            <GenerationSettings />
            <GenerationActions />
          </aside>

          <div className="min-w-0">
            <PromptSection />
          </div>

          <div className="min-w-0 lg:sticky lg:top-[var(--header-height)] lg:max-h-[calc(100dvh-var(--header-height))] lg:overflow-y-auto lg:py-1">
            <HistoryOutputPanel />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}