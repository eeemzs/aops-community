import { DEFAULT_TENANT_AS_UUID_STRING } from '@aopslab/xf-core'
import { z } from 'zod'

const repoUrlSchema = z.string().min(1).optional()

export const EnvSchema = z.object({
  TENANT_ID: z.string().uuid().optional(),
  LOG_LEVEL: z.string().optional(),
  AOPS_PG_URL: repoUrlSchema,
  DOCMAN_PG_URL: repoUrlSchema,
  DOCMAN_SQLITE_URL: repoUrlSchema,
  DOCMAN_REPO_URL: repoUrlSchema,
  DOCUMENT_REPO_URL: repoUrlSchema,
  DOCUMENT_GROUP_REPO_URL: repoUrlSchema,
  DOCUMENT_VERSION_REPO_URL: repoUrlSchema,
  SECTION_REPO_URL: repoUrlSchema,
  PAGE_REPO_URL: repoUrlSchema,
  PAGE_VERSION_REPO_URL: repoUrlSchema,
  DOCUMENT_SECTION_LINK_REPO_URL: repoUrlSchema,
  SECTION_PAGE_LINK_REPO_URL: repoUrlSchema,
  SNIPPET_REPO_URL: repoUrlSchema,
  PAGE_SNIPPET_LINK_REPO_URL: repoUrlSchema,
  ASSET_REPO_URL: repoUrlSchema,
  ASSET_VERSION_REPO_URL: repoUrlSchema,
  EMBED_REPO_URL: repoUrlSchema,
  PAGE_EMBED_LINK_REPO_URL: repoUrlSchema,
})

export type DocmanKitEnvConfig = {
  tenantId: string
  logLevel: string
  documentRepoUrl: string
  documentGroupRepoUrl: string
  documentVersionRepoUrl: string
  sectionRepoUrl: string
  pageRepoUrl: string
  pageVersionRepoUrl: string
  documentSectionLinkRepoUrl: string
  sectionPageLinkRepoUrl: string
  snippetRepoUrl: string
  pageSnippetLinkRepoUrl: string
  assetRepoUrl: string
  assetVersionRepoUrl: string
  embedRepoUrl: string
  pageEmbedLinkRepoUrl: string
}

export type DocmanKitEnvEntry = {
  label: string
  config: DocmanKitEnvConfig
}

const DOCMAN_ENV_KEYS = ['envDefault'] as const
export type DocmanKitEnvKey = (typeof DOCMAN_ENV_KEYS)[number]
export const DEFAULT_DOCMAN_ENV_KEY: DocmanKitEnvKey = 'envDefault'

type NormalizedDocmanEnv = Partial<Record<keyof z.infer<typeof EnvSchema>, string>>

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

