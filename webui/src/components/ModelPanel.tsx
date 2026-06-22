import { useState } from "react";
import { ApiError, loadModel, unloadModel } from "@/api/client";
import { useAppState } from "@/state/context";
import { useModelPolling } from "@/hooks/useModelPolling";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function shortRepo(repo?: string) {
  if (!repo) return "ideogram-4-mlx-q8";
  return repo.split("/").pop() || repo;
}

function formatGb(value?: number | null) {
  if (value == null) return null;
  return `${value.toFixed(1)}G`;
}

export function ModelPanel() {
  const { state, dispatch } = useAppState();
  const { startPolling } = useModelPolling();
  const [unloadOpen, setUnloadOpen] = useState(false);
  const isLoading = state.modelState === "loading";
  const isLoaded = state.modelState === "loaded";
  const status = state.modelStatus;
  const backend = (status?.backend ?? "mlx").toUpperCase();
  const quantization = status?.quantization_bits ? `q${status.quantization_bits}` : "q8";
  const activeMemory = formatGb(status?.mlx_memory?.active_gb);
  const statusTitle = [
    status?.model_repo ? `repo: ${status.model_repo}` : null,
    status?.model_path ? `path: ${status.model_path}` : null,
    activeMemory ? `active: ${activeMemory}` : null,
    status?.mlx_memory?.peak_gb != null ? `peak: ${formatGb(status.mlx_memory.peak_gb)}` : null,
    status?.msg ? `status: ${status.msg}` : null,
  ].filter(Boolean).join("\n");

  async function handleLoad() {
    dispatch({ type: "SET_MODEL_STATE", state: "loading" });
    try {
      await loadModel();
      startPolling();
    } catch (error) {
      dispatch({ type: "SET_MODEL_STATE", state: "idle" });
      const message = error instanceof ApiError
        ? error.message
        : "Failed to start model load.";
      const hint = message.toLowerCase().includes("daemon unreachable")
        || message.toLowerCase().includes("connection refused")
        ? " Start the stack with ./run.sh or ./run.sh full."
        : "";
      toast.error(`${message}${hint}`);
    }
  }

  async function handleUnload() {
    try {
      await unloadModel();
      dispatch({ type: "SET_MODEL_STATE", state: "idle" });
      setUnloadOpen(false);
    } catch {
      toast.error("Failed to unload model.");
    }
  }

  return (
    <>
      <div className="flex min-w-0 items-center gap-2" title={statusTitle || undefined}>
        <Badge
          variant="outline"
          className={cn(
            "h-6 gap-1.5 px-2 text-caption font-medium",
            isLoaded && "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
            isLoading && "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
          )}
        >
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              isLoaded
                ? "bg-emerald-500"
                : isLoading
                  ? "bg-amber-400 animate-pulse"
                  : "bg-muted-foreground/50",
            )}
          />
          {isLoaded ? "Loaded" : isLoading ? "Loading" : "Idle"}
        </Badge>

        <div className="hidden min-w-0 items-center gap-1.5 lg:flex">
          <span className="rounded-md border border-border px-1.5 py-0.5 text-caption font-semibold leading-none text-muted-foreground">
            {backend} {quantization}
          </span>
          <span className="max-w-[120px] truncate text-caption text-muted-foreground">
            {shortRepo(status?.model_repo)}
          </span>
          {isLoaded && activeMemory ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-caption font-mono leading-none text-muted-foreground">
              {activeMemory}
            </span>
          ) : null}
        </div>

        {state.modelState === "loaded" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-caption text-muted-foreground hover:text-destructive"
            onClick={() => setUnloadOpen(true)}
          >
            Unload
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-caption"
            onClick={handleLoad}
            disabled={isLoading}
          >
            {isLoading ? <Spinner className="size-3" /> : null}
            {isLoading ? "Loading…" : "Load"}
          </Button>
        )}
      </div>

      <AlertDialog open={unloadOpen} onOpenChange={setUnloadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unload MLX model?</AlertDialogTitle>
            <AlertDialogDescription>
              This frees the local model memory. You will need to load the model again before generating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleUnload()}>
              Unload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}