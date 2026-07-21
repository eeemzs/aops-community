import { banner, logInfo, logSuccess } from '@aopslab/xf-cli-ui'
import {
  readAopsServerEnvFileContent,
  writeAopsServerEnvFileContent,
} from '@aops/runtime-config'

import { promptPassword } from '../utils/prompts.js'
import {
  buildServerBootstrapEnvMap,
  buildServerBootstrapPreset,
  parseDotEnvAssignments,
  upsertServerBootstrapBlock,
  validateServerBootstrapEnv,
} from './server-bootstrap.js'

export type CommunitySetupServerEnvOptions = Readonly<{
  root?: string
  envPath?: string
  /** Internal setup-init handoff. Never expose the URL as a CLI option. */
  repoUrl?: string
  yes?: boolean
  json?: boolean
  skipBanner?: boolean
}>

export type CommunitySetupServerEnvResult = Readonly<{
  ok: boolean
  action: 'setup.server-env'
  envPath: string
  repoDialect: 'pg'
  updated: boolean
}>

const MAX_POSTGRES_URL_BYTES = 4_096

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

export function resolvePromptedPostgresUrl(
  promptedValue: unknown,
  savedValue: string | undefined,
): string | undefined {
  return normalizeNonEmpty(promptedValue) ?? savedValue
}

function validatePostgresUrl(value: string): string {
  if (/\0|\r|\n/.test(value) || Buffer.byteLength(value, 'utf8') > MAX_POSTGRES_URL_BYTES) {
    throw new Error('setup_server_env_postgres_url_invalid')
  }
  try {
    const parsed = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname) {
      throw new Error('invalid')
    }
  } catch {
    throw new Error('setup_server_env_postgres_url_invalid')
  }
  return value
}

/** Community-safe server-env authoring for path 1. It writes a trusted-local
 * PostgreSQL bootstrap block and never accepts credentials through argv. */
export async function runCommunitySetupServerEnv(
  options: CommunitySetupServerEnvOptions = {},
): Promise<CommunitySetupServerEnvResult> {
  const snapshot = readAopsServerEnvFileContent(process.env, options.envPath)
  const existing = parseDotEnvAssignments(snapshot.content)
  const existingUrl = normalizeNonEmpty(existing.AOPS_PG_URL)
    ?? normalizeNonEmpty(existing.AOPS_REPO_URL)
  const environmentUrl = normalizeNonEmpty(process.env.AOPS_PG_URL)
    ?? normalizeNonEmpty(process.env.AOPS_REPO_URL)

  let repoUrl = normalizeNonEmpty(options.repoUrl) ?? environmentUrl ?? existingUrl
  if (!options.repoUrl && !options.yes && !options.json) {
    if (!options.skipBanner) banner('AOPS Community Server Environment')
    const savedUrl = repoUrl
    const promptedUrl = await promptPassword({
      message: existingUrl || environmentUrl
        ? 'External PostgreSQL URL [saved: ********] (press Enter to keep):'
        : 'External PostgreSQL URL:',
      validate: (value) => {
        if (!value.trim() && savedUrl) return true
        try {
          validatePostgresUrl(value.trim())
          return true
        } catch {
          return 'A PostgreSQL URL is required.'
        }
      },
    })
    repoUrl = resolvePromptedPostgresUrl(promptedUrl, savedUrl)
  }
  if (!repoUrl) {
    throw new Error('setup_server_env_postgres_url_required:use_interactive_prompt_or_AOPS_PG_URL')
  }
  repoUrl = validatePostgresUrl(repoUrl)

  const preset = buildServerBootstrapPreset({
    authProvider: 'trusted-local',
    repoUrl,
    existing,
  })
  const env = buildServerBootstrapEnvMap(preset)
  const validation = validateServerBootstrapEnv(env, {
    authProvider: 'trusted-local',
    repoUrl,
  })
  if (!validation.ok || validation.repoDialect !== 'pg') {
    throw new Error('setup_server_env_postgres_validation_failed')
  }
  const content = upsertServerBootstrapBlock({
    existingContent: snapshot.content,
    env,
    authProvider: 'trusted-local',
    repoUrl,
  })
  const updated = content !== snapshot.content
  const envPath = updated
    ? writeAopsServerEnvFileContent(content, process.env, options.envPath)
    : snapshot.path
  const result: CommunitySetupServerEnvResult = Object.freeze({
    ok: true,
    action: 'setup.server-env',
    envPath,
    repoDialect: 'pg',
    updated,
  })

  if (options.json) console.log(JSON.stringify(result, null, 2))
  else if (!options.skipBanner) {
    logSuccess(updated ? 'Global AOPS server environment is ready.' : 'Global AOPS server environment was already ready.')
    logInfo(`Host env: ${envPath}`)
  }
  return result
}
