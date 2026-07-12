import type { XfLogger } from '@aopslab/xf-logger'
import { Effect } from 'effect'
import {
  cacheKeyFromLocale,
  CountersMetricsCollector,
  LoggerMetricsCollector,
  MultiMetricsCollector,
  parseEnvConfig,
} from '@aopslab/xf-dm-kits'

import type { DocmanKitEnvConfig } from '../config/config.js'
import type { DocmanKitProvider, DocmanKitProviderOptions, DocmanKitContext, DocmanKitStaticConfig } from './types.js'
import { createDocmanKitProvider } from './provider.js'

function inferRepositoryType(url: string): DocmanKitStaticConfig['documentRepository']['repositoryType'] {
  const normalized = url.trim().toLowerCase()
  if (!normalized) return 'mongo'
  if (normalized.startsWith('postgres://') || normalized.startsWith('postgresql://')) return 'drizzle'
  if (normalized === ':memory:') return 'drizzle'
  if (normalized.startsWith('sqlite:') || normalized.startsWith('file:')) return 'drizzle'
  if (normalized.endsWith('.db') || normalized.endsWith('.sqlite') || normalized.endsWith('.sqlite3')) return 'drizzle'
  return 'mongo'
}

export interface CreateDocmanKitOptions extends Omit<DocmanKitProviderOptions, 'getCacheKey'> {
  name?: string
  getCacheKey?: (context: DocmanKitContext) => string | null
}

