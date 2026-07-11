import { useApiActivityStore } from "../state/apiActivityStore";

export interface XfMessage {
  messageText?: string;
  opts?: Record<string, unknown>;
}

export interface XfResult<T> {
  ok?: boolean;
  data?: T;
  messages?: XfMessage[];
  message?: string;
  error?: { message?: string };
}

export interface AopsApiIdentity {
  baseUrl: string;
  projectId: string | null;
  scopeId: string | null;
}

export interface AopsApiClient {
  identity: AopsApiIdentity;
  requestResult: <T>(path: string, options?: AopsApiRequestOptions) => Promise<AopsApiResponse<T>>;
  requestData: <T>(path: string, options?: AopsApiRequestOptions) => Promise<T>;
  get: <T>(path: string, query?: Record<string, QueryValue>) => Promise<T>;
  post: <T>(path: string, body?: unknown, options?: AopsApiRequestOptions) => Promise<T>;
  patch: <T>(path: string, body?: unknown, options?: AopsApiRequestOptions) => Promise<T>;
  del: <T>(path: string, options?: AopsApiRequestOptions) => Promise<T>;
}

export interface AopsApiClientInput {
  baseUrl: string;
  projectId?: string | null;
  scopeId?: string | null;
}

export interface AopsApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

export interface AopsApiResponse<T> {
  status: number;
  statusText: string;
  httpOk: boolean;
  result: XfResult<T> | null;
  raw: unknown;
  headers: Headers;
}

export type QueryValue = string | number | boolean | null | undefined;

export class AopsApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly result: XfResult<unknown> | null;

  constructor(params: {
    message: string;
    status: number;
    statusText: string;
    result?: XfResult<unknown> | null;
  }) {
    super(params.message);
    this.name = "AopsApiError";
    this.status = params.status;
    this.statusText = params.statusText;
    this.result = params.result ?? null;
  }
}

