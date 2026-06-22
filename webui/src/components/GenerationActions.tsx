import { useEnqueueGeneration } from "@/hooks/useEnqueueGeneration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListPlus, Play, Plus, RefreshCw } from "lucide-react";

export function GenerationActions() {
  const { enqueue, canGenerate, hasPendingJobs, hasActiveHistory } = useEnqueueGeneration();

  if (!hasActiveHistory) {
    return (
      <Card className="shadow-card border-primary/10">
        <CardContent className="pt-4">
          <Button
            className="h-11 w-full text-body font-semibold tracking-[-0.01em] shadow-card"
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
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardContent className="space-y-2 pt-4">
        <p className="text-caption leading-relaxed text-muted-foreground">
          Regenerate with a new seed, or save as a new history entry.
        </p>
        <Button
          className="h-11 w-full text-body font-semibold tracking-[-0.01em]"
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
          className="h-10 w-full text-body-sm font-medium"
          disabled={!canGenerate}
          onClick={() => void enqueue({ historyLink: "new", newSeed: true })}
        >
          {hasPendingJobs ? (
            <ListPlus className="mr-2 size-4" />
          ) : (
            <Plus className="mr-2 size-4" />
          )}
          {hasPendingJobs ? "Queue as New Entry" : "Save as New Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}