function normalizeDocmanProcessEnv(processEnv: NodeJS.ProcessEnv): NormalizedDocmanEnv {
  const normalizedEntries = Object.entries(processEnv)
    .map(([key, value]) => [key, normalizeOptionalEnvString(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)

  return Object.fromEntries(normalizedEntries) as NormalizedDocmanEnv
}

function buildEnvConfigurations(): Record<DocmanKitEnvKey, DocmanKitEnvEntry> {
  const normalizedEnv = normalizeDocmanProcessEnv(process.env)
  const parsed = EnvSchema.safeParse(normalizedEnv)
  const e = (parsed.success ? parsed.data : normalizedEnv) as NormalizedDocmanEnv

  const parsedTenantId = z.string().uuid().safeParse(e.TENANT_ID)
  const defaultTenantId = parsedTenantId.success ? parsedTenantId.data : DEFAULT_TENANT_AS_UUID_STRING
  const defaultLogLevel = process.env.NODE_ENV === 'development' ? 'debug' : e.LOG_LEVEL ?? 'info'
  const defaultRepoUrl = e.DOCMAN_REPO_URL ?? e.DOCMAN_SQLITE_URL ?? e.DOCMAN_PG_URL ?? e.AOPS_PG_URL

  return {
    envDefault: {
      label: 'env-default (process.env)',
      config: {
        tenantId: defaultTenantId,
        logLevel: defaultLogLevel,
        documentRepoUrl: resolveRepoUrl({
          explicit: e.DOCUMENT_REPO_URL, fallback: defaultRepoUrl,
          label: 'DOCUMENT_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        documentGroupRepoUrl: resolveRepoUrl({
          explicit: e.DOCUMENT_GROUP_REPO_URL, fallback: defaultRepoUrl,
          label: 'DOCUMENT_GROUP_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        documentVersionRepoUrl: resolveRepoUrl({
          explicit: e.DOCUMENT_VERSION_REPO_URL, fallback: defaultRepoUrl,
          label: 'DOCUMENT_VERSION_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        sectionRepoUrl: resolveRepoUrl({
          explicit: e.SECTION_REPO_URL, fallback: defaultRepoUrl,
          label: 'SECTION_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        pageRepoUrl: resolveRepoUrl({
          explicit: e.PAGE_REPO_URL, fallback: defaultRepoUrl,
          label: 'PAGE_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        pageVersionRepoUrl: resolveRepoUrl({
          explicit: e.PAGE_VERSION_REPO_URL, fallback: defaultRepoUrl,
          label: 'PAGE_VERSION_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        documentSectionLinkRepoUrl: resolveRepoUrl({
          explicit: e.DOCUMENT_SECTION_LINK_REPO_URL, fallback: defaultRepoUrl,
          label: 'DOCUMENT_SECTION_LINK_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        sectionPageLinkRepoUrl: resolveRepoUrl({
          explicit: e.SECTION_PAGE_LINK_REPO_URL, fallback: defaultRepoUrl,
          label: 'SECTION_PAGE_LINK_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        snippetRepoUrl: resolveRepoUrl({
          explicit: e.SNIPPET_REPO_URL, fallback: defaultRepoUrl,
          label: 'SNIPPET_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        pageSnippetLinkRepoUrl: resolveRepoUrl({
          explicit: e.PAGE_SNIPPET_LINK_REPO_URL, fallback: defaultRepoUrl,
          label: 'PAGE_SNIPPET_LINK_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        assetRepoUrl: resolveRepoUrl({
          explicit: e.ASSET_REPO_URL, fallback: defaultRepoUrl,
          label: 'ASSET_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        assetVersionRepoUrl: resolveRepoUrl({
          explicit: e.ASSET_VERSION_REPO_URL, fallback: defaultRepoUrl,
          label: 'ASSET_VERSION_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        embedRepoUrl: resolveRepoUrl({
          explicit: e.EMBED_REPO_URL, fallback: defaultRepoUrl,
          label: 'EMBED_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
        pageEmbedLinkRepoUrl: resolveRepoUrl({
          explicit: e.PAGE_EMBED_LINK_REPO_URL, fallback: defaultRepoUrl,
          label: 'PAGE_EMBED_LINK_REPO_URL (or DOCMAN_REPO_URL or DOCMAN_SQLITE_URL or DOCMAN_PG_URL or AOPS_PG_URL)',
        }),
      },
    },
  }
}

let cachedEnvConfigurations: Record<DocmanKitEnvKey, DocmanKitEnvEntry> | null = null

function getEnvConfigurations(): Record<DocmanKitEnvKey, DocmanKitEnvEntry> {
  if (!cachedEnvConfigurations) {
    cachedEnvConfigurations = buildEnvConfigurations()
  }
  return cachedEnvConfigurations
}

function getDocmanKitEnvMatrixInternal(): Array<{ key: DocmanKitEnvKey } & DocmanKitEnvEntry> {
  const envConfigurations = getEnvConfigurations()
  return (Object.entries(envConfigurations) as Array<[DocmanKitEnvKey, DocmanKitEnvEntry]>).map(([key, entry]) => ({
    key,
    ...entry,
  }))
}

function createEnvProxy(): DocmanKitEnvConfig {
  return new Proxy({} as DocmanKitEnvConfig, {
    get(_target, prop) {
      return (getDocmanKitEnvConfig() as any)[prop as keyof DocmanKitEnvConfig]
    },
    ownKeys() {
      return Reflect.ownKeys(getDocmanKitEnvConfig())
    },
    getOwnPropertyDescriptor(_target, prop) {
      const cfg = getDocmanKitEnvConfig()
      if (prop in cfg) {
        return { enumerable: true, configurable: true, value: (cfg as any)[prop as keyof DocmanKitEnvConfig] }
      }
      return undefined
    },
  })
}

function createEnvMatrixProxy(): Array<{ key: DocmanKitEnvKey } & DocmanKitEnvEntry> {
  return new Proxy([] as Array<{ key: DocmanKitEnvKey } & DocmanKitEnvEntry>, {
    get(_target, prop) {
      return Reflect.get(getDocmanKitEnvMatrixInternal(), prop)
    },
    ownKeys() {
      return Reflect.ownKeys(getDocmanKitEnvMatrixInternal())
    },
    getOwnPropertyDescriptor(_target, prop) {
      const matrix = getDocmanKitEnvMatrixInternal()
      const value = (matrix as any)[prop]
      if (value === undefined) return undefined
      return { enumerable: true, configurable: true, value }
    },
  })
}

export const env: DocmanKitEnvConfig = createEnvProxy()

export const docmanEnvMatrix: Array<{ key: DocmanKitEnvKey } & DocmanKitEnvEntry> = createEnvMatrixProxy()

export function getDocmanKitEnvConfig(key: DocmanKitEnvKey = DEFAULT_DOCMAN_ENV_KEY): DocmanKitEnvConfig {
  return getEnvConfigurations()[key].config
}

export function clearDocmanKitEnvConfigCache(): void {
  cachedEnvConfigurations = null
}
