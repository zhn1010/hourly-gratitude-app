import { logWarn } from "./logger";

export interface HttpClientOptions {
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodyText: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class HttpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpTimeoutError";
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  options: HttpClientOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, init, options);
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON response from ${url}`);
  }
}

export async function fetchArrayBuffer(
  url: string,
  init: RequestInit,
  options: HttpClientOptions = {}
): Promise<ArrayBuffer> {
  const response = await fetchWithRetry(url, init, options);
  return response.arrayBuffer();
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: HttpClientOptions
): Promise<Response> {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (response.ok) {
        return response;
      }

      const bodyText = await response.text();
      const error = new HttpError(`HTTP ${response.status} from ${url}`, response.status, bodyText);
      if (!isRetryableStatus(response.status) || attempt === retries) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === retries) {
        throw error;
      }
    }

    const delayMs = retryBaseDelayMs * 2 ** attempt;
    logWarn("retrying_http_request", { url: safeUrl(url), attempt: attempt + 1, delayMs });
    await sleep(delayMs);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpTimeoutError(`Timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  return error instanceof HttpTimeoutError || !(error instanceof HttpError);
}

function safeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname.replace(/bot[^/]+/, "bot<redacted>");
  return parsed.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
