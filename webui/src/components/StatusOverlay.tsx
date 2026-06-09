import { useAppState } from "@/state/context";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function StatusOverlay() {
  const { state, dispatch } = useAppState();
  const { genStatus, genStatusMsg, progress, totalSteps } = state;

  if (genStatus === "idle" || genStatus === "done") return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {genStatus === "submitting" ? "Submitting…" : "Generating"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            This may take several minutes. Do not reload the page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Spinner className="size-4" />
            {genStatusMsg}
          </div>
          <div className="space-y-1.5">
            <Progress
              value={progress > 0 ? progress : null}
              className="h-1.5"
            />
            {progress > 0 && totalSteps > 0 && (
              <div className="text-right text-[11px] text-muted-foreground tabular-nums">
                {progress}%
              </div>
            )}
          </div>
          {genStatus === "error" && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => dispatch({ type: "SET_GEN_STATUS", status: "idle" })}
            >
              Dismiss
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
