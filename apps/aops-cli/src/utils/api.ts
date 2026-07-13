import { createAopsApiClient, normalizeBaseUrl, type AopsApiClient } from '@aopslab/api-client'

export type CliApiClientState = {
  client: AopsApiClient
  baseUrl: string
  getAccessToken: () => string | undefined
  getRefreshToken: () => string | undefined
}

export type CliRuntimeModeProbeResult = {
  authProvider: 'trusted-local' | 'authv2-jwt-session'
  authRequired: boolean
  hasPrincipal: boolean
  principalUserId?: string
}

export type CliApiClientOptions = {
  apiBaseUrl?: string
  accessToken?: string
  refreshToken?: string
  timeoutMs?: number
  onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string; userId?: string }) => void | Promise<void>
}

export type CliApiBootstrapOptions = Pick<
  CliApiClientOptions,
  'apiBaseUrl' | 'accessToken' | 'refreshToken' | 'timeoutMs'
>

export type CliPublicJsonFetchOptions = { timeoutMs?: number }

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function resolveDefaultTimeoutMs(): number {
  const parsed = Number.parseInt(normalizeNonEmpty(process.env.AOPS_API_TIMEOUT_MS) ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000
}

export function resolveCliApiBaseUrl(input?: string): string {
  return normalizeBaseUrl(
    normalizeNonEmpty(input)
      ?? normalizeNonEmpty(process.env.AOPS_API_BASE_URL)
      ?? normalizeNonEmpty(process.env.AOPS_API_SERVER)
      ?? 'http://localhost:5900',
  )
}

export async function createCliApiClient(
  options: CliApiClientOptions = {},
): Promise<CliApiClientState> {
  const baseUrl = resolveCliApiBaseUrl(options.apiBaseUrl)
  let accessToken = normalizeNonEmpty(options.accessToken)
    ?? normalizeNonEmpty(process.env.AOPS_API_ACCESS_TOKEN)
    ?? normalizeNonEmpty(process.env.AOPS_API_TOKEN)
  let refreshToken = normalizeNonEmpty(options.refreshToken)
    ?? normalizeNonEmpty(process.env.AOPS_API_REFRESH_TOKEN)
  const client = createAopsApiClient({
    baseUrl,
    defaultTimeoutMs: options.timeoutMs ?? resolveDefaultTimeoutMs(),
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    onTokenRefresh: async ({ accessToken: nextAccess, refreshToken: nextRefresh, userId }) => {
      accessToken = nextAccess
      refreshToken = nextRefresh
      await options.onTokenRefresh?.({ accessToken: nextAccess, refreshToken: nextRefresh, userId })
    },
  })
  return {
    client,
    baseUrl,
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
  }
}

export async function createCliApiClientFromOptions(
  options: CliApiBootstrapOptions = {},
): Promise<CliApiClientState> {
  return createCliApiClient(options)
}

export async function fetchCliPublicJson<T = unknown>(
  apiState: CliApiClientState,
  path: string,
  options: CliPublicJsonFetchOptions = {},
): Promise<T> {
  return apiState.client.fetchJson<T>(path, {
    method: 'GET',
    auth: false,
    retry401: false,
    timeoutMs: options.timeoutMs,
  })
}

export async function fetchCliHealth(
  apiState: CliApiClientState,
  options: CliPublicJsonFetchOptions = {},
): Promise<Record<string, any>> {
  return fetchCliPublicJson<Record<string, any>>(apiState, '/api/health', options)
}

export async function fetchCliBootstrapHealth<T = Record<string, unknown>>(
  apiState: CliApiClientState,
  options: CliPublicJsonFetchOptions = {},
): Promise<T> {
  const payload = await fetchCliHealth(apiState, options)
  return ((payload?.data?.bootstrap ?? {}) as T)
}

function normalizeAuthProvider(value: unknown): CliRuntimeModeProbeResult['authProvider'] | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replaceAll('_', '-')
  if (normalized === 'trusted-local' || normalized === 'trusted') return 'trusted-local'
  if (normalized === 'authv2-jwt-session' || normalized === 'jwt-session' || normalized === 'session') {
    return 'authv2-jwt-session'
  }
  return undefined
}

export async function probeCliRuntimeMode(
  apiState: CliApiClientState,
  options: { timeoutMs?: number } = {},
): Promise<CliRuntimeModeProbeResult> {
  try {
    const response = await apiState.client.requestXfJson<{
      authProvider?: string
      authRequired?: boolean
      principal?: { userId?: string } | null
    }>('/api/auth/me', { method: 'GET' }, { auth: false, retry401: false, timeoutMs: options.timeoutMs })
    const authProvider = normalizeAuthProvider(response.result?.data?.authProvider)
      ?? (response.status === 401 ? 'authv2-jwt-session' : 'authv2-jwt-session')
    const authRequired = typeof response.result?.data?.authRequired === 'boolean'
      ? response.result.data.authRequired
      : authProvider === 'authv2-jwt-session'
    const principalUserId = normalizeNonEmpty(response.result?.data?.principal?.userId)
    return {
      authProvider,
      authRequired,
      hasPrincipal: response.status === 200 && response.result?.ok === true && Boolean(principalUserId),
      principalUserId,
    }
  } catch {
    return { authProvider: 'authv2-jwt-session', authRequired: true, hasPrincipal: false }
  }
}

export async function isCliAuthRequired(
  apiState: CliApiClientState,
  options: CliPublicJsonFetchOptions = {},
): Promise<boolean> {
  return (await probeCliRuntimeMode(apiState, { timeoutMs: options.timeoutMs })).authRequired
}

export async function isCliHostReachable(
  apiState: CliApiClientState,
  options: CliPublicJsonFetchOptions = {},
): Promise<boolean> {
  try {
    await fetchCliHealth(apiState, options)
    return true
  } catch {
    return false
  }
}
