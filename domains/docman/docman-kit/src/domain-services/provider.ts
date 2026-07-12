import { Effect } from 'effect'

import { createProvider, cacheKeyFromLocale, fingerprintRepositoryConfig, buildRepositoryConfig } from '@aopslab/xf-dm-kits'
import type { IUnitOfWork, RepositoryConfig } from '@aopslab/xf-db'
import { DrizzleUnitOfWork, DrizzleUnitOfWorkSqlite } from '@aopslab/xf-db-drizzle'
import type { XfLogger } from '@aopslab/xf-logger'

import type { DocmanKitProviderOptions, DocmanKitProvider, DocmanKitContext, DocmanKitStaticConfig, DocmanKitServiceProviderOptions, DocmanKitServices, DocmanKitRepositories, DocmanKitDomainServiceRegistryStats } from './types.js'

import { RepositoryFactoryDocument, RepositoryFactoryDocumentGroup, RepositoryFactoryDocumentVersion, RepositoryFactorySection, RepositoryFactoryPage, RepositoryFactoryPageVersion, RepositoryFactoryDocumentIndexEntry, RepositoryFactoryDocumentSectionLink, RepositoryFactorySectionPageLink, RepositoryFactorySnippet, RepositoryFactoryPageSnippetLink, RepositoryFactoryAsset, RepositoryFactoryAssetVersion, RepositoryFactoryEmbed, RepositoryFactoryPageEmbedLink } from '@aopslab/domain-dm-docman/factories'
import { DocumentService, DocumentGroupService, DocumentVersionService, SectionService, PageService, PageVersionService, DocumentSectionLinkService, SectionPageLinkService, SnippetService, PageSnippetLinkService, AssetService, AssetVersionService, EmbedService, PageEmbedLinkService } from '@aopslab/domain-dm-docman/services'

function computeConfigKey(name: string, cfg: DocmanKitServiceProviderOptions): string {
  const sigs = [fingerprintRepositoryConfig(cfg.documentRepositoryConfig), fingerprintRepositoryConfig(cfg.documentGroupRepositoryConfig), fingerprintRepositoryConfig(cfg.documentVersionRepositoryConfig), fingerprintRepositoryConfig(cfg.sectionRepositoryConfig), fingerprintRepositoryConfig(cfg.pageRepositoryConfig), fingerprintRepositoryConfig(cfg.pageVersionRepositoryConfig), fingerprintRepositoryConfig(cfg.documentIndexEntryRepositoryConfig), fingerprintRepositoryConfig(cfg.documentSectionLinkRepositoryConfig), fingerprintRepositoryConfig(cfg.sectionPageLinkRepositoryConfig), fingerprintRepositoryConfig(cfg.snippetRepositoryConfig), fingerprintRepositoryConfig(cfg.pageSnippetLinkRepositoryConfig), fingerprintRepositoryConfig(cfg.assetRepositoryConfig), fingerprintRepositoryConfig(cfg.assetVersionRepositoryConfig), fingerprintRepositoryConfig(cfg.embedRepositoryConfig), fingerprintRepositoryConfig(cfg.pageEmbedLinkRepositoryConfig)].filter(Boolean)
  return [name, cfg.tenantId ?? '', ...sigs].join('|')
}

