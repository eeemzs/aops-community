import { createAopsApiClient, normalizeBaseUrl, type AopsApiClient } from '@aopslab/api-client'

import { ensureApiTokensLoaded, getCachedApiTokens, getConfigApiServer, readApiTokensFromConfigFile, setApiTokensInConfig } from './config.js'
import { createRefreshRaceRecovery } from './refresh-race.js'

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

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveAccessToken(input?: string): string | undefined {
  return (
    normalizeNonEmpty(input) ??
    normalizeNonEmpty(process.env.AOPS_API_ACCESS_TOKEN) ??
    normalizeNonEmpty(process.env.AOPS_API_TOKEN)
  )
}

function resolveRefreshToken(input?: string): string | undefined {
  return normalizeNonEmpty(input) ?? normalizeNonEmpty(process.env.AOPS_API_REFRESH_TOKEN)
}

function resolveDefaultTimeoutMs(): number {
  const raw = normalizeNonEmpty(process.env.AOPS_API_TIMEOUT_MS)
  if (!raw) return 15_000
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 15_000
  return parsed
}

export function resolveCliApiBaseUrl(input?: string): string {
  const explicit = normalizeNonEmpty(input)
  if (explicit) return normalizeBaseUrl(explicit)

  const env = normalizeNonEmpty(process.env.AOPS_API_BASE_URL) ?? normalizeNonEmpty(process.env.AOPS_API_SERVER)
  if (env) return normalizeBaseUrl(env)

  const configBase = getConfigApiServer()
  if (configBase) return normalizeBaseUrl(configBase)

  return normalizeBaseUrl('http://localhost:5900')
}

export async function createCliApiClient(options: CliApiClientOptions = {}): Promise<CliApiClientState> {
  await ensureApiTokensLoaded()

  const baseUrl = resolveCliApiBaseUrl(options.apiBaseUrl)
  const cached = getCachedApiTokens()

  let accessToken = resolveAccessToken(options.accessToken) ?? cached.accessToken
  let refreshToken = resolveRefreshToken(options.refreshToken) ?? cached.refreshToken

  const client = createAopsApiClient({
    baseUrl,
    defaultTimeoutMs: options.timeoutMs ?? resolveDefaultTimeoutMs(),
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    onTokenRefresh: async ({ accessToken: nextAccess, refreshToken: nextRefresh, userId }) => {
      accessToken = nextAccess
      refreshToken = nextRefresh
      try {
        await setApiTokensInConfig({ accessToken: nextAccess, refreshToken: nextRefresh, userId, apiServer: baseUrl })
      } catch {
        // ignore config write failures
      }
      await options.onTokenRefresh?.({ accessToken: nextAccess, refreshToken: nextRefresh, userId })
    },
    // Multi-process recovery: when the server reports a benign concurrent refresh
    // race (409 refresh_race_detected), adopt the token another CLI process already
    // rotated into the shared config instead of failing the request.
    onRefreshRace: createRefreshRaceRecovery({
      getCurrentRefreshToken: () => refreshToken,
      readLatestTokens: async () => {
        const latest = await readApiTokensFromConfigFile()
        if (latest.accessToken && latest.refreshToken) {
          return { accessToken: latest.accessToken, refreshToken: latest.refreshToken, userId: latest.userId }
        }
        return null
      },
      applyTokens: ({ accessToken: nextAccess, refreshToken: nextRefresh }) => {
        accessToken = nextAccess
        refreshToken = nextRefresh
      },
    }),
  })

  return {
    client,
    baseUrl,
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
  }
}

function normalizeAuthProvider(value: unknown): 'trusted-local' | 'authv2-jwt-session' | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'trusted-local' || trimmed === 'trusted_local' || trimmed === 'trusted') {
    return 'trusted-local'
  }
  if (
    trimmed === 'authv2-jwt-session' ||
    trimmed === 'authv2_jwt_session' ||
    trimmed === 'jwt-session' ||
    trimmed === 'jwt_session' ||
    trimmed === 'session'
  ) {
    return 'authv2-jwt-session'
  }
  return undefined
}

export async function probeCliRuntimeMode(
  apiState: CliApiClientState,
  options: { timeoutMs?: number } = {}
): Promise<CliRuntimeModeProbeResult> {
  try {
    const response = await apiState.client.requestXfJson<{
      authProvider?: string
      authRequired?: boolean
      principal?: { userId?: string } | null
    }>(
      '/api/auth/me',
      { method: 'GET' },
      { auth: false, retry401: false, timeoutMs: options.timeoutMs }
    )

    const authProvider =
      normalizeAuthProvider(response.result?.data?.authProvider) ??
      (response.status === 401 ? 'authv2-jwt-session' : undefined) ??
      'authv2-jwt-session'
    const authRequired =
      typeof response.result?.data?.authRequired === 'boolean'
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
    return {
      authProvider: 'authv2-jwt-session',
      authRequired: true,
      hasPrincipal: false,
    }
  }
}

