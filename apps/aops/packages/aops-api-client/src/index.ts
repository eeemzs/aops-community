export type XfMessage = { messageText: string; opts?: Record<string, unknown> }
export type XfResult<T> = { ok: boolean; data?: T; messages?: XfMessage[] }

export type RequestXfJsonResponse<T> = {
  status: number
  result: XfResult<T> | null
  rawText: string
}

export type RequestJsonResponse<T> = {
  status: number
  json: T | null
  rawText: string
}

export type AopsApiTokens = {
  accessToken: string
  refreshToken: string
  userId?: string
}

export type AopsApiClient = {
  baseUrl: string
  refreshTokens(): Promise<boolean>
  fetchJson<T>(
    pathOrUrl: string,
    options?: {
      method?: string
      body?: unknown
      headers?: Record<string, string>
      timeoutMs?: number
      auth?: boolean
      retry401?: boolean
    }
  ): Promise<T>
  requestXfJson<T>(
    pathOrUrl: string,
    init: { method: string; body?: unknown },
    options?: { headers?: Record<string, string>; timeoutMs?: number; auth?: boolean; retry401?: boolean }
  ): Promise<RequestXfJsonResponse<T>>
  postXfJson<T>(
    pathOrUrl: string,
    body: unknown,
    options?: { headers?: Record<string, string>; timeoutMs?: number; auth?: boolean; retry401?: boolean }
  ): Promise<RequestXfJsonResponse<T>>
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, '')
}

export function joinUrl(baseUrl: string, subPath: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  const normalizedPath = subPath.startsWith('/') ? subPath : `/${subPath}`
  return `${normalizedBase}${normalizedPath}`
}

export function resolveApiBaseUrl(input?: string): string {
  const value =
    normalizeNonEmpty(input) ??
    normalizeNonEmpty(process.env.AOPS_API_BASE_URL) ??
    normalizeNonEmpty(process.env.AOPS_API_SERVER) ??
    'http://localhost:5900'

  return normalizeBaseUrl(value)
}

export function xfMessage(result: XfResult<unknown> | null | undefined, fallback: string): string {
  if (!result) return fallback
  if (result.ok) return fallback
  if (Array.isArray(result.messages) && result.messages.length > 0) {
    return result.messages.map((m) => m.messageText).filter(Boolean).join('; ') || fallback
  }
  return fallback
}

