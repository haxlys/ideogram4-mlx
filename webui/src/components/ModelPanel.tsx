import { loadModel, unloadModel } from "@/api/client";
import { useAppState } from "@/state/context";
import { useModelPolling } from "@/hooks/useModelPolling";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ModelPanel() {
  const { state, dispatch } = useAppState();
  const { startPolling } = useModelPolling();
  const isLoading = state.modelState === "loading";
  const isLoaded = state.modelState === "loaded";

  async function handleLoad() {
    dispatch({ type: "SET_MODEL_STATE", state: "loading" });
    try {
      await loadModel();
      startPolling();
    } catch {
      dispatch({ type: "SET_MODEL_STATE", state: "idle" });
      toast.error("Failed to start model load.");
    }
  }

  async function handleUnload() {
    if (!confirm("Unload model? This frees ~50 GB of memory.")) return;
    try {
      await unloadModel();
      dispatch({ type: "SET_MODEL_STATE", state: "idle" });
    } catch {
      toast.error("Failed to unload model.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full",
          isLoaded
            ? "bg-emerald-500"
            : isLoading
              ? "bg-amber-400 animate-pulse"
              : "bg-muted-foreground/40",
        )}
      />
      {state.modelState === "loaded" ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive" onClick={handleUnload}>
          Unload
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={handleLoad} disabled={isLoading}>
          {isLoading ? <Spinner className="size-3" /> : null}
          {isLoading ? "Loading…" : "Load"}
        </Button>
      )}
    </div>
  );
}
