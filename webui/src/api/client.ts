export interface ModelStatus {
  state: "idle" | "loading" | "loaded";
  msg?: string;
  backend?: "mlx" | string;
  model_repo?: string;
  model_path?: string;
  quantization_bits?: number | null;
  mlx_memory?: {
    active_gb?: number | null;
    peak_gb?: number | null;
    cache_gb?: number | null;
    cache_limit_gb?: number | null;
  };
}

interface LoadResponse {
  ok: boolean;
  msg?: string;
}

export interface GenerateRequest {
  caption: object;
  width: number;
  height: number;
  preset: string;
  seed: number;
  format: string;
  prompt_id?: number | null;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface GenerateResponse {
  task_id: string;
}

interface AppliedLoraImageRef {
  name: string;
  strength: number;
}

interface TaskImage {
  id: number;
  url: string;
  hld: string;
  time: string;
  seed?: number;
  preset?: string;
  width?: number;
  height?: number;
  prompt_id?: number | null;
  lora_name?: string | null;
  lora_strength?: number | null;
  applied_loras?: AppliedLoraImageRef[] | null;
}

interface TaskStatusResponse {
  state: "running" | "done";
  msg?: string;
  image?: TaskImage | null;
  progress?: number;
  total_steps?: number;
  error?: string;
  cancelled?: boolean;
}

interface CancelTaskResponse {
  ok: boolean;
  msg?: string;
}

interface VerifyResponse {
  valid: boolean;
  warnings: string[];
}

const MAGIC_PROMPT_TIMEOUT_MS = 125_000;

function parseApiError(res: Response, body: unknown): string {
  if (body && typeof body === "object") {
    if ("error" in body && typeof body.error === "string") {
      return body.error;
    }
    if ("detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((entry) => {
            if (entry && typeof entry === "object" && "msg" in entry) {
              return String(entry.msg);
            }
            return String(entry);
          })
          .join("; ");
      }
    }
  }
  return `HTTP ${res.status}: ${res.statusText}`;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      msg = parseApiError(res, body);
    } catch {
      // Keep the generic HTTP message if the response is not JSON.
    }
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

export async function getModelStatus() {
  return request<ModelStatus>("/api/model/status");
}

export async function loadModel() {
  const result = await request<LoadResponse>("/api/model/load", { method: "POST" });
  if (!result.ok) {
    throw new ApiError(502, result.msg ?? "Model load was rejected.");
  }
  return result;
}

export async function unloadModel() {
  return request<LoadResponse>("/api/model/unload", { method: "POST" });
}

export async function submitGenerate(data: GenerateRequest) {
  return request<GenerateResponse>("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getTaskStatus(taskId: string) {
  return request<TaskStatusResponse>(`/api/status/${taskId}`);
}

export async function cancelTask(taskId: string) {
  return request<CancelTaskResponse>(`/api/cancel/${taskId}`, { method: "POST" });
}

export async function verifyCaption(caption: object) {
  return request<VerifyResponse>("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caption }),
  });
}

interface MagicPromptResponse {
  caption: object;
  model: string;
}

interface MagicPromptStatusResponse {
  enabled: boolean;
  configured: boolean;
  provider: string;
  model: string;
  base_url: string;
  auth_configured: boolean;
  managed_local_llama: boolean;
  missing_env: string[];
  llm_reachable: boolean;
  llm_error: string | null;
}

export async function getMagicPromptStatus() {
  const res = await fetch("/api/magic-prompt/status");
  if (res.status === 404) return null;
  if (!res.ok) {
    let msg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      msg = parseApiError(res, body);
    } catch {
      // Keep the generic HTTP message if the response is not JSON.
    }
    throw new Error(msg);
  }
  return res.json() as Promise<MagicPromptStatusResponse>;
}

export async function magicPrompt(prompt: string, width: number, height: number, imagesB64?: string[] | null) {
  return request<MagicPromptResponse>("/api/magic-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, width, height, images_b64: imagesB64 }),
    signal: AbortSignal.timeout(MAGIC_PROMPT_TIMEOUT_MS),
  });
}

interface ImageRow {
  id: number;
  created_at: string;
  hld: string;
  width: number;
  height: number;
  preset: string;
  seed: number;
  file_path: string;
  prompt_id?: number | null;
  lora_name?: string | null;
  lora_strength?: number | null;
  lora_stack_json?: string | null;
}
interface PromptRow { id: number; saved_at: string; hld: string; form_json: string; }

export interface ImageQuery {
  promptId?: number;
  linkedOnly?: boolean;
  orphansOnly?: boolean;
  /** 0 = no limit; omit for server default (IDEOGRAM4_DB_QUERY_LIMIT). */
  limit?: number;
}

export interface ImageStats {
  total: number;
  linked: number;
  orphans: number;
  null_prompt_id: number;
  dangling: number;
}