export function createDocmanKit(options: CreateDocmanKitOptions) {
  const provider: DocmanKitProvider = createDocmanKitProvider({
    ...options,
    getCacheKey: options.getCacheKey ?? ((ctx) => cacheKeyFromLocale(ctx.locale, ctx.fallbackLocale)),
  })

  return {
    getStaticConfig(): DocmanKitStaticConfig {
      return options.staticConfig
    },
    getDocumentService: provider.getDocumentService,
    createDocumentService: provider.createDocumentService,
    getDocumentGroupService: provider.getDocumentGroupService,
    createDocumentGroupService: provider.createDocumentGroupService,
    getDocumentVersionService: provider.getDocumentVersionService,
    createDocumentVersionService: provider.createDocumentVersionService,
    getSectionService: provider.getSectionService,
    createSectionService: provider.createSectionService,
    getPageService: provider.getPageService,
    createPageService: provider.createPageService,
    getPageVersionService: provider.getPageVersionService,
    createPageVersionService: provider.createPageVersionService,
    getDocumentSectionLinkService: provider.getDocumentSectionLinkService,
    createDocumentSectionLinkService: provider.createDocumentSectionLinkService,
    getSectionPageLinkService: provider.getSectionPageLinkService,
    createSectionPageLinkService: provider.createSectionPageLinkService,
    getSnippetService: provider.getSnippetService,
    createSnippetService: provider.createSnippetService,
    getPageSnippetLinkService: provider.getPageSnippetLinkService,
    createPageSnippetLinkService: provider.createPageSnippetLinkService,
    getAssetService: provider.getAssetService,
    createAssetService: provider.createAssetService,
    getAssetVersionService: provider.getAssetVersionService,
    createAssetVersionService: provider.createAssetVersionService,
    getEmbedService: provider.getEmbedService,
    createEmbedService: provider.createEmbedService,
    getPageEmbedLinkService: provider.getPageEmbedLinkService,
    createPageEmbedLinkService: provider.createPageEmbedLinkService,
    getDocumentRepository: provider.getDocumentRepository,
    getDocumentGroupRepository: provider.getDocumentGroupRepository,
    getDocumentVersionRepository: provider.getDocumentVersionRepository,
    getSectionRepository: provider.getSectionRepository,
    getPageRepository: provider.getPageRepository,
    getPageVersionRepository: provider.getPageVersionRepository,
    getDocumentIndexEntryRepository: provider.getDocumentIndexEntryRepository,
    getDocumentSectionLinkRepository: provider.getDocumentSectionLinkRepository,
    getSectionPageLinkRepository: provider.getSectionPageLinkRepository,
    getSnippetRepository: provider.getSnippetRepository,
    getPageSnippetLinkRepository: provider.getPageSnippetLinkRepository,
    getAssetRepository: provider.getAssetRepository,
    getAssetVersionRepository: provider.getAssetVersionRepository,
    getEmbedRepository: provider.getEmbedRepository,
    getPageEmbedLinkRepository: provider.getPageEmbedLinkRepository,
    getAll: provider.getAll,
    createAll: provider.createAll,
    clearServiceCache: provider.clearServiceCache,
    clearDocumentServiceCache: provider.clearDocumentServiceCache,
    clearDocumentGroupServiceCache: provider.clearDocumentGroupServiceCache,
    clearDocumentVersionServiceCache: provider.clearDocumentVersionServiceCache,
    clearSectionServiceCache: provider.clearSectionServiceCache,
    clearPageServiceCache: provider.clearPageServiceCache,
    clearPageVersionServiceCache: provider.clearPageVersionServiceCache,
    clearDocumentSectionLinkServiceCache: provider.clearDocumentSectionLinkServiceCache,
    clearSectionPageLinkServiceCache: provider.clearSectionPageLinkServiceCache,
    clearSnippetServiceCache: provider.clearSnippetServiceCache,
    clearPageSnippetLinkServiceCache: provider.clearPageSnippetLinkServiceCache,
    clearAssetServiceCache: provider.clearAssetServiceCache,
    clearAssetVersionServiceCache: provider.clearAssetVersionServiceCache,
    clearEmbedServiceCache: provider.clearEmbedServiceCache,
    clearPageEmbedLinkServiceCache: provider.clearPageEmbedLinkServiceCache,
    reset: provider.reset,
    getRegistryStats: provider.getRegistryStats,
    resolveLogger: provider.resolveLogger,

    withContext(overrides: Partial<DocmanKitContext>) {
      return {
        getStaticConfig(): DocmanKitStaticConfig {
          return options.staticConfig
        },
        getDocumentService: (o?: Partial<DocmanKitContext>) => provider.getDocumentService({ ...overrides, ...o }),
        getDocumentGroupService: (o?: Partial<DocmanKitContext>) => provider.getDocumentGroupService({ ...overrides, ...o }),
        getDocumentVersionService: (o?: Partial<DocmanKitContext>) => provider.getDocumentVersionService({ ...overrides, ...o }),
        getSectionService: (o?: Partial<DocmanKitContext>) => provider.getSectionService({ ...overrides, ...o }),
        getPageService: (o?: Partial<DocmanKitContext>) => provider.getPageService({ ...overrides, ...o }),
        getPageVersionService: (o?: Partial<DocmanKitContext>) => provider.getPageVersionService({ ...overrides, ...o }),
        getDocumentSectionLinkService: (o?: Partial<DocmanKitContext>) => provider.getDocumentSectionLinkService({ ...overrides, ...o }),
        getSectionPageLinkService: (o?: Partial<DocmanKitContext>) => provider.getSectionPageLinkService({ ...overrides, ...o }),
        getSnippetService: (o?: Partial<DocmanKitContext>) => provider.getSnippetService({ ...overrides, ...o }),
        getPageSnippetLinkService: (o?: Partial<DocmanKitContext>) => provider.getPageSnippetLinkService({ ...overrides, ...o }),
        getAssetService: (o?: Partial<DocmanKitContext>) => provider.getAssetService({ ...overrides, ...o }),
        getAssetVersionService: (o?: Partial<DocmanKitContext>) => provider.getAssetVersionService({ ...overrides, ...o }),
        getEmbedService: (o?: Partial<DocmanKitContext>) => provider.getEmbedService({ ...overrides, ...o }),
        getPageEmbedLinkService: (o?: Partial<DocmanKitContext>) => provider.getPageEmbedLinkService({ ...overrides, ...o }),
        getDocumentRepository: (o?: Partial<DocmanKitContext>) => provider.getDocumentRepository({ ...overrides, ...o }),
        getDocumentGroupRepository: (o?: Partial<DocmanKitContext>) => provider.getDocumentGroupRepository({ ...overrides, ...o }),
        getDocumentVersionRepository: (o?: Partial<DocmanKitContext>) => provider.getDocumentVersionRepository({ ...overrides, ...o }),
        getSectionRepository: (o?: Partial<DocmanKitContext>) => provider.getSectionRepository({ ...overrides, ...o }),
        getPageRepository: (o?: Partial<DocmanKitContext>) => provider.getPageRepository({ ...overrides, ...o }),
        getPageVersionRepository: (o?: Partial<DocmanKitContext>) => provider.getPageVersionRepository({ ...overrides, ...o }),
        getDocumentIndexEntryRepository: (o?: Partial<DocmanKitContext>) =>
          provider.getDocumentIndexEntryRepository({ ...overrides, ...o }),
        getDocumentSectionLinkRepository: (o?: Partial<DocmanKitContext>) => provider.getDocumentSectionLinkRepository({ ...overrides, ...o }),
        getSectionPageLinkRepository: (o?: Partial<DocmanKitContext>) => provider.getSectionPageLinkRepository({ ...overrides, ...o }),
        getSnippetRepository: (o?: Partial<DocmanKitContext>) => provider.getSnippetRepository({ ...overrides, ...o }),
        getPageSnippetLinkRepository: (o?: Partial<DocmanKitContext>) => provider.getPageSnippetLinkRepository({ ...overrides, ...o }),
        getAssetRepository: (o?: Partial<DocmanKitContext>) => provider.getAssetRepository({ ...overrides, ...o }),
        getAssetVersionRepository: (o?: Partial<DocmanKitContext>) => provider.getAssetVersionRepository({ ...overrides, ...o }),
        getEmbedRepository: (o?: Partial<DocmanKitContext>) => provider.getEmbedRepository({ ...overrides, ...o }),
        getPageEmbedLinkRepository: (o?: Partial<DocmanKitContext>) => provider.getPageEmbedLinkRepository({ ...overrides, ...o }),
        getAll: (o?: Partial<DocmanKitContext>) => provider.getAll({ ...overrides, ...o }),
        createAll: (o?: Partial<DocmanKitContext>) => provider.createAll({ ...overrides, ...o }),
        clearServiceCache: (cacheKey?: string) => provider.clearServiceCache(cacheKey),
        clearDocumentServiceCache: (cacheKey?: string) => provider.clearDocumentServiceCache(cacheKey),
        clearDocumentGroupServiceCache: (cacheKey?: string) => provider.clearDocumentGroupServiceCache(cacheKey),
        clearDocumentVersionServiceCache: (cacheKey?: string) => provider.clearDocumentVersionServiceCache(cacheKey),
        clearSectionServiceCache: (cacheKey?: string) => provider.clearSectionServiceCache(cacheKey),
        clearPageServiceCache: (cacheKey?: string) => provider.clearPageServiceCache(cacheKey),
        clearPageVersionServiceCache: (cacheKey?: string) => provider.clearPageVersionServiceCache(cacheKey),
        clearDocumentSectionLinkServiceCache: (cacheKey?: string) => provider.clearDocumentSectionLinkServiceCache(cacheKey),
        clearSectionPageLinkServiceCache: (cacheKey?: string) => provider.clearSectionPageLinkServiceCache(cacheKey),
        clearSnippetServiceCache: (cacheKey?: string) => provider.clearSnippetServiceCache(cacheKey),
        clearPageSnippetLinkServiceCache: (cacheKey?: string) => provider.clearPageSnippetLinkServiceCache(cacheKey),
        clearAssetServiceCache: (cacheKey?: string) => provider.clearAssetServiceCache(cacheKey),
        clearAssetVersionServiceCache: (cacheKey?: string) => provider.clearAssetVersionServiceCache(cacheKey),
        clearEmbedServiceCache: (cacheKey?: string) => provider.clearEmbedServiceCache(cacheKey),
        clearPageEmbedLinkServiceCache: (cacheKey?: string) => provider.clearPageEmbedLinkServiceCache(cacheKey),
        reset: (opts?: { services?: boolean; repositories?: boolean }) => provider.reset(opts),
        getRegistryStats: () => provider.getRegistryStats(),
        resolveLogger: (o?: Partial<DocmanKitContext>) => provider.resolveLogger({ ...overrides, ...o }),
      }
    },
  }
}

