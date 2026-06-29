import type { GenJob } from "@/state/types";

export function countsTowardQueueLimit(job: GenJob): boolean {
  return job.status === "queued" || job.status === "waiting";
}

export function queuedJobCount(genQueue: GenJob[]): number {
  return genQueue.filter(countsTowardQueueLimit).length;
}