function imageQueryString(query?: ImageQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  if (query.promptId != null) params.set("prompt_id", String(query.promptId));
  if (query.linkedOnly) params.set("linked_only", "1");
  if (query.orphansOnly) params.set("orphans_only", "1");
  if (query.limit != null) params.set("limit", String(query.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getImages(query?: ImageQuery) {
  return request<ImageRow[]>(`/api/images${imageQueryString(query)}`);
}
export async function getImageStats() { return request<ImageStats>("/api/images/stats"); }
export async function deleteImageApi(imageId: number) {
  return request<{ ok: boolean }>(`/api/images/${imageId}`, { method: "DELETE" });
}
export async function linkImagePromptApi(imageId: number, promptId: number) {
  return request<{ ok: boolean; prompt_id: number }>(`/api/images/${imageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt_id: promptId }),
  });
}

export interface AttachHistoryRequest {
  promptId?: number;
  hld: string;
  formJson: string;
}

export async function attachImageHistoryApi(imageId: number, body: AttachHistoryRequest) {
  return request<{ ok: boolean; prompt_id: number }>(`/api/images/${imageId}/attach-history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt_id: body.promptId ?? null,
      hld: body.hld,
      form_json: body.formJson,
    }),
  });
}
export async function deleteOrphanImagesApi() {
  return request<{ ok: boolean; deleted: number }>("/api/images/orphans", { method: "DELETE" });
}

export interface FavoriteRow {
  id: number;
  image_id: number;
  created_at: string;
  hld: string;
  preset?: string;
  w?: number;
  h?: number;
  prompt_id?: number | null;
  history_linked?: boolean;
}

export interface FavoriteRequest {
  image_id?: number;
  prompt_id?: number;
}

export async function getFavorites() {
  return request<FavoriteRow[]>("/api/favorites");
}

export async function getFavoriteApi(favoriteId: number) {
  return request<FavoriteRow>(`/api/favorites/${favoriteId}`);
}

export async function addFavoriteApi(body: FavoriteRequest) {
  return request<FavoriteRow>("/api/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function removeFavoriteApi(body: FavoriteRequest) {
  let result: { ok: boolean };
  if (body.image_id != null) {
    result = await request<{ ok: boolean }>(`/api/favorites/images/${body.image_id}`, { method: "DELETE" });
  } else if (body.prompt_id != null) {
    result = await request<{ ok: boolean }>(`/api/favorites/prompts/${body.prompt_id}`, { method: "DELETE" });
  } else {
    return { ok: false };
  }
  if (!result.ok) {
    throw new Error("Favorite not found");
  }
  return result;
}
export async function getPrompts() { return request<PromptRow[]>('/api/prompts'); }
export async function savePromptApi(hld: string, formJson: string) { return request<{id:number}>('/api/prompts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({hld, form_json: formJson}) }); }
export async function deletePromptApi(promptId: number) { return request<{ok:boolean}>(`/api/prompts/${promptId}`, { method: 'DELETE' }); }
export async function saveLastFormApi(formJson: string) { return request<{ok:boolean}>('/api/form', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({form_json: formJson}) }); }

interface LoraEntry { name: string; path: string; format: string; size_mb: number; }
interface AppliedLora { name: string; strength: number; format?: string; }
interface LoraStatus { applied: string | null; strength: number; applied_loras?: AppliedLora[]; available: LoraEntry[]; }
interface LoraPresetEntry { name: string; repo?: string; filename?: string; strength: number; installed: boolean; format?: string | null; size_mb?: number | null; }
interface LoraPreset { id: string; label: string; installed: boolean; loras: LoraPresetEntry[]; }
interface LoraPresetsResponse { presets: LoraPreset[]; }
interface LoraDownloadResponse { ok: boolean; msg?: string; task_id?: string; }
interface LoraDownloadStatus { state: "running" | "done"; msg: string; files: Array<{name: string; status: string}>; error?: string | null; }
interface LoraOperationResponse { ok: boolean; msg?: string; task_id?: string; }
interface LoraOperationResult { ok: boolean; msg: string; applied_loras?: AppliedLora[]; }
interface LoraOperationStatus {
  state: "running" | "done";
  msg: string;
  phase: string;
  progress: number;
  error?: string | null;
  result?: LoraOperationResult;
}

export async function getLoraStatus() { return request<LoraStatus>('/api/lora/status'); }
export async function applyLora(name: string, strength: number) { return request<LoraOperationResponse>('/api/lora/apply', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name, strength}) }); }
export async function applyLoraStack(loras: Array<{name: string; strength: number}>) { return request<LoraOperationResponse>('/api/lora/apply', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({loras}) }); }
export async function getLoraPresets() { return request<LoraPresetsResponse>('/api/lora/presets'); }
export async function downloadLoraPreset(presetId: string) { return request<LoraDownloadResponse>('/api/lora/download', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({preset_id: presetId}) }); }
export async function getLoraDownloadStatus(taskId: string) { return request<LoraDownloadStatus>(`/api/lora/download/${taskId}`); }
export async function getLoraOperationStatus(taskId: string) { return request<LoraOperationStatus>(`/api/lora/operation/${taskId}`); }
export async function removeLora() { return request<LoraOperationResponse>('/api/lora/remove', { method: 'POST' }); }
