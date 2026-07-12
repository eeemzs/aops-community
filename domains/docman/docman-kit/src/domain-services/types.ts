import type { DefaultServiceProviderOptions, RegistryStats, ServiceCacheOptions, MetricsCollector, RetryOptions, CircuitBreaker, RepositoryEndpoint } from '@aopslab/xf-dm-kits'
import type { RepositoryConfig } from '@aopslab/xf-db'
import type { XfLogger } from '@aopslab/xf-logger'
import type { IDocumentServicePort, IDocumentGroupServicePort, IDocumentVersionServicePort, ISectionServicePort, IPageServicePort, IPageVersionServicePort, IDocumentSectionLinkServicePort, ISectionPageLinkServicePort, ISnippetServicePort, IPageSnippetLinkServicePort, IAssetServicePort, IAssetVersionServicePort, IEmbedServicePort, IPageEmbedLinkServicePort } from '@aopslab/domain-dm-docman/ports'
import type { IRepositoryPortDocument, IRepositoryPortDocumentGroup, IRepositoryPortDocumentVersion, IRepositoryPortSection, IRepositoryPortPage, IRepositoryPortPageVersion, IRepositoryPortDocumentIndexEntry, IRepositoryPortDocumentSectionLink, IRepositoryPortSectionPageLink, IRepositoryPortSnippet, IRepositoryPortPageSnippetLink, IRepositoryPortAsset, IRepositoryPortAssetVersion, IRepositoryPortEmbed, IRepositoryPortPageEmbedLink } from '@aopslab/domain-dm-docman/repository-ports'

export interface DocmanKitContext {
  tenantId: string
  locale?: string
  fallbackLocale?: string
  cacheKey?: string
  logger?: XfLogger
}

export interface DocmanKitStaticConfig {
  logLevel?: DefaultServiceProviderOptions['logLevel']
  documentRepository: RepositoryEndpoint
  documentGroupRepository: RepositoryEndpoint
  documentVersionRepository: RepositoryEndpoint
  sectionRepository: RepositoryEndpoint
  pageRepository: RepositoryEndpoint
  pageVersionRepository: RepositoryEndpoint
  documentIndexEntryRepository: RepositoryEndpoint
  documentSectionLinkRepository: RepositoryEndpoint
  sectionPageLinkRepository: RepositoryEndpoint
  snippetRepository: RepositoryEndpoint
  pageSnippetLinkRepository: RepositoryEndpoint
  assetRepository: RepositoryEndpoint
  assetVersionRepository: RepositoryEndpoint
  embedRepository: RepositoryEndpoint
  pageEmbedLinkRepository: RepositoryEndpoint
}

export interface DocmanKitServiceProviderOptions extends DefaultServiceProviderOptions {
  tenantId: string
  localeOptions?: { locale?: string; fallbackLocale?: string }
  logLevel?: DefaultServiceProviderOptions['logLevel']
  documentRepositoryConfig: RepositoryConfig
  documentGroupRepositoryConfig: RepositoryConfig
  documentVersionRepositoryConfig: RepositoryConfig
  sectionRepositoryConfig: RepositoryConfig
  pageRepositoryConfig: RepositoryConfig
  pageVersionRepositoryConfig: RepositoryConfig
  documentIndexEntryRepositoryConfig: RepositoryConfig
  documentSectionLinkRepositoryConfig: RepositoryConfig
  sectionPageLinkRepositoryConfig: RepositoryConfig
  snippetRepositoryConfig: RepositoryConfig
  pageSnippetLinkRepositoryConfig: RepositoryConfig
  assetRepositoryConfig: RepositoryConfig
  assetVersionRepositoryConfig: RepositoryConfig
  embedRepositoryConfig: RepositoryConfig
  pageEmbedLinkRepositoryConfig: RepositoryConfig
}

export interface DocmanKitServices {
  documentService: IDocumentServicePort
  documentGroupService: IDocumentGroupServicePort
  documentVersionService: IDocumentVersionServicePort
  sectionService: ISectionServicePort
  pageService: IPageServicePort
  pageVersionService: IPageVersionServicePort
  documentSectionLinkService: IDocumentSectionLinkServicePort
  sectionPageLinkService: ISectionPageLinkServicePort
  snippetService: ISnippetServicePort
  pageSnippetLinkService: IPageSnippetLinkServicePort
  assetService: IAssetServicePort
  assetVersionService: IAssetVersionServicePort
  embedService: IEmbedServicePort
  pageEmbedLinkService: IPageEmbedLinkServicePort
}

export interface DocmanKitRepositories {
  documentRepository: IRepositoryPortDocument
  documentGroupRepository: IRepositoryPortDocumentGroup
  documentVersionRepository: IRepositoryPortDocumentVersion
  sectionRepository: IRepositoryPortSection
  pageRepository: IRepositoryPortPage
  pageVersionRepository: IRepositoryPortPageVersion
  documentIndexEntryRepository: IRepositoryPortDocumentIndexEntry
  documentSectionLinkRepository: IRepositoryPortDocumentSectionLink
  sectionPageLinkRepository: IRepositoryPortSectionPageLink
  snippetRepository: IRepositoryPortSnippet
  pageSnippetLinkRepository: IRepositoryPortPageSnippetLink
  assetRepository: IRepositoryPortAsset
  assetVersionRepository: IRepositoryPortAssetVersion
  embedRepository: IRepositoryPortEmbed
  pageEmbedLinkRepository: IRepositoryPortPageEmbedLink
}

