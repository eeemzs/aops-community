import { DEFAULT_TENANT_AS_UUID_STRING } from '@aopslab/xf-core'
import { z } from 'zod'

const repoUrlSchema = z.string().min(1).optional()

export const EnvSchema = z.object({
  TENANT_ID: z.string().uuid().optional(),
  LOG_LEVEL: z.string().optional(),
  AOPS_REPO_URL: repoUrlSchema,
  AOPS_SQLITE_URL: repoUrlSchema,
  AOPS_PG_URL: repoUrlSchema,
  AGENTSPACE_PG_URL: repoUrlSchema,
  AGENTSPACE_SQLITE_URL: repoUrlSchema,
  AGENTSPACE_REPO_URL: repoUrlSchema,
})

export type AgentspaceKitEnvConfig = {
  tenantId: string
  logLevel: string
  repoUrl: string
}

export type AgentspaceKitEnvEntry = {
  label: string
  config: AgentspaceKitEnvConfig
}

const AGENTSPACE_ENV_KEYS = ['envDefault'] as const
export type AgentspaceKitEnvKey = (typeof AGENTSPACE_ENV_KEYS)[number]
export const DEFAULT_AGENTSPACE_ENV_KEY: AgentspaceKitEnvKey = 'envDefault'

type NormalizedAgentspaceEnv = Partial<Record<keyof z.infer<typeof EnvSchema>, string>>
const AGENTSPACE_ENV_SIGNATURE_KEYS = Object.freeze(Object.keys(EnvSchema.shape) as Array<keyof z.infer<typeof EnvSchema>>)

function resolveRepoUrl(params: { explicit?: string; fallback?: string; label: string }): string {
  const value = params.explicit ?? params.fallback
  if (!value) {
    throw new Error(`Missing required configuration: ${params.label}`)
  }
  return value
}

function normalizeOptionalEnvString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeAgentspaceProcessEnv(processEnv: NodeJS.ProcessEnv): NormalizedAgentspaceEnv {
  const normalizedEntries = Object.entries(processEnv)
    .map(([key, value]) => [key, normalizeOptionalEnvString(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)

  return Object.fromEntries(normalizedEntries) as NormalizedAgentspaceEnv
}

function buildNormalizedAgentspaceEnvSignature(normalizedEnv: NormalizedAgentspaceEnv): string {
  return AGENTSPACE_ENV_SIGNATURE_KEYS
    .map((key) => `${key}=${normalizedEnv[key] ?? ''}`)
    .join('\n')
}

function buildEnvConfigurations(normalizedEnv: NormalizedAgentspaceEnv): Record<AgentspaceKitEnvKey, AgentspaceKitEnvEntry> {
  const parsed = EnvSchema.safeParse(normalizedEnv)
  const e = (parsed.success ? parsed.data : normalizedEnv) as NormalizedAgentspaceEnv

  const parsedTenantId = z.string().uuid().safeParse(e.TENANT_ID)
  const defaultTenantId = parsedTenantId.success ? parsedTenantId.data : DEFAULT_TENANT_AS_UUID_STRING
  const defaultLogLevel = process.env.NODE_ENV === 'development' ? 'debug' : e.LOG_LEVEL ?? 'info'
  const repoUrl = resolveRepoUrl({
    explicit: e.AGENTSPACE_REPO_URL,
    // Resolution order tightened (Codex turn-5 sweep #4 + operator
    // "no fallback" directive): prefer Agentspace/AOPS PG over their
    // SQLITE counterparts so legacy env states do not silently land on
    // sqlite. Hosted plugin runtime guard remains the primary
    // fail-closed surface; this kit-level chain is the standalone path.
    fallback: e.AGENTSPACE_PG_URL ?? e.AGENTSPACE_SQLITE_URL ?? e.AOPS_REPO_URL ?? e.AOPS_PG_URL ?? e.AOPS_SQLITE_URL,
    label: 'AGENTSPACE_REPO_URL (or AGENTSPACE_PG_URL or AGENTSPACE_SQLITE_URL or AOPS_REPO_URL or AOPS_PG_URL or AOPS_SQLITE_URL)',
  })

  return {
    envDefault: {
      label: 'env-default (process.env)',
      config: {
        tenantId: defaultTenantId,
        logLevel: defaultLogLevel,
        repoUrl,
      },
    },
  }
}

let cachedEnvConfigurations: Record<AgentspaceKitEnvKey, AgentspaceKitEnvEntry> | null = null
let cachedEnvSignature: string | null = null

function getEnvConfigurations(): Record<AgentspaceKitEnvKey, AgentspaceKitEnvEntry> {
  const normalizedEnv = normalizeAgentspaceProcessEnv(process.env)
  const signature = buildNormalizedAgentspaceEnvSignature(normalizedEnv)
  if (!cachedEnvConfigurations || cachedEnvSignature !== signature) {
    cachedEnvConfigurations = buildEnvConfigurations(normalizedEnv)
    cachedEnvSignature = signature
  }
  return cachedEnvConfigurations
}

function getAgentspaceKitEnvMatrixInternal(): Array<{ key: AgentspaceKitEnvKey } & AgentspaceKitEnvEntry> {
  const envConfigurations = getEnvConfigurations()
  return (Object.entries(envConfigurations) as Array<[AgentspaceKitEnvKey, AgentspaceKitEnvEntry]>).map(([key, entry]) => ({
    key,
    ...entry,
  }))
}

function createEnvProxy(): AgentspaceKitEnvConfig {
  return new Proxy({} as AgentspaceKitEnvConfig, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      const cfg = getAgentspaceKitEnvConfig()
      if (!(prop in cfg)) return undefined
      return cfg[prop as keyof AgentspaceKitEnvConfig]
    },
    ownKeys() {
      return Reflect.ownKeys(getAgentspaceKitEnvConfig())
    },
    getOwnPropertyDescriptor(_target, prop) {
      const cfg = getAgentspaceKitEnvConfig()
      if (typeof prop === 'string' && prop in cfg) {
        return { enumerable: true, configurable: true, value: cfg[prop as keyof AgentspaceKitEnvConfig] }
      }
      return undefined
    },
  })
}

function createEnvMatrixProxy(): Array<{ key: AgentspaceKitEnvKey } & AgentspaceKitEnvEntry> {
  return new Proxy([] as Array<{ key: AgentspaceKitEnvKey } & AgentspaceKitEnvEntry>, {
    get(_target, prop) {
      return Reflect.get(getAgentspaceKitEnvMatrixInternal(), prop)
    },
    ownKeys() {
      return Reflect.ownKeys(getAgentspaceKitEnvMatrixInternal())
    },
    getOwnPropertyDescriptor(_target, prop) {
      const matrix = getAgentspaceKitEnvMatrixInternal()
      const value = Reflect.get(matrix, prop)
      if (value === undefined) return undefined
      return { enumerable: true, configurable: true, value }
    },
  })
}

export const env: AgentspaceKitEnvConfig = createEnvProxy()

export const agentspaceEnvMatrix: Array<{ key: AgentspaceKitEnvKey } & AgentspaceKitEnvEntry> = createEnvMatrixProxy()

export function getAgentspaceKitEnvConfig(key: AgentspaceKitEnvKey = DEFAULT_AGENTSPACE_ENV_KEY): AgentspaceKitEnvConfig {
  return getEnvConfigurations()[key].config
}

export function clearAgentspaceKitEnvConfigCache(): void {
  cachedEnvConfigurations = null
  cachedEnvSignature = null
}