function buildResolvedConfig(staticCfg: DocmanKitStaticConfig, ctx: DocmanKitContext): DocmanKitServiceProviderOptions {
  const tenantId = ctx.tenantId

  return {
    tenantId,
    logLevel: staticCfg.logLevel,
    localeOptions: { locale: ctx.locale, fallbackLocale: ctx.fallbackLocale },
    documentRepositoryConfig: buildRepositoryConfig(staticCfg.documentRepository, tenantId),
    documentGroupRepositoryConfig: buildRepositoryConfig(staticCfg.documentGroupRepository, tenantId),
    documentVersionRepositoryConfig: buildRepositoryConfig(staticCfg.documentVersionRepository, tenantId),
    sectionRepositoryConfig: buildRepositoryConfig(staticCfg.sectionRepository, tenantId),
    pageRepositoryConfig: buildRepositoryConfig(staticCfg.pageRepository, tenantId),
    pageVersionRepositoryConfig: buildRepositoryConfig(staticCfg.pageVersionRepository, tenantId),
    documentIndexEntryRepositoryConfig: buildRepositoryConfig(staticCfg.documentIndexEntryRepository, tenantId),
    documentSectionLinkRepositoryConfig: buildRepositoryConfig(staticCfg.documentSectionLinkRepository, tenantId),
    sectionPageLinkRepositoryConfig: buildRepositoryConfig(staticCfg.sectionPageLinkRepository, tenantId),
    snippetRepositoryConfig: buildRepositoryConfig(staticCfg.snippetRepository, tenantId),
    pageSnippetLinkRepositoryConfig: buildRepositoryConfig(staticCfg.pageSnippetLinkRepository, tenantId),
    assetRepositoryConfig: buildRepositoryConfig(staticCfg.assetRepository, tenantId),
    assetVersionRepositoryConfig: buildRepositoryConfig(staticCfg.assetVersionRepository, tenantId),
    embedRepositoryConfig: buildRepositoryConfig(staticCfg.embedRepository, tenantId),
    pageEmbedLinkRepositoryConfig: buildRepositoryConfig(staticCfg.pageEmbedLinkRepository, tenantId),
  }
}

function inferDrizzleDialectFromRepositoryConfig(
  repositoryConfig?: Pick<RepositoryConfig, 'drizzleDialect' | 'url'>,
): 'pg' | 'sqlite' {
  const explicit = repositoryConfig?.drizzleDialect
  if (explicit === 'sqlite') return 'sqlite'
  if (explicit === 'pg') return 'pg'

  const value = (repositoryConfig?.url ?? '').trim().toLowerCase()
  if (!value) return 'pg'
  if (value === ':memory:') return 'sqlite'
  if (value.startsWith('sqlite:') || value.startsWith('file:')) return 'sqlite'
  if (value.endsWith('.db') || value.endsWith('.sqlite') || value.endsWith('.sqlite3')) return 'sqlite'
  return 'pg'
}

function createDocmanUnitOfWork(repositoryConfig?: RepositoryConfig): IUnitOfWork | undefined {
  if (repositoryConfig?.repositoryType !== 'drizzle') return undefined
  if (inferDrizzleDialectFromRepositoryConfig(repositoryConfig) === 'sqlite') {
    return new DrizzleUnitOfWorkSqlite({
      uri: repositoryConfig.url,
      driver: (repositoryConfig as { drizzleSqliteDriver?: 'node-sqlite' | 'better-sqlite3' }).drizzleSqliteDriver,
    })
  }
  return new DrizzleUnitOfWork()
}