export type DocmanKitServiceKeys = Extract<keyof DocmanKitServices, string>

export type DocmanKitDomainServiceRegistryStats = RegistryStats<DocmanKitServiceKeys>

export interface DocmanKitProvider {
  getDocumentService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['documentService']>
  createDocumentService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['documentService']>
  getDocumentGroupService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['documentGroupService']>
  createDocumentGroupService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['documentGroupService']>
  getDocumentVersionService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['documentVersionService']>
  createDocumentVersionService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['documentVersionService']>
  getSectionService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['sectionService']>
  createSectionService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['sectionService']>
  getPageService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['pageService']>
  createPageService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['pageService']>
  getPageVersionService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['pageVersionService']>
  createPageVersionService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['pageVersionService']>
  getDocumentSectionLinkService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['documentSectionLinkService']>
  createDocumentSectionLinkService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['documentSectionLinkService']>
  getSectionPageLinkService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['sectionPageLinkService']>
  createSectionPageLinkService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['sectionPageLinkService']>
  getSnippetService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['snippetService']>
  createSnippetService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['snippetService']>
  getPageSnippetLinkService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['pageSnippetLinkService']>
  createPageSnippetLinkService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['pageSnippetLinkService']>
  getAssetService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['assetService']>
  createAssetService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['assetService']>
  getAssetVersionService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['assetVersionService']>
  createAssetVersionService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['assetVersionService']>
  getEmbedService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['embedService']>
  createEmbedService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['embedService']>
  getPageEmbedLinkService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['pageEmbedLinkService']>
  createPageEmbedLinkService(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices['pageEmbedLinkService']>
  getDocumentRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['documentRepository']>
  getDocumentGroupRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['documentGroupRepository']>
  getDocumentVersionRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['documentVersionRepository']>
  getSectionRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['sectionRepository']>
  getPageRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['pageRepository']>
  getPageVersionRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['pageVersionRepository']>
  getDocumentIndexEntryRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['documentIndexEntryRepository']>
  getDocumentSectionLinkRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['documentSectionLinkRepository']>
  getSectionPageLinkRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['sectionPageLinkRepository']>
  getSnippetRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['snippetRepository']>
  getPageSnippetLinkRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['pageSnippetLinkRepository']>
  getAssetRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['assetRepository']>
  getAssetVersionRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['assetVersionRepository']>
  getEmbedRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['embedRepository']>
  getPageEmbedLinkRepository(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitRepositories['pageEmbedLinkRepository']>
  getAll(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices>
  createAll(overrides?: Partial<DocmanKitContext>): Promise<DocmanKitServices>
  clearServiceCache(cacheKey?: string): void
  clearDocumentServiceCache(cacheKey?: string): void
  clearDocumentGroupServiceCache(cacheKey?: string): void
  clearDocumentVersionServiceCache(cacheKey?: string): void
  clearSectionServiceCache(cacheKey?: string): void
  clearPageServiceCache(cacheKey?: string): void
  clearPageVersionServiceCache(cacheKey?: string): void
  clearDocumentSectionLinkServiceCache(cacheKey?: string): void
  clearSectionPageLinkServiceCache(cacheKey?: string): void
  clearSnippetServiceCache(cacheKey?: string): void
  clearPageSnippetLinkServiceCache(cacheKey?: string): void
  clearAssetServiceCache(cacheKey?: string): void
  clearAssetVersionServiceCache(cacheKey?: string): void
  clearEmbedServiceCache(cacheKey?: string): void
  clearPageEmbedLinkServiceCache(cacheKey?: string): void
  reset(options?: { services?: boolean; repositories?: boolean }): void
  getRegistryStats(): DocmanKitDomainServiceRegistryStats
  resolveLogger(overrides?: Partial<DocmanKitContext>): Promise<XfLogger | undefined>
}

export interface DocmanKitProviderOptions {
  name?: string
  getContext: (overrides?: Partial<DocmanKitContext>) => Promise<DocmanKitContext> | DocmanKitContext
  staticConfig: DocmanKitStaticConfig
  resolveLogger?: (context: DocmanKitContext) => XfLogger | undefined
  getCacheKey?: (context: DocmanKitContext) => string | null
  cache?: Partial<Record<keyof DocmanKitServices, ServiceCacheOptions>> & ServiceCacheOptions
  metrics?: MetricsCollector
  resilience?: {
    services?: { retry?: RetryOptions; timeoutMs?: number; breaker?: CircuitBreaker }
    repositories?: { retry?: RetryOptions; timeoutMs?: number; breaker?: CircuitBreaker }
  }
  transformService?: (
    name: keyof DocmanKitServices,
    instance: DocmanKitServices[keyof DocmanKitServices]
  ) => DocmanKitServices[keyof DocmanKitServices]
  hooks?: Record<string, unknown>
}
