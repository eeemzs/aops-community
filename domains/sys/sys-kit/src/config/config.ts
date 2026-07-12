import { DEFAULT_TENANT_AS_UUID_STRING } from '@aopslab/xf-core'
import { z } from 'zod'

export const EnvSchema = z.object({
  TENANT_ID: z.string().uuid().optional(),
  LOG_LEVEL: z.string().optional(),
  SYS_REPO_URL: z.string().url().optional(),
  AOPS_PG_URL: z.string().url().optional(),
  DEV_PG_URL: z.string().url().optional(),
  POSTGRES_URL_LOCAL: z.string().url().optional(),
  POSTGRES_URL: z.string().url().optional(),
  SYS_RATE_LIMITER_REPO_URL: z.string().url().optional(),
  SYS_EVENT_STORE_REPO_URL: z.string().url().optional(),
  SYS_COUNTER_REPO_URL: z.string().url().optional(),
  RATE_LIMITER_REPO_URL: z.string().url().optional(),
  EVENT_STORE_REPO_URL: z.string().url().optional(),
  COUNTER_REPO_URL: z.string().url().optional(),
})

export type SysKitEnvConfig = {
  tenantId: string
  logLevel: string
  rateLimiterRepoUrl: string
  eventStoreRepoUrl: string
  counterRepoUrl: string
}

export type SysKitEnvEntry = {
  label: string
  config: SysKitEnvConfig
}

const SYS_ENV_KEYS = ['envDefault'] as const
export type SysKitEnvKey = (typeof SYS_ENV_KEYS)[number]
export const DEFAULT_SYS_ENV_KEY: SysKitEnvKey = 'envDefault'

function resolveRepoUrl(params: { explicit?: string; fallback?: string; label: string }): string {
  const value = params.explicit ?? params.fallback
  if (!value) {
    throw new Error(`Missing required configuration: ${params.label}`)
  }
  return value
}

function buildEnvConfigurations(): Record<SysKitEnvKey, SysKitEnvEntry> {
  const parsed = EnvSchema.safeParse(process.env)
  const e = parsed.success ? parsed.data : ({} as z.infer<typeof EnvSchema>)

  const defaultTenantId = e.TENANT_ID ?? DEFAULT_TENANT_AS_UUID_STRING
  const defaultLogLevel = process.env.NODE_ENV === 'development' ? 'debug' : e.LOG_LEVEL ?? 'info'

  return {
    envDefault: {
      label: 'env-default (process.env)',
      config: {
        tenantId: defaultTenantId,
        logLevel: defaultLogLevel,
        rateLimiterRepoUrl: resolveRepoUrl({
          explicit: e.SYS_RATE_LIMITER_REPO_URL ?? e.RATE_LIMITER_REPO_URL,
          fallback: e.SYS_REPO_URL ?? e.AOPS_PG_URL ?? e.DEV_PG_URL ?? e.POSTGRES_URL_LOCAL ?? e.POSTGRES_URL,
          label: 'SYS_RATE_LIMITER_REPO_URL (or RATE_LIMITER_REPO_URL / SYS_REPO_URL / AOPS_PG_URL / DEV_PG_URL)',
        }),
        eventStoreRepoUrl: resolveRepoUrl({
          explicit: e.SYS_EVENT_STORE_REPO_URL ?? e.EVENT_STORE_REPO_URL,
          fallback: e.SYS_REPO_URL ?? e.AOPS_PG_URL ?? e.DEV_PG_URL ?? e.POSTGRES_URL_LOCAL ?? e.POSTGRES_URL,
          label: 'SYS_EVENT_STORE_REPO_URL (or EVENT_STORE_REPO_URL / SYS_REPO_URL / AOPS_PG_URL / DEV_PG_URL)',
        }),
        counterRepoUrl: resolveRepoUrl({
          explicit: e.SYS_COUNTER_REPO_URL ?? e.COUNTER_REPO_URL,
          fallback: e.SYS_REPO_URL ?? e.AOPS_PG_URL ?? e.DEV_PG_URL ?? e.POSTGRES_URL_LOCAL ?? e.POSTGRES_URL,
          label: 'SYS_COUNTER_REPO_URL (or COUNTER_REPO_URL / SYS_REPO_URL / AOPS_PG_URL / DEV_PG_URL)',
        }),
      },
    },
  }
}

let cachedEnvConfigurations: Record<SysKitEnvKey, SysKitEnvEntry> | null = null

function getEnvConfigurations(): Record<SysKitEnvKey, SysKitEnvEntry> {
  if (!cachedEnvConfigurations) {
    cachedEnvConfigurations = buildEnvConfigurations()
  }
  return cachedEnvConfigurations
}

function getSysKitEnvMatrixInternal(): Array<{ key: SysKitEnvKey } & SysKitEnvEntry> {
  const envConfigurations = getEnvConfigurations()
  return (Object.entries(envConfigurations) as Array<[SysKitEnvKey, SysKitEnvEntry]>).map(([key, entry]) => ({
    key,
    ...entry,
  }))
}

function createEnvProxy(): SysKitEnvConfig {
  return new Proxy({} as SysKitEnvConfig, {
    get(_target, prop) {
      return (getSysKitEnvConfig() as any)[prop as keyof SysKitEnvConfig]
    },
    ownKeys() {
      return Reflect.ownKeys(getSysKitEnvConfig())
    },
    getOwnPropertyDescriptor(_target, prop) {
      const cfg = getSysKitEnvConfig()
      if (prop in cfg) {
        return { enumerable: true, configurable: true, value: (cfg as any)[prop as keyof SysKitEnvConfig] }
      }
      return undefined
    },
  })
}

function createEnvMatrixProxy(): Array<{ key: SysKitEnvKey } & SysKitEnvEntry> {
  return new Proxy([] as Array<{ key: SysKitEnvKey } & SysKitEnvEntry>, {
    get(_target, prop) {
      return Reflect.get(getSysKitEnvMatrixInternal(), prop)
    },
    ownKeys() {
      return Reflect.ownKeys(getSysKitEnvMatrixInternal())
    },
    getOwnPropertyDescriptor(_target, prop) {
      const matrix = getSysKitEnvMatrixInternal()
      const value = (matrix as any)[prop]
      if (value === undefined) return undefined
      return { enumerable: true, configurable: true, value }
    },
  })
}

export const env: SysKitEnvConfig = createEnvProxy()

export const sysEnvMatrix: Array<{ key: SysKitEnvKey } & SysKitEnvEntry> = createEnvMatrixProxy()

export function getSysKitEnvConfig(key: SysKitEnvKey = DEFAULT_SYS_ENV_KEY): SysKitEnvConfig {
  return getEnvConfigurations()[key].config
}
