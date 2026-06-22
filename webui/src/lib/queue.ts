import type { GenJob, GenJobStatus } from "@/state/types";

export type GenQueueFilter = "all" | "queue" | "done";

const ACTIVE_STATUSES: GenJobStatus[] = [
  "running",
  "cancelling",
  "submitting",
  "waiting",
];

export function isActiveJob(job: GenJob) {
  return ACTIVE_STATUSES.includes(job.status);
}

export function hasInFlightGeneration(jobs: GenJob[]) {
  return jobs.some(
    (job) =>
      job.status === "queued"
      || job.status === "waiting"
      || job.status === "submitting"
      || job.status === "running"
      || job.status === "cancelling",
  );
}

export function findPrimaryActiveJob(jobs: GenJob[]): GenJob | undefined {
  for (const status of ACTIVE_STATUSES) {
    const job = jobs.find((entry) => entry.status === status);
    if (job) return job;
  }
  return undefined;
}

export function sortJobsForDisplay(jobs: GenJob[]): GenJob[] {
  const order = new Map(jobs.map((job, index) => [job.id, index]));

  return [...jobs].sort((a, b) => {
    const groupDiff = jobDisplayGroup(a.status) - jobDisplayGroup(b.status);
    if (groupDiff !== 0) return groupDiff;

    if (isActiveJob(a) && isActiveJob(b) && a.status !== b.status) {
      return ACTIVE_STATUSES.indexOf(a.status) - ACTIVE_STATUSES.indexOf(b.status);
    }

    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
}

export function isQueuedJob(job: GenJob) {
  return job.status === "queued" || job.status === "waiting";
}

export function isDoneJob(job: GenJob) {
  return job.status === "done" || job.status === "error" || job.status === "cancelled";
}

export function isHistoryLinkFailed(job: GenJob) {
  return job.status === "done" && Boolean(job.historyLinkFailed);
}

export function canOpenHistoryFromJob(job: GenJob) {
  return (
    job.status === "done"
    && job.promptId != null
    && !job.historyLinkFailed
    && job.result?.historyLinked === true
  );
}

export function canPreviewJobResult(job: GenJob) {
  return job.status === "done" && job.result != null && Boolean(job.result.url);
}

export function partitionJobsForDisplay(jobs: GenJob[], filter: GenQueueFilter = "all") {
  const sorted = sortJobsForDisplay(jobs);
  const activeJobs = sorted.filter(isActiveJob);
  const scrollableJobs = sorted
    .filter((job) => !isActiveJob(job))
    .filter((job) => matchesQueueFilter(job, filter));

  return { activeJobs, scrollableJobs };
}

function matchesQueueFilter(job: GenJob, filter: GenQueueFilter) {
  if (filter === "all") return true;
  if (filter === "queue") return isQueuedJob(job);
  return isDoneJob(job);
}

function jobDisplayGroup(status: GenJobStatus): number {
  if (isActiveStatus(status)) return 0;
  if (status === "queued") return 1;
  return 2;
}

function isActiveStatus(status: GenJobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}