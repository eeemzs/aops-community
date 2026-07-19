import { Command } from 'commander'
import { banner, logError, logInfo, logSuccess } from '@aopslab/xf-cli-ui'

import { resolveCliApiBaseUrl } from '../../utils/api.js'
import { setApiTokensInConfig } from '../../utils/config.js'

const TOKEN_ENV_ACCESS = ['AOPS_API_ACCESS_TOKEN', 'AOPS_API_TOKEN']
const TOKEN_ENV_REFRESH = ['AOPS_API_REFRESH_TOKEN']

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveFromEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = normalizeNonEmpty(process.env[key])
    if (value) return value
  }
  return undefined
}

type AuthImportOptions = {
  target?: string
  accessToken?: string
  refreshToken?: string
  userId?: string
  apiBaseUrl?: string
  fromEnv?: boolean
  yes?: boolean
  json?: boolean
}

export async function runAuthImport(options: AuthImportOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiBaseUrl = resolveCliApiBaseUrl(options.apiBaseUrl, options.target)

  if (interactive) {
    banner('AOPS CLI Auth Import')
    logInfo(`API: ${apiBaseUrl}`)
  }

  let accessToken = normalizeNonEmpty(options.accessToken)
  let refreshToken = normalizeNonEmpty(options.refreshToken)

  if (options.fromEnv || (!accessToken && !refreshToken)) {
    accessToken = accessToken ?? resolveFromEnv(TOKEN_ENV_ACCESS)
    refreshToken = refreshToken ?? resolveFromEnv(TOKEN_ENV_REFRESH)
  }

  if (!accessToken || !refreshToken) {
    logError('Missing tokens. Load AOPS_API_ACCESS_TOKEN and AOPS_API_REFRESH_TOKEN into the process environment, then use --from-env.')
    process.exitCode = 1
    return
  }

  const userId = normalizeNonEmpty(options.userId)

  try {
    await setApiTokensInConfig({ accessToken, refreshToken, userId, apiServer: apiBaseUrl, targetName: options.target })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to store tokens: ${message}`)
    process.exitCode = 1
    return
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          stored: true,
          apiBaseUrl,
          userId: userId ?? null,
        },
        null,
        2
      )
    )
    return
  }

  logSuccess('Tokens stored in ~/.aops/aops.config.json')
}

export function makeAuthImportCommand(): Command {
  const cmd = new Command('import').description('Store access/refresh tokens locally (no password)')
  cmd
    .option('--target <name>', 'Named target (must match --api-base-url when both are supplied)')
    .option('--user-id <id>', 'Optional user id for bookkeeping')
    .option('--api-base-url <url>', 'API base URL (default: AOPS_API_BASE_URL or http://localhost:5900)')
    .option('--from-env', 'Read tokens from environment variables')
    .option('--yes', 'Non-interactive (fail if required args are missing)')
    .option('--json', 'Output JSON only')
    .action(async (options: AuthImportOptions) => {
      await runAuthImport(options)
    })

  return cmd
}
