import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAppState } from "@/state/context";
import { invalidatePromptsCache, loadPromptHistory, deletePrompt } from "@/state/storage";
import { getImages } from "@/api/client";
import { formSeedFromImage, imageEntryFromRow, pickHistoryPreviewImage } from "@/lib/image";
import { groupByLocalDate } from "@/lib/date";
import type { PromptEntry } from "@/state/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useFavorites } from "@/state/favoritesContext";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const PRESET_LABELS: Record<string, string> = {
  V4_TURBO_12: "Turbo",
  V4_DEFAULT_20: "Default",
  V4_QUALITY_48: "Quality",
};

interface PromptHistoryProps {
  sidebar?: boolean;
}

interface HistoryEntryRowProps {
  entry: PromptEntry;
  active: boolean;
  onRestore: (entry: PromptEntry) => void;
  onDelete: (entry: PromptEntry) => void;
}

function HistoryEntryRow({ entry, active, onRestore, onDelete }: HistoryEntryRowProps) {
  const { isFavoritePrompt } = useFavorites();
  const favorited = entry._id != null && isFavoritePrompt(entry._id);

  return (
    <div
      role="button"
      tabIndex={0}
      className={
        "w-full rounded-lg px-3 py-2.5 text-left transition-colors group cursor-pointer "
        + (active ? "bg-muted" : "hover:bg-muted")
      }
      onClick={() => onRestore(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRestore(entry);
        }
      }}
    >
      <div className="flex items-start gap-2">
        <div className="truncate flex-1 min-w-0">
          <div className="truncate text-[13px] font-medium text-foreground">
            {entry.hld.slice(0, 60) || "(empty)"}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-1 py-0.5">
              {PRESET_LABELS[entry.preset] ?? entry.preset}
            </span>
            <span>{entry.w}×{entry.h}</span>
            <span>
              {new Date(entry._savedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        {entry._id != null && (
          <FavoriteButton
            promptId={entry._id}
            className={
              "size-6 shrink-0 "
              + (favorited
                ? "opacity-100"
                : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100")
            }
            size="icon-sm"
          />
        )}
        <span
          role="button"
          tabIndex={0}
          aria-label={`Delete ${entry.hld.slice(0, 20) || "prompt"}`}
          className="size-6 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center rounded-md transition-colors hover:bg-muted cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onDelete(entry);
            }
          }}
        >
          <Trash2 className="size-3" />
        </span>
      </div>
    </div>
  );
}

export function PromptHistory({ sidebar }: PromptHistoryProps) {
  const { state, dispatch } = useAppState();
  const [entries, setEntries] = useState<PromptEntry[]>([]);
  const navigate = useNavigate();

  const dateGroups = useMemo(
    () => groupByLocalDate(entries, (entry) => entry._savedAt),
    [entries],
  );

  useEffect(() => {
    invalidatePromptsCache();
    loadPromptHistory().then(setEntries);
  }, [state.historyRefresh]);

  const restore = useCallback(async (entry: PromptEntry) => {
    const { _savedAt, _id, ...form } = entry;
    dispatch({ type: "RESTORE_FORM", form, promptId: _id ?? undefined });
    if (_id != null) {
      try {
        const images = await getImages({ promptId: _id });
        const image = pickHistoryPreviewImage(images, _savedAt);
        if (image) {
          dispatch({
            type: "SHOW_RESULT",
            entry: imageEntryFromRow({ ...image, prompt_id: _id }),
          });
          const seed = formSeedFromImage(image.seed);
          if (seed) {
            dispatch({ type: "SET_FORM", form: { seed } });
          }
        } else {
          dispatch({ type: "SHOW_RESULT", entry: null });
        }
      } catch {
        dispatch({ type: "SHOW_RESULT", entry: null });
      }
    }
    if (sidebar) {
      navigate({ to: "/history/$promptId", params: { promptId: String(_id) } });
    }
  }, [dispatch, sidebar, navigate]);

  const deleteEntry = useCallback(async (entry: PromptEntry) => {
    if (entry._id == null) return;
    const promptId = entry._id;
    try {
      await deletePrompt(promptId);
      setEntries((prev) => prev.filter((p) => p._id !== promptId));
      dispatch({ type: "REMOVE_IMAGES_BY_PROMPT", promptId });
      dispatch({ type: "REFRESH_HISTORY" });
      dispatch({ type: "REFRESH_FAVORITES" });
    } catch {
      toast.error("Failed to delete history entry");
    }
  }, [dispatch]);

  if (entries.length === 0 && sidebar) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
        No saved prompts yet.
      </div>
    );
  }

  return (
    <ScrollArea className={sidebar ? "flex-1" : undefined}>
      <div className="space-y-4 p-2 pb-3">
        {dateGroups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <div className="sticky top-0 z-10 -mx-1 mb-1 flex items-center gap-2 bg-background/95 px-2 py-1.5 backdrop-blur-sm">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </h3>
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] tabular-nums text-muted-foreground/70">
                {group.items.length}
              </span>
            </div>
            <div className="space-y-0.5">
              {group.items.map((entry, i) => (
                <HistoryEntryRow
                  key={entry._id ?? `${group.key}-${i}`}
                  entry={entry}
                  active={Boolean(sidebar && entry._id != null && entry._id === state.selectedPromptId)}
                  onRestore={restore}
                  onDelete={deleteEntry}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </ScrollArea>
  );
}