import { createAopsApiClient, type AopsApiClient } from '@aopslab/api-client'

import {
  ensureApiTokensLoaded,
  findApiTargetByBaseUrl,
  getActiveApiTarget,
  getApiTarget,
  getCachedApiTokens,
  normalizeApiTargetBaseUrl,
  readApiTokensFromConfigFile,
  setApiTokensInConfig,
  validateApiTarget,
} from './config.js'
import { createRefreshRaceRecovery } from './refresh-race.js'

export type CliApiClientState = {
  client: AopsApiClient
  baseUrl: string
  targetName?: string
  endpointSource: 'option' | 'environment' | 'target' | 'default'
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
  targetName?: string
  accessToken?: string
  refreshToken?: string
  timeoutMs?: number
  onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string; userId?: string }) => void | Promise<void>
}

export type CliApiTargetResolution = {
  baseUrl: string
  targetName?: string
  endpointSource: 'option' | 'environment' | 'target' | 'default'
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveAccessToken(input?: string, allowEnvironment = true): string | undefined {
  return (
    normalizeNonEmpty(input) ??
    (allowEnvironment ? normalizeNonEmpty(process.env.AOPS_API_ACCESS_TOKEN) : undefined) ??
    (allowEnvironment ? normalizeNonEmpty(process.env.AOPS_API_TOKEN) : undefined)
  )
}

function resolveRefreshToken(input?: string, allowEnvironment = true): string | undefined {
  return normalizeNonEmpty(input) ??
    (allowEnvironment ? normalizeNonEmpty(process.env.AOPS_API_REFRESH_TOKEN) : undefined)
}

function resolveDefaultTimeoutMs(): number {
  const raw = normalizeNonEmpty(process.env.AOPS_API_TIMEOUT_MS)
  if (!raw) return 15_000
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 15_000
  return parsed
}

export function resolveCliApiTarget(input?: string, targetName?: string): CliApiTargetResolution {
  const explicit = normalizeNonEmpty(input)
  const selectedTarget = normalizeNonEmpty(targetName)
  if (selectedTarget) {
    const target = getApiTarget(selectedTarget)
    if (!target) throw new Error(`aops_target_not_found:${selectedTarget}`)
    if (explicit && normalizeApiTargetBaseUrl(explicit) !== target.apiBaseUrl) {
      throw new Error('aops_target_api_base_url_mismatch')
    }
    return { baseUrl: target.apiBaseUrl, targetName: target.name, endpointSource: 'target' }
  }
  if (explicit) {
    const baseUrl = validateApiTarget({ apiBaseUrl: explicit }).apiBaseUrl
    return {
      baseUrl,
      targetName: findApiTargetByBaseUrl(baseUrl)?.name,
      endpointSource: 'option',
    }
  }

  const env = normalizeNonEmpty(process.env.AOPS_API_BASE_URL) ?? normalizeNonEmpty(process.env.AOPS_API_SERVER)
  if (env) {
    const baseUrl = validateApiTarget({ apiBaseUrl: env }).apiBaseUrl
    return {
      baseUrl,
      targetName: findApiTargetByBaseUrl(baseUrl)?.name,
      endpointSource: 'environment',
    }
  }

  const activeTarget = getActiveApiTarget()
  if (activeTarget) {
    return {
      baseUrl: activeTarget.apiBaseUrl,
      targetName: activeTarget.name,
      endpointSource: 'target',
    }
  }

  return { baseUrl: validateApiTarget({ apiBaseUrl: 'http://localhost:5900' }).apiBaseUrl, endpointSource: 'default' }
}

export function resolveCliApiBaseUrl(input?: string, targetName?: string): string {
  return resolveCliApiTarget(input, targetName).baseUrl
}

export async function createCliApiClient(options: CliApiClientOptions = {}): Promise<CliApiClientState> {
  const resolution = resolveCliApiTarget(options.apiBaseUrl, options.targetName)
  await ensureApiTokensLoaded(resolution.targetName)

  const baseUrl = resolution.baseUrl
  const cached = resolution.targetName ? getCachedApiTokens(resolution.targetName) : {}

  const allowEnvironmentTokens = resolution.targetName === undefined
  let accessToken = resolveAccessToken(options.accessToken, allowEnvironmentTokens) ?? cached.accessToken
  let refreshToken = resolveRefreshToken(options.refreshToken, allowEnvironmentTokens) ?? cached.refreshToken
  let credentialRevision = cached.credentialRevision

  const client = createAopsApiClient({
    baseUrl,
    defaultTimeoutMs: options.timeoutMs ?? resolveDefaultTimeoutMs(),
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    onTokenRefresh: async ({ accessToken: nextAccess, refreshToken: nextRefresh, userId }) => {
      const expectedCredentialRevision = credentialRevision
      accessToken = nextAccess
      refreshToken = nextRefresh
      if (resolution.targetName) {
        try {
          credentialRevision = await setApiTokensInConfig({
            accessToken: nextAccess,
            refreshToken: nextRefresh,
            userId,
            apiServer: baseUrl,
            targetName: resolution.targetName,
            expectedCredentialRevision,
          })
        } catch {
          // Keep the request token in memory; the caller can diagnose an unavailable credential store.
        }
      }
      await options.onTokenRefresh?.({ accessToken: nextAccess, refreshToken: nextRefresh, userId })
    },
    // Multi-process recovery: when the server reports a benign concurrent refresh
    // race (409 refresh_race_detected), adopt the token another CLI process already
    // rotated into the shared config instead of failing the request.
    onRefreshRace: resolution.targetName ? createRefreshRaceRecovery({
      getCurrentRefreshToken: () => refreshToken,
      readLatestTokens: async () => {
        const latest = await readApiTokensFromConfigFile(resolution.targetName)
        if (latest.accessToken && latest.refreshToken) {
          credentialRevision = latest.credentialRevision
          return { accessToken: latest.accessToken, refreshToken: latest.refreshToken, userId: latest.userId }
        }
        return null
      },
      applyTokens: ({ accessToken: nextAccess, refreshToken: nextRefresh }) => {
        accessToken = nextAccess
        refreshToken = nextRefresh
      },
    }) : async () => false,
  })

  return {
    client,
    baseUrl,
    targetName: resolution.targetName,
    endpointSource: resolution.endpointSource,
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

export type CliPublicJsonFetchOptions = {
  timeoutMs?: number
}

export type CliApiBootstrapOptions = Pick<
  CliApiClientOptions,
  'apiBaseUrl' | 'targetName' | 'accessToken' | 'refreshToken' | 'timeoutMs'
>

export function buildCliApiClientOptions(
  options: CliApiBootstrapOptions = {},
): CliApiClientOptions {
  return {
    apiBaseUrl: options.apiBaseUrl,
    targetName: options.targetName,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    timeoutMs: options.timeoutMs,
  }
}

export async function createCliApiClientFromOptions(
  options: CliApiBootstrapOptions = {},
): Promise<CliApiClientState> {
  return createCliApiClient(buildCliApiClientOptions(options))
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
