import type {
  CircuitBreaker,
  DefaultServiceProviderOptions,
  MetricsCollector,
  RepositoryEndpoint as RepoEndpointCommon,
  RegistryStats,
  RetryOptions,
  ServiceCacheOptions,
} from '@aopslab/xf-dm-kits'
import type { RepositoryConfig } from '@aopslab/xf-db'
import type { XfLogger } from '@aopslab/xf-logger'
import type {
  ICountryServicePort,
  ICounterServicePort,
  IEventStoreServicePort,
  IRateLimiterServicePort,
} from '@aopslab/domain-dm-sys/ports'

export interface SysKitContext {
  tenantId: string
  locale?: string
  fallbackLocale?: string
  cacheKey?: string
  logger?: XfLogger
}

export interface SysKitStaticConfig {
  logLevel?: DefaultServiceProviderOptions['logLevel']
  rateLimiterRepository: RepositoryEndpoint
  eventStoreRepository: RepositoryEndpoint
  counterRepository: RepositoryEndpoint
}

export interface SysKitServiceProviderOptions extends DefaultServiceProviderOptions {
  tenantId: string
  localeOptions?: { locale?: string; fallbackLocale?: string }
  logLevel?: DefaultServiceProviderOptions['logLevel']
  rateLimiterRepositoryConfig: RepositoryConfig
  eventStoreRepositoryConfig: RepositoryConfig
  counterRepositoryConfig: RepositoryConfig
}

export interface RepositoryEndpoint extends RepoEndpointCommon {}

export interface SysKitServices {
  countryService: ICountryServicePort
  rateLimiterService: IRateLimiterServicePort
  eventStoreService: IEventStoreServicePort
  counterService: ICounterServicePort
}

export type SysKitServiceKeys = Extract<keyof SysKitServices, string>

export type SysKitDomainServiceRegistryStats = RegistryStats<SysKitServiceKeys>

export interface SysKitProvider {
  getCountryService(overrides?: Partial<SysKitContext>): Promise<SysKitServices['countryService']>
  createCountryService(overrides?: Partial<SysKitContext>): Promise<SysKitServices['countryService']>
  getRateLimiterService(overrides?: Partial<SysKitContext>): Promise<SysKitServices['rateLimiterService']>
  createRateLimiterService(overrides?: Partial<SysKitContext>): Promise<SysKitServices['rateLimiterService']>
  getEventStoreService(overrides?: Partial<SysKitContext>): Promise<SysKitServices['eventStoreService']>
  createEventStoreService(overrides?: Partial<SysKitContext>): Promise<SysKitServices['eventStoreService']>
  getCounterService(overrides?: Partial<SysKitContext>): Promise<SysKitServices['counterService']>
  createCounterService(overrides?: Partial<SysKitContext>): Promise<SysKitServices['counterService']>
  getAll(overrides?: Partial<SysKitContext>): Promise<SysKitServices>
  createAll(overrides?: Partial<SysKitContext>): Promise<SysKitServices>
  clearServiceCache(cacheKey?: string): void
  clearCountryServiceCache(cacheKey?: string): void
  clearRateLimiterServiceCache(cacheKey?: string): void
  clearEventStoreServiceCache(cacheKey?: string): void
  clearCounterServiceCache(cacheKey?: string): void
  reset(options?: { services?: boolean; repositories?: boolean }): void
  getRegistryStats(): SysKitDomainServiceRegistryStats
  resolveLogger(overrides?: Partial<SysKitContext>): Promise<XfLogger | undefined>
}

export interface SysKitProviderOptions {
  name?: string
  getContext: (overrides?: Partial<SysKitContext>) => Promise<SysKitContext> | SysKitContext
  staticConfig: SysKitStaticConfig
  resolveLogger?: (context: SysKitContext) => XfLogger | undefined
  getCacheKey?: (context: SysKitContext) => string | null
  cache?: Partial<Record<SysKitServiceKeys, ServiceCacheOptions>> & ServiceCacheOptions
  metrics?: MetricsCollector
  resilience?: {
    services?: { retry?: RetryOptions; timeoutMs?: number; breaker?: CircuitBreaker }
    repositories?: { retry?: RetryOptions; timeoutMs?: number; breaker?: CircuitBreaker }
  }
  transformService?: (
    name: SysKitServiceKeys,
    instance: SysKitServices[SysKitServiceKeys],
  ) => SysKitServices[SysKitServiceKeys]
  hooks?: Record<string, unknown>
}
