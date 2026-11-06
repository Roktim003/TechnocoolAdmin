import { api } from "./api-client";

export interface ReadyDocument {
  /** Same-origin URL of the PDF (served inline, so it can be shown in the viewer). */
  url: string;
  fileName: string;
}

interface DocumentStatus {
  status: string;
  downloadUrl: string | null;
  fileName?: string | null;
  failedReason: string | null;
}

/**
 * Waits for a PDF the worker is rendering (`GET /documents/:jobId`) and returns where to fetch it.
 * Polls for up to ~48 s; `signal` stops it when the viewer is closed.
 */
export async function waitForDocument(jobId: string, fallbackName: string, signal?: AbortSignal): Promise<ReadyDocument> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 800));
    if (signal?.aborted) throw new DOMException("Closed", "AbortError");
    const s = (await api<{ data: DocumentStatus }>(`/documents/${jobId}`)).data;
    if (s.status === "completed" && s.downloadUrl) return { url: s.downloadUrl, fileName: s.fileName || fallbackName };
    if (s.status === "failed") throw new Error(s.failedReason ?? "The PDF couldn't be created.");
  }
  throw new Error("The PDF is taking too long. Try again in a minute.");
}