export function createDocmanKitProvider(options: DocmanKitProviderOptions): DocmanKitProvider {
  const name = options.name ?? 'docman-kit'

  function defaultCacheKey(context: DocmanKitContext): string | null {
    if (typeof context.cacheKey === 'string' && context.cacheKey.length > 0) return context.cacheKey
    return cacheKeyFromLocale(context.locale, context.fallbackLocale)
  }

  const gp = createProvider<
    DocmanKitContext,
    DocmanKitServiceProviderOptions,
    XfLogger | undefined,
    DocmanKitServices,
    DocmanKitRepositories
  >({
    name: `docman-kit::provider::${name}`,
    getContext: options.getContext,
    getCacheKey: (ctx) => options.getCacheKey?.(ctx) ?? defaultCacheKey(ctx),
    resolveLogger: options.resolveLogger,
    resolveConfig: (ctx) => buildResolvedConfig(options.staticConfig, ctx),
    computeConfigKey: (cfg) => computeConfigKey(name, cfg),
repositories: {
documentRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryDocument.create({
        repositoryConfig: cfg.documentRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
documentGroupRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryDocumentGroup.create({
        repositoryConfig: cfg.documentGroupRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
documentVersionRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryDocumentVersion.create({
        repositoryConfig: cfg.documentVersionRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
sectionRepository: async (cfg, logger) => {
      const eff = RepositoryFactorySection.create({
        repositoryConfig: cfg.sectionRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
pageRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryPage.create({
        repositoryConfig: cfg.pageRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
pageVersionRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryPageVersion.create({
        repositoryConfig: cfg.pageVersionRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
documentIndexEntryRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryDocumentIndexEntry.create({
        repositoryConfig: cfg.documentIndexEntryRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
documentSectionLinkRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryDocumentSectionLink.create({
        repositoryConfig: cfg.documentSectionLinkRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
sectionPageLinkRepository: async (cfg, logger) => {
      const eff = RepositoryFactorySectionPageLink.create({
        repositoryConfig: cfg.sectionPageLinkRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
snippetRepository: async (cfg, logger) => {
      const eff = RepositoryFactorySnippet.create({
        repositoryConfig: cfg.snippetRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
pageSnippetLinkRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryPageSnippetLink.create({
        repositoryConfig: cfg.pageSnippetLinkRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
assetRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryAsset.create({
        repositoryConfig: cfg.assetRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
assetVersionRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryAssetVersion.create({
        repositoryConfig: cfg.assetVersionRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
embedRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryEmbed.create({
        repositoryConfig: cfg.embedRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    },
pageEmbedLinkRepository: async (cfg, logger) => {
      const eff = RepositoryFactoryPageEmbedLink.create({
        repositoryConfig: cfg.pageEmbedLinkRepositoryConfig,
        logger,
        logLevel: cfg.logLevel,
      })
      return await Effect.runPromise(eff)
    }
    },
services: {
documentService: async (ctx, _deps, repos, logger) => {
      return new DocumentService({
        documentRepository: repos.documentRepository,
        serviceDependencies: {
          assetRepository: repos.assetRepository,
          assetVersionRepository: repos.assetVersionRepository,
          documentVersionRepository: repos.documentVersionRepository,
          documentSectionLinkRepository: repos.documentSectionLinkRepository,
          documentIndexEntryRepository: repos.documentIndexEntryRepository,
          sectionRepository: repos.sectionRepository,
          pageRepository: repos.pageRepository,
          pageVersionRepository: repos.pageVersionRepository,
          sectionPageLinkRepository: repos.sectionPageLinkRepository,
          pageSnippetLinkRepository: repos.pageSnippetLinkRepository,
          pageEmbedLinkRepository: repos.pageEmbedLinkRepository,
        },
        logger,
        locale: ctx.locale,
      })
    },
documentGroupService: async (ctx, _deps, repos, logger) => {
      return new DocumentGroupService({
        documentGroupRepository: repos.documentGroupRepository,
        logger,
        locale: ctx.locale,
      })
    },
    documentVersionService: async (ctx, _deps, repos, logger) => {
      return new DocumentVersionService({
        documentVersionRepository: repos.documentVersionRepository,
        serviceDependencies: {
          documentRepository: repos.documentRepository,
          documentSectionLinkRepository: repos.documentSectionLinkRepository,
          sectionRepository: repos.sectionRepository,
          pageRepository: repos.pageRepository,
          pageVersionRepository: repos.pageVersionRepository,
          sectionPageLinkRepository: repos.sectionPageLinkRepository,
          pageSnippetLinkRepository: repos.pageSnippetLinkRepository,
          pageEmbedLinkRepository: repos.pageEmbedLinkRepository,
        },
        unitOfWork: createDocmanUnitOfWork(repos.documentVersionRepository.getRepositoryConfig()),
        logger,
        locale: ctx.locale,
      })
    },
sectionService: async (ctx, _deps, repos, logger) => {
      return new SectionService({
        sectionRepository: repos.sectionRepository,
        logger,
        locale: ctx.locale,
      })
    },
pageService: async (ctx, _deps, repos, logger) => {
      return new PageService({
        pageRepository: repos.pageRepository,
        logger,
        locale: ctx.locale,
      })
    },
pageVersionService: async (ctx, _deps, repos, logger) => {
      return new PageVersionService({
        pageVersionRepository: repos.pageVersionRepository,
        serviceDependencies: {
          documentSectionLinkRepository: repos.documentSectionLinkRepository,
          sectionPageLinkRepository: repos.sectionPageLinkRepository,
        },
        logger,
        locale: ctx.locale,
      })
    },
documentSectionLinkService: async (ctx, _deps, repos, logger) => {
      return new DocumentSectionLinkService({
        documentSectionLinkRepository: repos.documentSectionLinkRepository,
        logger,
        locale: ctx.locale,
      })
    },
sectionPageLinkService: async (ctx, _deps, repos, logger) => {
      return new SectionPageLinkService({
        sectionPageLinkRepository: repos.sectionPageLinkRepository,
        logger,
        locale: ctx.locale,
      })
    },
snippetService: async (ctx, _deps, repos, logger) => {
      return new SnippetService({
        snippetRepository: repos.snippetRepository,
        logger,
        locale: ctx.locale,
      })
    },
pageSnippetLinkService: async (ctx, _deps, repos, logger) => {
      return new PageSnippetLinkService({
        pageSnippetLinkRepository: repos.pageSnippetLinkRepository,
        logger,
        locale: ctx.locale,
      })
    },
assetService: async (ctx, _deps, repos, logger) => {
      return new AssetService({
        assetRepository: repos.assetRepository,
        logger,
        locale: ctx.locale,
      })
    },
assetVersionService: async (ctx, _deps, repos, logger) => {
      return new AssetVersionService({
        assetVersionRepository: repos.assetVersionRepository,
        logger,
        locale: ctx.locale,
      })
    },
embedService: async (ctx, _deps, repos, logger) => {
      return new EmbedService({
        embedRepository: repos.embedRepository,
        logger,
        locale: ctx.locale,
      })
    },
pageEmbedLinkService: async (ctx, _deps, repos, logger) => {
      return new PageEmbedLinkService({
        pageEmbedLinkRepository: repos.pageEmbedLinkRepository,
        logger,
        locale: ctx.locale,
      })
    }
    },
    cache: options.cache,
    metrics: options.metrics,
    resilience: options.resilience,
    transformService: options.transformService,
  })

  function toStats(): DocmanKitDomainServiceRegistryStats {
    const stats = gp.getStats()
    return {
      name: stats.name,
      configKey: stats.configKey,
      services: {
        documentService: stats.services.documentService,
        documentGroupService: stats.services.documentGroupService,
        documentVersionService: stats.services.documentVersionService,
        sectionService: stats.services.sectionService,
        pageService: stats.services.pageService,
        pageVersionService: stats.services.pageVersionService,
        documentSectionLinkService: stats.services.documentSectionLinkService,
        sectionPageLinkService: stats.services.sectionPageLinkService,
        snippetService: stats.services.snippetService,
        pageSnippetLinkService: stats.services.pageSnippetLinkService,
        assetService: stats.services.assetService,
        assetVersionService: stats.services.assetVersionService,
        embedService: stats.services.embedService,
        pageEmbedLinkService: stats.services.pageEmbedLinkService,
      },
      repositories: {
        documentRepository: !!stats.repositories.documentRepository,
        documentGroupRepository: !!stats.repositories.documentGroupRepository,
        documentVersionRepository: !!stats.repositories.documentVersionRepository,
        sectionRepository: !!stats.repositories.sectionRepository,
        pageRepository: !!stats.repositories.pageRepository,
        pageVersionRepository: !!stats.repositories.pageVersionRepository,
        documentIndexEntryRepository: !!stats.repositories.documentIndexEntryRepository,
        documentSectionLinkRepository: !!stats.repositories.documentSectionLinkRepository,
        sectionPageLinkRepository: !!stats.repositories.sectionPageLinkRepository,
        snippetRepository: !!stats.repositories.snippetRepository,
        pageSnippetLinkRepository: !!stats.repositories.pageSnippetLinkRepository,
        assetRepository: !!stats.repositories.assetRepository,
        assetVersionRepository: !!stats.repositories.assetVersionRepository,
        embedRepository: !!stats.repositories.embedRepository,
        pageEmbedLinkRepository: !!stats.repositories.pageEmbedLinkRepository,
      },
    }
  }

  return {
    async getDocumentService(overrides) {
      return gp.getService('documentService', overrides)
    },
    async createDocumentService(overrides) {
      return gp.createService('documentService', overrides)
    },
    async getDocumentGroupService(overrides) {
      return gp.getService('documentGroupService', overrides)
    },
    async createDocumentGroupService(overrides) {
      return gp.createService('documentGroupService', overrides)
    },
    async getDocumentVersionService(overrides) {
      return gp.getService('documentVersionService', overrides)
    },
    async createDocumentVersionService(overrides) {
      return gp.createService('documentVersionService', overrides)
    },
    async getSectionService(overrides) {
      return gp.getService('sectionService', overrides)
    },
    async createSectionService(overrides) {
      return gp.createService('sectionService', overrides)
    },
    async getPageService(overrides) {
      return gp.getService('pageService', overrides)
    },
    async createPageService(overrides) {
      return gp.createService('pageService', overrides)
    },
    async getPageVersionService(overrides) {
      return gp.getService('pageVersionService', overrides)
    },
    async createPageVersionService(overrides) {
      return gp.createService('pageVersionService', overrides)
    },
    async getDocumentSectionLinkService(overrides) {
      return gp.getService('documentSectionLinkService', overrides)
    },
    async createDocumentSectionLinkService(overrides) {
      return gp.createService('documentSectionLinkService', overrides)
    },
    async getSectionPageLinkService(overrides) {
      return gp.getService('sectionPageLinkService', overrides)
    },
    async createSectionPageLinkService(overrides) {
      return gp.createService('sectionPageLinkService', overrides)
    },
    async getSnippetService(overrides) {
      return gp.getService('snippetService', overrides)
    },
    async createSnippetService(overrides) {
      return gp.createService('snippetService', overrides)
    },
    async getPageSnippetLinkService(overrides) {
      return gp.getService('pageSnippetLinkService', overrides)
    },
    async createPageSnippetLinkService(overrides) {
      return gp.createService('pageSnippetLinkService', overrides)
    },
    async getAssetService(overrides) {
      return gp.getService('assetService', overrides)
    },
    async createAssetService(overrides) {
      return gp.createService('assetService', overrides)
    },
    async getAssetVersionService(overrides) {
      return gp.getService('assetVersionService', overrides)
    },
    async createAssetVersionService(overrides) {
      return gp.createService('assetVersionService', overrides)
    },
    async getEmbedService(overrides) {
      return gp.getService('embedService', overrides)
    },
    async createEmbedService(overrides) {
      return gp.createService('embedService', overrides)
    },
    async getPageEmbedLinkService(overrides) {
      return gp.getService('pageEmbedLinkService', overrides)
    },
    async createPageEmbedLinkService(overrides) {
      return gp.createService('pageEmbedLinkService', overrides)
    },
    async getDocumentRepository(overrides) {
      return gp.getRepository('documentRepository', overrides)
    },
    async getDocumentGroupRepository(overrides) {
      return gp.getRepository('documentGroupRepository', overrides)
    },
    async getDocumentVersionRepository(overrides) {
      return gp.getRepository('documentVersionRepository', overrides)
    },
    async getSectionRepository(overrides) {
      return gp.getRepository('sectionRepository', overrides)
    },
    async getPageRepository(overrides) {
      return gp.getRepository('pageRepository', overrides)
    },
    async getPageVersionRepository(overrides) {
      return gp.getRepository('pageVersionRepository', overrides)
    },
    async getDocumentIndexEntryRepository(overrides) {
      return gp.getRepository('documentIndexEntryRepository', overrides)
    },
    async getDocumentSectionLinkRepository(overrides) {
      return gp.getRepository('documentSectionLinkRepository', overrides)
    },
    async getSectionPageLinkRepository(overrides) {
      return gp.getRepository('sectionPageLinkRepository', overrides)
    },
    async getSnippetRepository(overrides) {
      return gp.getRepository('snippetRepository', overrides)
    },
    async getPageSnippetLinkRepository(overrides) {
      return gp.getRepository('pageSnippetLinkRepository', overrides)
    },
    async getAssetRepository(overrides) {
      return gp.getRepository('assetRepository', overrides)
    },
    async getAssetVersionRepository(overrides) {
      return gp.getRepository('assetVersionRepository', overrides)
    },
    async getEmbedRepository(overrides) {
      return gp.getRepository('embedRepository', overrides)
    },
    async getPageEmbedLinkRepository(overrides) {
      return gp.getRepository('pageEmbedLinkRepository', overrides)
    },
    async getAll(overrides) {
      return gp.getAll(overrides)
    },
    async createAll(overrides) {
      return gp.createAll(overrides)
    },
    clearServiceCache(cacheKey?: string) {
      gp.clearCache(cacheKey)
    },
    clearDocumentServiceCache(cacheKey?: string) {
      gp.clearServiceCache('documentService', cacheKey)
    },
    clearDocumentGroupServiceCache(cacheKey?: string) {
      gp.clearServiceCache('documentGroupService', cacheKey)
    },
    clearDocumentVersionServiceCache(cacheKey?: string) {
      gp.clearServiceCache('documentVersionService', cacheKey)
    },
    clearSectionServiceCache(cacheKey?: string) {
      gp.clearServiceCache('sectionService', cacheKey)
    },
    clearPageServiceCache(cacheKey?: string) {
      gp.clearServiceCache('pageService', cacheKey)
    },
    clearPageVersionServiceCache(cacheKey?: string) {
      gp.clearServiceCache('pageVersionService', cacheKey)
    },
    clearDocumentSectionLinkServiceCache(cacheKey?: string) {
      gp.clearServiceCache('documentSectionLinkService', cacheKey)
    },
    clearSectionPageLinkServiceCache(cacheKey?: string) {
      gp.clearServiceCache('sectionPageLinkService', cacheKey)
    },
    clearSnippetServiceCache(cacheKey?: string) {
      gp.clearServiceCache('snippetService', cacheKey)
    },
    clearPageSnippetLinkServiceCache(cacheKey?: string) {
      gp.clearServiceCache('pageSnippetLinkService', cacheKey)
    },
    clearAssetServiceCache(cacheKey?: string) {
      gp.clearServiceCache('assetService', cacheKey)
    },
    clearAssetVersionServiceCache(cacheKey?: string) {
      gp.clearServiceCache('assetVersionService', cacheKey)
    },
    clearEmbedServiceCache(cacheKey?: string) {
      gp.clearServiceCache('embedService', cacheKey)
    },
    clearPageEmbedLinkServiceCache(cacheKey?: string) {
      gp.clearServiceCache('pageEmbedLinkService', cacheKey)
    },
    reset(options?: { services?: boolean; repositories?: boolean }) {
      gp.reset(options)
    },
    getRegistryStats() {
      return toStats()
    },
    async resolveLogger(overrides) {
      if (!options.resolveLogger) return undefined
      const base = await Promise.resolve(options.getContext(overrides))
      return options.resolveLogger({ ...base, ...(overrides ?? {}) })
    },
  }
}
