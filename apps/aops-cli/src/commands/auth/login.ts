import { Command } from 'commander'
import { banner, logError, logInfo, logSuccess } from '@aopslab/xf-cli-ui'
import { createAopsApiClient, xfMessage, type XfResult } from '@aopslab/api-client'

import { promptInput, promptPassword } from '../../utils/prompts.js'
import { clearApiTokensInConfig, setApiTokensInConfig } from '../../utils/config.js'
import {
  createCliApiClientFromOptions,
  fetchCliBootstrapHealth,
  probeCliRuntimeMode,
  resolveCliApiBaseUrl,
  type CliApiClientState,
} from '../../utils/api.js'

type AuthLoginOptions = {
  apiBaseUrl?: string
  target?: string
  email?: string
  password?: string
  timeoutMs?: number
  yes?: boolean
  json?: boolean
}

type AuthLogoutOptions = {
  target?: string
  json?: boolean
}

type LoginResponse = {
  userId?: string
  tokens?: {
    xf_access?: string
    xf_refresh?: string
  }
}

type BootstrapHealth = {
  authProvider?: 'trusted-local' | 'authv2-jwt-session'
  authRequired?: boolean
  auth?: {
    loginSupported?: boolean
    storagePolicyOk?: boolean
    firstAdminState?: 'not-applicable' | 'required' | 'ready' | 'blocked' | 'unknown'
    userCount?: number | null
  }
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function printLoginJson(params: { status: number; ok: boolean; userId?: string; stored: boolean }): void {
  console.log(
    JSON.stringify(
      {
        status: params.status,
        ok: params.ok,
        userId: params.userId ?? null,
        stored: params.stored,
      },
      null,
      2
    )
  )
}

async function fetchBootstrapHealth(apiState: CliApiClientState, timeoutMs?: number) {
  return fetchCliBootstrapHealth<BootstrapHealth>(apiState, { timeoutMs })
}

export async function runAuthLogin(options: AuthLoginOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiBaseUrl = resolveCliApiBaseUrl(options.apiBaseUrl, options.target)
  const apiState = await createCliApiClientFromOptions({
    apiBaseUrl,
    targetName: options.target,
    timeoutMs: options.timeoutMs,
  })
  const runtime = await probeCliRuntimeMode(apiState, { timeoutMs: options.timeoutMs })

  if (runtime.authRequired === false) {
    if (options.json) {
      printLoginJson({
        status: 200,
        ok: true,
        userId: runtime.principalUserId,
        stored: false,
      })
      return
    }

    if (interactive) {
      banner('AOPS CLI Auth Login')
      logInfo(`API: ${apiBaseUrl}`)
    }
    logSuccess('Trusted-local auth is active. Login is disabled and the local principal is already available.')
    return
  }

  let bootstrap: BootstrapHealth = {}
  try {
    bootstrap = await fetchBootstrapHealth(apiState, options.timeoutMs)
  } catch {}

  if (bootstrap.auth?.storagePolicyOk === false) {
    logError('Interactive login is not available on the current storage target. Switch the runtime storage target to PostgreSQL first.')
    process.exitCode = 1
    return
  }

  if (bootstrap.auth?.loginSupported === false) {
    logError('Auth bootstrap is not ready. Complete `aops-cli setup server-env` and restart the server.')
    process.exitCode = 1
    return
  }

  if (bootstrap.auth?.firstAdminState === 'required' && (bootstrap.auth?.userCount ?? 0) === 0) {
    logError('No admin or user exists yet. Run `aops-cli setup first-admin` before attempting login.')
    process.exitCode = 1
    return
  }

  if (interactive) {
    banner('AOPS CLI Auth Login')
    logInfo(`API: ${apiBaseUrl}`)
  }

  let email = normalizeNonEmpty(options.email) ?? normalizeNonEmpty(process.env.AOPS_AUTH_EMAIL)
  if (!email && interactive) {
    email = normalizeNonEmpty(
      await promptInput({
        message: 'Email:',
        validate: (v) => (v.trim().length > 0 ? true : 'Email is required.'),
      })
    )
  }

  let password = normalizeNonEmpty(options.password) ?? normalizeNonEmpty(process.env.AOPS_AUTH_PASSWORD)
  if (!password && interactive) {
    password = normalizeNonEmpty(
      await promptPassword({
        message: 'Password:',
        validate: (v) => (v.trim().length > 0 ? true : 'Password is required.'),
      })
    )
  }

  if (!email || !password) {
    logError('Missing email or password. Run interactively, or set AOPS_AUTH_EMAIL and AOPS_AUTH_PASSWORD for non-interactive use.')
    process.exitCode = 1
    return
  }

  const api = createAopsApiClient({
    baseUrl: apiBaseUrl,
    defaultTimeoutMs: options.timeoutMs,
  })

  let response: { status: number; result: XfResult<LoginResponse> | null; rawText: string }
  try {
    response = await api.requestXfJson<LoginResponse>(
      '/api/auth/login',
      { method: 'POST', body: { email, password } },
      { auth: false, timeoutMs: options.timeoutMs }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to call ${apiBaseUrl}/api/auth/login: ${message}`)
    process.exitCode = 1
    return
  }

  const { status, result } = response
  if (!result || !result.ok) {
    const msg = xfMessage(result, 'login_failed')
    logError(`Failed (${status}): ${msg}`)
    process.exitCode = 1
    return
  }

  const data = result.data as LoginResponse | undefined
  const accessToken = normalizeNonEmpty(data?.tokens?.xf_access)
  const refreshToken = normalizeNonEmpty(data?.tokens?.xf_refresh)
  const userId = normalizeNonEmpty(data?.userId)

  if (!accessToken || !refreshToken) {
    logError('Login succeeded but token payload was missing.')
    process.exitCode = 1
    return
  }

  let stored = false
  try {
    await setApiTokensInConfig({
      accessToken,
      refreshToken,
      userId,
      apiServer: apiBaseUrl,
      targetName: apiState.targetName,
    })
    stored = true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Login succeeded but failed to store tokens: ${message}`)
    process.exitCode = 1
  }

  if (options.json) {
    printLoginJson({ status, ok: true, userId, stored })
    return
  }

  logSuccess(`Logged in: ${email}${userId ? ` (userId: ${userId})` : ''}`)
  if (!stored) {
    logInfo('Warning: tokens were not stored.')
  }
}

export async function runAuthLogout(options: AuthLogoutOptions = {}): Promise<void> {
  const cleared = clearApiTokensInConfig(options.target)

  if (options.json) {
    console.log(JSON.stringify({ ok: true, cleared }, null, 2))
    return
  }

  if (cleared) logSuccess('Local auth tokens cleared.')
  else logInfo('No stored auth tokens were present for the selected target.')
}

export function makeAuthLoginCommand(): Command {
  const cmd = new Command('login').description('Login and store API tokens locally')

  cmd
    .option('--target <name>', 'Named target (must match --api-base-url when both are supplied)')
    .option('--api-base-url <url>', 'API base URL (default: AOPS_API_BASE_URL or http://localhost:5900)')
    .option('--email <email>', 'User email')
    .option('--timeout-ms <ms>', 'Request timeout in milliseconds', (v) => Number.parseInt(String(v), 10))
    .option('--yes', 'Non-interactive (fail if required args are missing)')
    .option('--json', 'Output JSON only')
    .action(async (options: AuthLoginOptions) => {
      await runAuthLogin(options)
    })

  return cmd
}

export function makeAuthLogoutCommand(): Command {
  const cmd = new Command('logout').description('Clear stored API tokens')
  cmd.option('--target <name>', 'Named target; default is the active target')
    .option('--json', 'Output JSON only').action(async (options: AuthLogoutOptions) => {
    await runAuthLogout(options)
  })
  return cmd
}
