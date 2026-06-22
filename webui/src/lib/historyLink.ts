import { ApiError, attachImageHistoryApi } from "@/api/client";

export const LINK_RETRY_ATTEMPTS = 3;
export const LINK_RETRY_BASE_MS = 800;

export interface AttachHistoryPayload {
  promptId?: number;
  hld: string;
  formJson: string;
}

export async function attachHistoryWithRetry(
  imageId: number,
  payload: AttachHistoryPayload,
): Promise<{ ok: boolean; prompt_id: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < LINK_RETRY_ATTEMPTS; attempt++) {
    try {
      return await attachImageHistoryApi(imageId, payload);
    } catch (error) {
      lastError = error;
      if (attempt < LINK_RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, LINK_RETRY_BASE_MS * (attempt + 1));
        });
      }
    }
  }
  throw lastError;
}

export function linkFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `HTTP ${error.status}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function historyLinkErrorDetail(error: unknown): string {
  const base = linkFailureMessage(error);
  if (error instanceof ApiError && (error.status === 405 || error.status === 404)) {
    return `${base}. Restart backend with ./run.sh backend.`;
  }
  return base;
}