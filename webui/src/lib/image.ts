import type { GenJob, ImageEntry } from "@/state/types";
import { parseServerTimestamp } from "@/lib/date";
import { isActiveJob } from "@/lib/queue";

/** Images are persisted before the prompt row is saved; allow that ordering. */
const HISTORY_PREVIEW_GRACE_MS = 120_000;

interface ImageRowLike {
  id: number;
  hld: string;
  created_at?: string;
  prompt_id?: number | null;
  preset?: string | null;
  seed?: number | null;
  width?: number | null;
  height?: number | null;
  lora_name?: string | null;
  lora_strength?: number | null;
  lora_stack_json?: string | null;
}

export function formSeedFromImage(seed: number | undefined | null): string | undefined {
  if (seed == null || !Number.isFinite(seed)) return undefined;
  return String(seed);
}

function parseAppliedLoras(row: ImageRowLike): ImageEntry["applied_loras"] {
  if (!row.lora_stack_json) return null;
  try {
    const parsed = JSON.parse(row.lora_stack_json) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const name = "name" in item ? String(item.name) : "";
      const strength = "strength" in item ? Number(item.strength) : 0;
      if (!name) return [];
      return [{ name, strength: Number.isFinite(strength) ? strength : 0 }];
    });
  } catch {
    return null;
  }
}

interface HistoryPreviewRow extends ImageRowLike {
  created_at: string;
}

/** Prefer images from the current generation; skips legacy stale links. */
export function pickHistoryPreviewImage<T extends HistoryPreviewRow>(
  images: T[],
  promptSavedAt: string,
): T | null {
  if (images.length === 0) return null;

  const savedMs = parseServerTimestamp(promptSavedAt);
  if (!Number.isFinite(savedMs)) return images[0] ?? null;

  const cutoffMs = savedMs - HISTORY_PREVIEW_GRACE_MS;
  const eligible = images.filter((image) => {
    const createdMs = parseServerTimestamp(image.created_at);
    return Number.isFinite(createdMs) && createdMs >= cutoffMs;
  });

  if (eligible.length > 0) {
    return eligible.reduce((latest, image) => {
      const latestMs = parseServerTimestamp(latest.created_at);
      const imageMs = parseServerTimestamp(image.created_at);
      return imageMs > latestMs ? image : latest;
    });
  }

  return null;
}

export function sortHistoryImagesByCreatedAt<T extends HistoryPreviewRow>(
  images: T[],
): T[] {
  return [...images].sort((a, b) => {
    const aMs = parseServerTimestamp(a.created_at);
    const bMs = parseServerTimestamp(b.created_at);
    if (!Number.isFinite(aMs) && !Number.isFinite(bMs)) return 0;
    if (!Number.isFinite(aMs)) return 1;
    if (!Number.isFinite(bMs)) return -1;
    return bMs - aMs;
  });
}

export function historyPreviewImageId<T extends HistoryPreviewRow>(
  images: T[],
  savedAt: string,
): number | null {
  return pickHistoryPreviewImage(images, savedAt)?.id ?? null;
}

function isPendingRegenerationJob(job: GenJob, promptId: number) {
  return (
    job.promptId === promptId
    && job.historyLinkMode === "regenerate"
    && (
      job.status === "queued"
      || job.status === "waiting"
      || job.status === "submitting"
      || isActiveJob(job)
    )
  );
}

export function findLatestDoneJobResult(
  genQueue: GenJob[],
  promptId: number,
): ImageEntry | null {
  let latest: GenJob | null = null;
  for (const job of genQueue) {
    if (
      job.promptId !== promptId
      || job.status !== "done"
      || !job.result?.historyLinked
      || job.historyLinkFailed
    ) {
      continue;
    }
    if (!latest || job.createdAt > latest.createdAt) {
      latest = job;
    }
  }
  return latest?.result ?? null;
}

/** Prefer queue results over API preview picks to avoid regen races in Result. */
export function resolveHistoryResultEntry(options: {
  promptId: number;
  images: Parameters<typeof pickHistoryPreviewImage>[0];
  savedAt: string;
  genQueue: GenJob[];
  currentResult: ImageEntry | null;
  validPromptIds?: ReadonlySet<number>;
}): ImageEntry | null {
  const { promptId, images, savedAt, genQueue, currentResult, validPromptIds } = options;

  const doneResult = findLatestDoneJobResult(genQueue, promptId);
  if (doneResult) return doneResult;

  if (genQueue.some((job) => isPendingRegenerationJob(job, promptId)) && currentResult) {
    return currentResult;
  }

  const picked = pickHistoryPreviewImage(images, savedAt);
  if (!picked) return null;
  return imageEntryFromRow({ ...picked, prompt_id: promptId }, validPromptIds);
}

export function shouldReplaceResultImage(
  current: ImageEntry | null,
  next: ImageEntry | null,
  pinned = false,
): boolean {
  if (pinned) return false;
  if (next == null) return true;
  if (current == null) return true;
  if (current.id === next.id) return false;
  if (current.prompt_id != null && current.prompt_id === next.prompt_id) {
    return next.id >= current.id;
  }
  return true;
}

export function isLinkedToHistory(
  promptId: number | null | undefined,
  validPromptIds: ReadonlySet<number>,
): boolean {
  return promptId != null && validPromptIds.has(promptId);
}

export function imageEntryFromRow(
  row: ImageRowLike,
  validPromptIds?: ReadonlySet<number>,
  historyLinkedOverride?: boolean,
): ImageEntry {
  const historyLinked = historyLinkedOverride ?? (
    validPromptIds
      ? isLinkedToHistory(row.prompt_id, validPromptIds)
      : row.prompt_id != null
  );

  return {
    id: row.id,
    url: `/api/images/${row.id}/file`,
    hld: row.hld,
    time: row.created_at ? new Date(row.created_at).toLocaleTimeString() : "",
    prompt_id: row.prompt_id,
    seed: row.seed ?? undefined,
    preset: row.preset ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    historyLinked,
    lora_name: row.lora_name,
    lora_strength: row.lora_strength,
    applied_loras: parseAppliedLoras(row),
  };
}

export async function downloadImageFile(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export function imageEntryFromTask(image: {
  id: number;
  url: string;
  hld: string;
  time: string;
  prompt_id?: number | null;
  lora_name?: string | null;
  lora_strength?: number | null;
  seed?: number | null;
  preset?: string | null;
  width?: number | null;
  height?: number | null;
  applied_loras?: ImageEntry["applied_loras"];
  historyLinked?: boolean;
}): ImageEntry {
  return {
    id: image.id,
    url: image.url,
    hld: image.hld,
    time: image.time,
    prompt_id: image.prompt_id,
    seed: image.seed ?? undefined,
    preset: image.preset ?? undefined,
    width: image.width ?? undefined,
    height: image.height ?? undefined,
    historyLinked: image.historyLinked ?? image.prompt_id != null,
    lora_name: image.lora_name,
    lora_strength: image.lora_strength,
    applied_loras: image.applied_loras,
  };
}