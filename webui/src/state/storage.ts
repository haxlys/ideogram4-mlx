import type { FormState, ImageEntry, PromptEntry } from "./types";
import { DEFAULT_FORM } from "./types";
import {
  getImages,
  getPrompts,
  savePromptApi,
  saveLastFormApi,
  deletePromptApi,
  deleteImageApi,
  deleteOrphanImagesApi,
} from "@/api/client";
import { imageEntryFromRow, isLinkedToHistory } from "@/lib/image";

const LAST_FORM_KEY = "ideogram4_last_form";
let _linkedImagesCache: ImageEntry[] | null = null;
let _orphanImagesCache: ImageEntry[] | null = null;
let _promptsCache: PromptEntry[] | null = null;
let _validPromptIdsCache: Set<number> | null = null;

export function invalidateImageCache() {
  _linkedImagesCache = null;
  _orphanImagesCache = null;
}

export function invalidatePromptsCache() {
  _promptsCache = null;
  _validPromptIdsCache = null;
}

async function loadValidPromptIds(): Promise<Set<number>> {
  if (_validPromptIdsCache) return _validPromptIdsCache;
  const rows = await getPrompts();
  _validPromptIdsCache = new Set(rows.map((row) => row.id));
  return _validPromptIdsCache;
}

export function loadLastForm(): FormState {
  try {
    const raw = localStorage.getItem(LAST_FORM_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_FORM;
}

export function saveLastForm(form: FormState) {
  localStorage.setItem(LAST_FORM_KEY, JSON.stringify(form));
  saveLastFormApi(JSON.stringify(form)).catch(() => {});
}

export function promptPayloadFromForm(form: FormState): { hld: string; formJson: string } {
  const entry: PromptEntry = { ...form, _savedAt: new Date().toISOString() };
  return {
    hld: form.hld || "(empty)",
    formJson: JSON.stringify(entry),
  };
}

export async function savePrompt(form: FormState): Promise<number> {
  const { hld, formJson } = promptPayloadFromForm(form);
  const result = await savePromptApi(hld, formJson);
  invalidatePromptsCache();
  return result.id;
}

export async function loadPromptHistory(): Promise<PromptEntry[]> {
  if (_promptsCache) return _promptsCache;
  try {
    const rows = await getPrompts();
    _promptsCache = rows.flatMap((r) => {
      try { const p = JSON.parse(r.form_json) as PromptEntry; p._id = r.id; return [p]; }
      catch { return []; }
    });
    _validPromptIdsCache = new Set(rows.map((row) => row.id));
    return _promptsCache;
  } catch {
    return [];
  }
}

export async function loadLinkedImages(): Promise<ImageEntry[]> {
  if (_linkedImagesCache) return _linkedImagesCache;
  try {
    const promptIds = await loadValidPromptIds();
    const rows = await getImages({ linkedOnly: true, limit: 0 });
    _linkedImagesCache = rows
      .filter((row) => isLinkedToHistory(row.prompt_id, promptIds))
      .map((row) => imageEntryFromRow(row, promptIds));
    return _linkedImagesCache;
  } catch {
    return [];
  }
}

export async function loadOrphanImages(): Promise<ImageEntry[]> {
  if (_orphanImagesCache) return _orphanImagesCache;
  try {
    const promptIds = await loadValidPromptIds();
    const rows = await getImages({ orphansOnly: true, limit: 0 });
    _orphanImagesCache = rows
      .filter((row) => !isLinkedToHistory(row.prompt_id, promptIds))
      .map((row) => imageEntryFromRow(row, promptIds));
    return _orphanImagesCache;
  } catch {
    return [];
  }
}

/** @deprecated Use loadLinkedImages or loadOrphanImages */
export async function loadImages(): Promise<ImageEntry[]> {
  return loadLinkedImages();
}

export async function deletePrompt(promptId: number) {
  await deletePromptApi(promptId);
  invalidatePromptsCache();
  invalidateImageCache();
  if (_promptsCache) {
    _promptsCache = _promptsCache.filter((p) => p._id !== promptId);
  }
}

export async function deleteImage(imageId: number) {
  await deleteImageApi(imageId);
  invalidateImageCache();
}

export async function deleteAllOrphanImages(): Promise<number> {
  const result = await deleteOrphanImagesApi();
  invalidateImageCache();
  return result.deleted;
}