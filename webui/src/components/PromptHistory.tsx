import { useEffect, useState, useCallback } from "react";
import { useAppState } from "@/state/context";
import { loadPromptHistory, deletePrompt } from "@/state/storage";
import type { PromptEntry } from "@/state/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";

const PRESET_LABELS: Record<string, string> = {
  V4_TURBO_12: "Turbo",
  V4_DEFAULT_20: "Default",
  V4_QUALITY_48: "Quality",
};

interface PromptHistoryProps {
  sidebar?: boolean;
}

export function PromptHistory({ sidebar }: PromptHistoryProps) {
  const { state, dispatch } = useAppState();
  const [entries, setEntries] = useState<PromptEntry[]>([]);

  useEffect(() => {
    loadPromptHistory().then(setEntries);
  }, []);

  const restore = useCallback((entry: PromptEntry) => {
    const { _savedAt, _id, ...form } = entry;
    dispatch({ type: "RESTORE_FORM", form });
  }, [dispatch]);

  const handleDelete = useCallback((e: React.MouseEvent, entry: PromptEntry) => {
    e.stopPropagation();
    if (entry._id == null) return;
    deletePrompt(entry._id);
    setEntries((prev) => prev.filter((p) => p._id !== entry._id));
  }, []);

  if (entries.length === 0 && sidebar) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
        No saved prompts yet.
      </div>
    );
  }

  return (
    <ScrollArea className={sidebar ? "flex-1" : undefined}>
      <div className="space-y-0.5 p-2">
        {entries.map((entry, i) => {
          const active = sidebar && entry.hld === state.form.hld && entry.preset === state.form.preset && entry.w === state.form.w && entry.h === state.form.h;
          return (
          <button
            key={entry._id ?? i}
            type="button"
            className={"w-full rounded-lg px-3 py-2.5 text-left transition-colors group " + (active ? "bg-muted" : "hover:bg-muted")}
            onClick={() => restore(entry)}
          >
            <div className="flex items-start gap-2">
              <div className="truncate flex-1 min-w-0">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {entry.hld.slice(0, 60) || "(empty)"}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1 py-0.5">{PRESET_LABELS[entry.preset] ?? entry.preset}</span>
                  <span>{entry.w}×{entry.h}</span>
                  <span>
                    {new Date(entry._savedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Delete ${entry.hld.slice(0, 20) || "prompt"}`}
                className="size-6 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center rounded-md transition-colors hover:bg-muted cursor-pointer"
                onClick={(e) => handleDelete(e, entry)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDelete(e as any, entry); } }}
              >
                <Trash2 className="size-3" />
              </span>
            </div>
          </button>
        )})}
      </div>
    </ScrollArea>
  );
}
