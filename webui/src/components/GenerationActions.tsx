import { useEnqueueGeneration } from "@/hooks/useEnqueueGeneration";
import { Button } from "@/components/ui/button";
import { ListPlus, Play, Plus, RefreshCw } from "lucide-react";

export function GenerationActions() {
  const { enqueue, canGenerate, hasPendingJobs, hasActiveHistory } = useEnqueueGeneration();

  if (!hasActiveHistory) {
    return (
      <Button
        className="h-12 w-full text-[15px] font-semibold tracking-[-0.01em]"
        disabled={!canGenerate}
        onClick={() => void enqueue({ historyLink: "new" })}
      >
        {hasPendingJobs ? (
          <ListPlus className="mr-2 size-4" />
        ) : (
          <Play className="mr-2 size-4" />
        )}
        {hasPendingJobs ? "Add to Queue" : "Generate"}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Regenerate with a new seed, or save as a new history entry with a new seed.
      </p>
      <Button
        className="h-12 w-full text-[15px] font-semibold tracking-[-0.01em]"
        disabled={!canGenerate}
        onClick={() => void enqueue({ historyLink: "regenerate", newSeed: true })}
      >
        {hasPendingJobs ? (
          <ListPlus className="mr-2 size-4" />
        ) : (
          <RefreshCw className="mr-2 size-4" />
        )}
        {hasPendingJobs ? "Queue Regeneration" : "Regenerate"}
      </Button>
      <Button
        variant="outline"
        className="h-11 w-full text-[14px] font-medium tracking-[-0.01em]"
        disabled={!canGenerate}
        onClick={() => void enqueue({ historyLink: "new", newSeed: true })}
      >
        {hasPendingJobs ? (
          <ListPlus className="mr-2 size-4" />
        ) : (
          <Plus className="mr-2 size-4" />
        )}
        {hasPendingJobs ? "Queue New Seed" : "New Seed"}
      </Button>
    </div>
  );
}