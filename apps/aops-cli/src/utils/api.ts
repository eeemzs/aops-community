import {
  createCliApiClient as createCliApiClientBase,
  probeCliRuntimeMode as probeCliRuntimeModeBase,
  resolveCliApiBaseUrl,
  type CliApiClientOptions,
  type CliApiClientState,
} from '@aopslab/cli-kit'

export type CliRuntimeModeProbeResult = {
  authProvider: 'trusted-local' | 'authv2-jwt-session'
  authRequired: boolean
  hasPrincipal: boolean
  principalUserId?: string
}

export type CliPublicJsonFetchOptions = {
  timeoutMs?: number
}

export const createCliApiClient = createCliApiClientBase

export type CliApiBootstrapOptions = Pick<
  CliApiClientOptions,
  'apiBaseUrl' | 'accessToken' | 'refreshToken' | 'timeoutMs'
>

export function buildCliApiClientOptions(
  options: CliApiBootstrapOptions = {},
): CliApiClientOptions {
  return {
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    timeoutMs: options.timeoutMs,
  }
}

export async function createCliApiClientFromOptions(
  options: CliApiBootstrapOptions = {},
): Promise<CliApiClientState> {
  return createCliApiClientBase(buildCliApiClientOptions(options))
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

export async function probeCliRuntimeMode(
  ...args: Parameters<typeof probeCliRuntimeModeBase>
): Promise<CliRuntimeModeProbeResult> {
  return (await probeCliRuntimeModeBase(...args)) as CliRuntimeModeProbeResult
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

export { resolveCliApiBaseUrl, type CliApiClientOptions, type CliApiClientState }