export function buildDocmanKitStaticConfig(envConfig: DocmanKitEnvConfig): DocmanKitStaticConfig {
  return {
    logLevel: envConfig.logLevel,
    documentRepository: { repositoryType: inferRepositoryType(envConfig.documentRepoUrl), url: envConfig.documentRepoUrl },
    documentGroupRepository: { repositoryType: inferRepositoryType(envConfig.documentGroupRepoUrl), url: envConfig.documentGroupRepoUrl },
    documentVersionRepository: { repositoryType: inferRepositoryType(envConfig.documentVersionRepoUrl), url: envConfig.documentVersionRepoUrl },
    sectionRepository: { repositoryType: inferRepositoryType(envConfig.sectionRepoUrl), url: envConfig.sectionRepoUrl },
    pageRepository: { repositoryType: inferRepositoryType(envConfig.pageRepoUrl), url: envConfig.pageRepoUrl },
    pageVersionRepository: { repositoryType: inferRepositoryType(envConfig.pageVersionRepoUrl), url: envConfig.pageVersionRepoUrl },
    documentIndexEntryRepository: {
      repositoryType: inferRepositoryType(envConfig.documentRepoUrl),
      url: envConfig.documentRepoUrl,
    },
    documentSectionLinkRepository: { repositoryType: inferRepositoryType(envConfig.documentSectionLinkRepoUrl), url: envConfig.documentSectionLinkRepoUrl },
    sectionPageLinkRepository: { repositoryType: inferRepositoryType(envConfig.sectionPageLinkRepoUrl), url: envConfig.sectionPageLinkRepoUrl },
    snippetRepository: { repositoryType: inferRepositoryType(envConfig.snippetRepoUrl), url: envConfig.snippetRepoUrl },
    pageSnippetLinkRepository: { repositoryType: inferRepositoryType(envConfig.pageSnippetLinkRepoUrl), url: envConfig.pageSnippetLinkRepoUrl },
    assetRepository: { repositoryType: inferRepositoryType(envConfig.assetRepoUrl), url: envConfig.assetRepoUrl },
    assetVersionRepository: { repositoryType: inferRepositoryType(envConfig.assetVersionRepoUrl), url: envConfig.assetVersionRepoUrl },
    embedRepository: { repositoryType: inferRepositoryType(envConfig.embedRepoUrl), url: envConfig.embedRepoUrl },
    pageEmbedLinkRepository: { repositoryType: inferRepositoryType(envConfig.pageEmbedLinkRepoUrl), url: envConfig.pageEmbedLinkRepoUrl },
  }
}