async function requestJsonOnce<T>(
  fetchFn: typeof fetch,
  url: string,
  init: { method: string; body?: unknown },
  options?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<RequestJsonResponse<T>> {
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10_000

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const method = normalizeNonEmpty(init?.method) ?? 'GET'
    const body = init?.body
    const res = await fetchFn(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(options?.headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body ?? {}),
      signal: controller.signal,
    })

    const rawText = await res.text().catch(() => '')
    let parsed: T | null = null
    try {
      parsed = rawText ? (JSON.parse(rawText) as T) : null
    } catch {
      parsed = null
    }
    return { status: res.status, json: parsed, rawText }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function requestXfJsonOnce<T>(
  fetchFn: typeof fetch,
  url: string,
  init: { method: string; body?: unknown },
  options?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<RequestXfJsonResponse<T>> {
  const { status, json, rawText } = await requestJsonOnce<XfResult<T>>(fetchFn, url, init, options)
  return { status, result: json, rawText }
}

function tokenPairFromRefreshResult(data: unknown): { accessToken?: string; refreshToken?: string; userId?: string } {
  if (!data || typeof data !== 'object') return {}
  const anyData = data as any
  const tokens = anyData.tokens
  const accessToken = normalizeNonEmpty(tokens?.xf_access)
  const refreshToken = normalizeNonEmpty(tokens?.xf_refresh)
  const userId = normalizeNonEmpty(anyData.userId)
  return { accessToken, refreshToken, userId }
}

export function createAopsApiClient(options: {
  baseUrl: string
  getAccessToken?: () => string | undefined
  getRefreshToken?: () => string | undefined
  onTokenRefresh?: (tokens: AopsApiTokens) => Promise<void> | void
  onRefreshRace?: () => Promise<boolean> | boolean
  fetchFn?: typeof fetch
  defaultHeaders?: Record<string, string>
  defaultTimeoutMs?: number
}): AopsApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchFn = options.fetchFn ?? fetch

  // Single-flight refresh: multiple concurrent 401s should not trigger parallel refresh calls.
  // This avoids refresh token rotation races (stale refresh token) and reduces load.
  let refreshInFlight: Promise<boolean> | null = null

  const buildAuthHeaders = (): Record<string, string> => {
    const token = options.getAccessToken?.()
    if (!token) return {}
    return { authorization: `Bearer ${token}` }
  }

  const resolveUrl = (pathOrUrl: string): string => {
    if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl
    return joinUrl(baseUrl, pathOrUrl)
  }

  const fetchJson = async <T>(
    pathOrUrl: string,
    reqOptions?: {
      method?: string
      body?: unknown
      headers?: Record<string, string>
      timeoutMs?: number
      auth?: boolean
      retry401?: boolean
    }
  ): Promise<T> => {
    const url = resolveUrl(pathOrUrl)
    const wantsAuth = reqOptions?.auth !== false
    const wantsRetry = reqOptions?.retry401 !== false
    const headers = {
      ...(options.defaultHeaders ?? {}),
      ...(wantsAuth ? buildAuthHeaders() : {}),
      ...(reqOptions?.headers ?? {}),
    }

    const method = normalizeNonEmpty(reqOptions?.method) ?? 'GET'

    let first = await requestJsonOnce<T>(fetchFn, url, { method, body: reqOptions?.body }, {
      headers,
      timeoutMs: reqOptions?.timeoutMs ?? options.defaultTimeoutMs,
    })

    const isRefreshCall = url.includes('/api/auth/refresh')
    if (wantsAuth && wantsRetry && first.status === 401 && !isRefreshCall) {
      const refreshed = await refreshTokens().catch(() => false)
      if (refreshed) {
        const retryHeaders = {
          ...(options.defaultHeaders ?? {}),
          ...(wantsAuth ? buildAuthHeaders() : {}),
          ...(reqOptions?.headers ?? {}),
        }
        first = await requestJsonOnce<T>(fetchFn, url, { method, body: reqOptions?.body }, {
          headers: retryHeaders,
          timeoutMs: reqOptions?.timeoutMs ?? options.defaultTimeoutMs,
        })
      }
    }

    if (first.status < 200 || first.status >= 300) {
      throw new Error(`API ${first.status}: ${first.rawText || 'request_failed'}`)
    }
    if (first.json === null) {
      throw new Error(`API ${first.status}: invalid_json_response`)
    }

    return first.json
  }

  const refreshTokens = async (): Promise<boolean> => {
    if (refreshInFlight) return refreshInFlight

    refreshInFlight = (async (): Promise<boolean> => {
    const refreshToken = options.getRefreshToken?.()
    if (!refreshToken) return false

    const { status, result } = await requestXfJsonOnce<{
      tokens?: { xf_access?: string; xf_refresh?: string }
      userId?: string
    }>(
      fetchFn,
      joinUrl(baseUrl, '/api/auth/refresh'),
      { method: 'POST', body: { refreshToken } },
      {
        headers: {
          ...(options.defaultHeaders ?? {}),
        },
        timeoutMs: options.defaultTimeoutMs,
      }
    )

    if (
      status === 409 &&
      Array.isArray(result?.messages) &&
      result.messages.some((message) => message?.messageText === 'refresh_race_detected')
    ) {
      const recovered = await options.onRefreshRace?.()
      if (recovered) return true
    }

    if (status !== 200 || !result?.ok) return false
    const pair = tokenPairFromRefreshResult(result.data)
    if (!pair.accessToken || !pair.refreshToken) return false

    await options.onTokenRefresh?.({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      userId: pair.userId,
    })
    return true
    })()

    try {
      return await refreshInFlight
    } finally {
      refreshInFlight = null
    }
  }

  const requestXfJson = async <T>(
    pathOrUrl: string,
    init: { method: string; body?: unknown },
    reqOptions?: { headers?: Record<string, string>; timeoutMs?: number; auth?: boolean; retry401?: boolean }
  ): Promise<RequestXfJsonResponse<T>> => {
    const url = resolveUrl(pathOrUrl)
    const wantsAuth = reqOptions?.auth !== false
    const wantsRetry = reqOptions?.retry401 !== false

    const headers = {
      ...(options.defaultHeaders ?? {}),
      ...(wantsAuth ? buildAuthHeaders() : {}),
      ...(reqOptions?.headers ?? {}),
    }

    let first = await requestXfJsonOnce<T>(fetchFn, url, init, {
      headers,
      timeoutMs: reqOptions?.timeoutMs ?? options.defaultTimeoutMs,
    })

    const isRefreshCall = url.includes('/api/auth/refresh')
    if (wantsAuth && wantsRetry && first.status === 401 && !isRefreshCall) {
      const refreshed = await refreshTokens().catch(() => false)
      if (refreshed) {
        const retryHeaders = {
          ...(options.defaultHeaders ?? {}),
          ...(wantsAuth ? buildAuthHeaders() : {}),
          ...(reqOptions?.headers ?? {}),
        }
        first = await requestXfJsonOnce<T>(fetchFn, url, init, {
          headers: retryHeaders,
          timeoutMs: reqOptions?.timeoutMs ?? options.defaultTimeoutMs,
        })
      }
    }

    return first
  }

  const postXfJson = async <T>(
    pathOrUrl: string,
    body: unknown,
    reqOptions?: { headers?: Record<string, string>; timeoutMs?: number; auth?: boolean; retry401?: boolean }
  ): Promise<RequestXfJsonResponse<T>> => {
    return requestXfJson<T>(pathOrUrl, { method: 'POST', body }, reqOptions)
  }

  return {
    baseUrl,
    fetchJson,
    refreshTokens,
    requestXfJson,
    postXfJson,
  }
}

export async function requestXfJson<T>(
  url: string,
  init: { method: string; body?: unknown },
  options?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<RequestXfJsonResponse<T>> {
  return requestXfJsonOnce<T>(fetch, url, init, options)
}

export async function postXfJson<T>(
  url: string,
  body: unknown,
  options?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<RequestXfJsonResponse<T>> {
  return requestXfJson<T>(url, { method: 'POST', body }, options)
}