export function createAopsApiClient(input: AopsApiClientInput): AopsApiClient {
  const identity: AopsApiIdentity = {
    baseUrl: normalizeLoopbackBaseUrl(input.baseUrl),
    projectId: normalizeNullable(input.projectId),
    scopeId: normalizeNullable(input.scopeId)
  };

  const requestResult = async <T>(
    requestPath: string,
    options: AopsApiRequestOptions = {}
  ): Promise<AopsApiResponse<T>> => {
    const url = withQuery(
      resolveSameOriginUrl(requestPath, identity.baseUrl),
      options.query
    );
    const hasBody = options.body !== undefined;
    const method = options.method ?? (hasBody ? "POST" : "GET");
    const activity = useApiActivityStore.getState();
    const startedAt = Date.now();
    activity.beginRequest();
    try {
      const response = await fetchResult(url, identity, options, hasBody);
      const raw = await parseJsonResult(response);
      const result = isRecord(raw) ? (raw as XfResult<T>) : null;
      const resultOk = response.ok && result?.ok !== false;
      activity.endRequest({
        level: resultOk ? "info" : "error",
        message: method + " " + url.pathname + " -> " + response.status,
        data: {
          method,
          url: url.pathname,
          status: response.status,
          ms: Date.now() - startedAt,
          ok: resultOk
        }
      });
      return {
        status: response.status,
        statusText: response.statusText,
        httpOk: response.ok,
        result,
        raw,
        headers: response.headers
      };
    } catch (error) {
      activity.endRequest({
        level: "error",
        message: method + " " + url.pathname + " -> " +
          (error instanceof Error ? error.message : "error"),
        data: {
          method,
          url: url.pathname,
          ms: Date.now() - startedAt,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  };

  const requestData = async <T>(
    requestPath: string,
    options: AopsApiRequestOptions = {}
  ): Promise<T> => {
    const response = await requestResult<T>(requestPath, options);
    if (!response.httpOk || response.result?.ok === false) {
      throw new AopsApiError({
        message: responseMessage(response, "aops_api_request_failed"),
        status: response.status,
        statusText: response.statusText,
        result: response.result as XfResult<unknown> | null
      });
    }
    if (response.result && Object.prototype.hasOwnProperty.call(response.result, "data")) {
      return response.result.data as T;
    }
    return response.raw as T;
  };

  return {
    identity,
    requestResult,
    requestData,
    get: <T>(requestPath: string, query?: Record<string, QueryValue>) =>
      requestData<T>(requestPath, { method: "GET", query }),
    post: <T>(requestPath: string, body?: unknown, options: AopsApiRequestOptions = {}) =>
      requestData<T>(requestPath, { ...options, method: "POST", body: body ?? {} }),
    patch: <T>(requestPath: string, body?: unknown, options: AopsApiRequestOptions = {}) =>
      requestData<T>(requestPath, { ...options, method: "PATCH", body: body ?? {} }),
    del: <T>(requestPath: string, options: AopsApiRequestOptions = {}) =>
      requestData<T>(requestPath, { ...options, method: "DELETE" })
  };
}

async function fetchResult(
  url: URL,
  identity: AopsApiIdentity,
  options: AopsApiRequestOptions,
  hasBody: boolean
): Promise<Response> {
  try {
    return await fetch(url, {
      method: options.method ?? (hasBody ? "POST" : "GET"),
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: options.signal,
      headers: buildHeaders(identity, options.headers, hasBody),
      body: hasBody ? JSON.stringify(options.body ?? {}) : undefined
    });
  } catch (error) {
    throw new AopsApiError({
      message: error instanceof Error ? error.message : "network_error",
      status: 0,
      statusText: "network_error"
    });
  }
}

export function xfMessages(result: XfResult<unknown> | null | undefined): string[] {
  if (!result?.messages?.length) return [];
  return result.messages
    .map((message) => message.messageText?.trim())
    .filter((message): message is string => Boolean(message));
}

export function responseMessage<T>(response: AopsApiResponse<T>, fallback: string): string {
  const messages = xfMessages(response.result as XfResult<unknown> | null);
  if (messages.length) return messages.join("; ");
  return response.result?.error?.message ?? response.result?.message ?? fallback;
}

export function apiErrorMessage(error: unknown, fallback = "request_failed"): string {
  if (error instanceof AopsApiError) {
    const messages = xfMessages(error.result);
    if (messages.length) return messages.join("; ");
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

function normalizeLoopbackBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new AopsApiError({
      message: "community_cockpit_invalid_server_url",
      status: 0,
      statusText: "invalid_server_url"
    });
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    !isLoopbackHostname(parsed.hostname)
  ) {
    throw new AopsApiError({
      message: "community_cockpit_loopback_server_required",
      status: 0,
      statusText: "loopback_server_required"
    });
  }
  return parsed.origin;
}

function isLoopbackHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  return octets[0] === 127 && octets.every((octet) => octet >= 0 && octet <= 255);
}

function resolveSameOriginUrl(requestPath: string, baseUrl: string): URL {
  const url = new URL(requestPath, baseUrl + "/");
  if (url.origin !== baseUrl || url.username || url.password) {
    throw new AopsApiError({
      message: "community_cockpit_cross_origin_request_rejected",
      status: 0,
      statusText: "cross_origin_request_rejected"
    });
  }
  for (const name of url.searchParams.keys()) assertSafeQueryKey(name);
  return url;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function withQuery(url: URL, query?: Record<string, QueryValue>): URL {
  if (!query) return url;
  for (const [key, value] of Object.entries(query)) {
    assertSafeQueryKey(key);
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildHeaders(
  identity: AopsApiIdentity,
  headers: HeadersInit | undefined,
  hasBody: boolean
): Headers {
  const next = new Headers(headers);
  for (const name of [...next.keys()]) {
    if (isCallerAuthHeader(name)) next.delete(name);
  }
  next.set("accept", "application/json");
  if (hasBody && !next.has("content-type")) next.set("content-type", "application/json");
  if (identity.projectId) next.set("x-project-id", identity.projectId);
  if (identity.scopeId) next.set("x-scope-id", identity.scopeId);
  return next;
}

function isCallerAuthHeader(name: string): boolean {
  const normalized = normalizeCredentialHeaderName(name);
  return normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("session") ||
    normalized.endsWith("token") ||
    normalized.includes("accesstoken") ||
    normalized.includes("apikey") ||
    normalized.includes("password") ||
    normalized.includes("secret");
}

function normalizeCredentialHeaderName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function assertSafeQueryKey(name: string): void {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("session") ||
    normalized.endsWith("token") ||
    normalized.includes("apikey") ||
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("credential") ||
    normalized.includes("bearer") ||
    normalized.includes("csrf") ||
    normalized.includes("xsrf") ||
    normalized === "jwt" ||
    normalized.endsWith("jwt")
  ) {
    throw new AopsApiError({
      message: "community_cockpit_credential_query_rejected",
      status: 0,
      statusText: "credential_query_rejected"
    });
  }
}

async function parseJsonResult(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new AopsApiError({
      message: error instanceof Error ? error.message : "invalid_json_response",
      status: response.status,
      statusText: response.statusText
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