export type CreateDocmanKitWithEnvOptions = {
  name?: string
  envConfig: DocmanKitEnvConfig
  baseContext: {
    tenantId: string
    locale?: string
    fallbackLocale?: string
    logger?: XfLogger
  }
  getCacheKey?: (context: DocmanKitContext) => string | null
} & Pick<DocmanKitProviderOptions, 'cache' | 'metrics' | 'resilience' | 'transformService' | 'resolveLogger'>

export function createDocmanKitWithEnv(options: CreateDocmanKitWithEnvOptions) {
  const staticConfig = buildDocmanKitStaticConfig(options.envConfig)
  const envCfg = parseEnvConfig()

  const statsEnabled = envCfg.statsEnabled === true
  const counters = statsEnabled ? new CountersMetricsCollector() : undefined
  const loggerMetrics = statsEnabled ? new LoggerMetricsCollector(undefined) : undefined
  const metricsCollector =
    options.metrics ?? (counters && loggerMetrics ? new MultiMetricsCollector([counters, loggerMetrics]) : counters ?? loggerMetrics)

  const cacheMerged = (options.cache || envCfg.cacheGlobal)
    ? ({ ...(options.cache ?? {}), ...(envCfg.cacheGlobal ?? {}) } as DocmanKitProviderOptions['cache'])
    : undefined

  const resilienceMerged = (options.resilience || envCfg.resilience)
    ? ({ ...(options.resilience ?? {}), ...(envCfg.resilience ?? {}) })
    : undefined

  const kit = createDocmanKit({
    name: options.name ?? 'docman-kit',
    staticConfig,
    getContext: (overrides?: Partial<DocmanKitContext>) => ({
      tenantId: options.baseContext.tenantId,
      locale: options.baseContext.locale,
      fallbackLocale: options.baseContext.fallbackLocale,
      ...overrides,
      logger: overrides?.logger ?? options.baseContext.logger,
    }),
    resolveLogger: (ctx) => options.resolveLogger?.(ctx) ?? ctx.logger ?? options.baseContext.logger,
    getCacheKey: (ctx) => options.getCacheKey?.(ctx) ?? cacheKeyFromLocale(ctx.locale, ctx.fallbackLocale),
    cache: cacheMerged,
    metrics: metricsCollector,
    resilience: resilienceMerged as DocmanKitProviderOptions['resilience'],
    transformService: options.transformService,
  })

  return {
    kit,
    getMetricsSnapshot: () => (counters ? counters.snapshot() : null),
    validate: async () => {
      const svc = await kit.createAll()
      void svc
      return Effect.succeed(true)
    },
  }
}
