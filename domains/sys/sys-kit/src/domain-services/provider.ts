import { Effect } from 'effect'
import type { RepositoryConfig } from '@aopslab/xf-db'
import type { RedisConfig } from '@aopslab/xf-db-redis'
import type { XfLogger } from '@aopslab/xf-logger'
import { buildRepositoryConfig, cacheKeyFromLocale, createProvider, fingerprintRepositoryConfig } from '@aopslab/xf-dm-kits'
import {
  ServiceFactoryCounter,
  ServiceFactoryCountry,
  ServiceFactoryEventStore,
  ServiceFactoryRateLimiter,
} from '@aopslab/domain-dm-sys/factories'

import type {
  SysKitContext,
  SysKitDomainServiceRegistryStats,
  SysKitProvider,
  SysKitProviderOptions,
  SysKitServiceProviderOptions,
  SysKitServices,
  SysKitStaticConfig,
} from './types.js'

function computeConfigKey(name: string, cfg: SysKitServiceProviderOptions): string {
  const sigs = [
    fingerprintRepositoryConfig(cfg.rateLimiterRepositoryConfig),
    fingerprintRepositoryConfig(cfg.eventStoreRepositoryConfig),
    fingerprintRepositoryConfig(cfg.counterRepositoryConfig),
  ]
  return [name, cfg.tenantId ?? '', ...sigs].join('|')
}

function buildResolvedConfig(staticCfg: SysKitStaticConfig, ctx: SysKitContext): SysKitServiceProviderOptions {
  const tenantId = ctx.tenantId
  return {
    tenantId,
    logLevel: staticCfg.logLevel,
    localeOptions: { locale: ctx.locale, fallbackLocale: ctx.fallbackLocale },
    rateLimiterRepositoryConfig: buildRepositoryConfig(staticCfg.rateLimiterRepository, tenantId),
    eventStoreRepositoryConfig: buildRepositoryConfig(staticCfg.eventStoreRepository, tenantId),
    counterRepositoryConfig: buildRepositoryConfig(staticCfg.counterRepository, tenantId),
  }
}

function buildRedisConfig(repositoryConfig: RepositoryConfig): RedisConfig | undefined {
  if (repositoryConfig.repositoryType !== 'redis') return undefined
  return {
    connection: {},
    adapter: {},
  }
}

export function createSysKitProvider(options: SysKitProviderOptions): SysKitProvider {
  const name = options.name ?? 'sys-kit'

  function defaultCacheKey(context: SysKitContext): string | null {
    if (typeof context.cacheKey === 'string' && context.cacheKey.length > 0) return context.cacheKey
    return cacheKeyFromLocale(context.locale, context.fallbackLocale)
  }

  const provider = createProvider<
    SysKitContext,
    SysKitServiceProviderOptions,
    XfLogger | undefined,
    SysKitServices,
    {}
  >({
    name: `sys-kit::provider::${name}`,
    getContext: options.getContext,
    getCacheKey: (ctx) => options.getCacheKey?.(ctx) ?? defaultCacheKey(ctx),
    resolveLogger: options.resolveLogger,
    resolveConfig: (ctx) => buildResolvedConfig(options.staticConfig, ctx),
    computeConfigKey: (cfg) => computeConfigKey(name, cfg),
    repositories: {},
    services: {
      countryService: async (ctx, _deps, _repos, logger) => {
        const cfg = buildResolvedConfig(options.staticConfig, ctx)
        const effect = ServiceFactoryCountry
          .builder()
          .withConfig({
            logger,
            logLevel: cfg.logLevel,
            options: cfg.localeOptions,
          })
          .build()
        return await Effect.runPromise(effect)
      },
      rateLimiterService: async (ctx, _deps, _repos, logger) => {
        const cfg = buildResolvedConfig(options.staticConfig, ctx)
        const effect = ServiceFactoryRateLimiter
          .builder()
          .withConfig({
            rateLimiterRepositoryConfig: cfg.rateLimiterRepositoryConfig,
            redisConfig: buildRedisConfig(cfg.rateLimiterRepositoryConfig),
            logger,
            logLevel: cfg.logLevel,
            options: cfg.localeOptions,
          })
          .build()
        return await Effect.runPromise(effect)
      },
      eventStoreService: async (ctx, _deps, _repos, logger) => {
        const cfg = buildResolvedConfig(options.staticConfig, ctx)
        const effect = ServiceFactoryEventStore
          .builder()
          .withConfig({
            eventStoreRepositoryConfig: cfg.eventStoreRepositoryConfig,
            redisConfig: buildRedisConfig(cfg.eventStoreRepositoryConfig),
            logger,
            logLevel: cfg.logLevel,
            options: cfg.localeOptions,
          })
          .build()
        return await Effect.runPromise(effect)
      },
      counterService: async (ctx, _deps, _repos, logger) => {
        const cfg = buildResolvedConfig(options.staticConfig, ctx)
        const effect = ServiceFactoryCounter
          .builder()
          .withConfig({
            counterRepositoryConfig: cfg.counterRepositoryConfig,
            redisConfig: buildRedisConfig(cfg.counterRepositoryConfig),
            logger,
            logLevel: cfg.logLevel,
          })
          .build()
        return await Effect.runPromise(effect)
      },
    },
    cache: options.cache,
    metrics: options.metrics,
    resilience: options.resilience,
    transformService: options.transformService,
  })

  return {
    async getCountryService(overrides) {
      return provider.getService('countryService', overrides)
    },
    async createCountryService(overrides) {
      return provider.createService('countryService', overrides)
    },
    async getRateLimiterService(overrides) {
      return provider.getService('rateLimiterService', overrides)
    },
    async createRateLimiterService(overrides) {
      return provider.createService('rateLimiterService', overrides)
    },
    async getEventStoreService(overrides) {
      return provider.getService('eventStoreService', overrides)
    },
    async createEventStoreService(overrides) {
      return provider.createService('eventStoreService', overrides)
    },
    async getCounterService(overrides) {
      return provider.getService('counterService', overrides)
    },
    async createCounterService(overrides) {
      return provider.createService('counterService', overrides)
    },
    async getAll(overrides) {
      return provider.getAll(overrides)
    },
    async createAll(overrides) {
      return provider.createAll(overrides)
    },
    clearServiceCache(cacheKey?: string) {
      provider.clearCache(cacheKey)
    },
    clearCountryServiceCache(cacheKey?: string) {
      provider.clearServiceCache('countryService', cacheKey)
    },
    clearRateLimiterServiceCache(cacheKey?: string) {
      provider.clearServiceCache('rateLimiterService', cacheKey)
    },
    clearEventStoreServiceCache(cacheKey?: string) {
      provider.clearServiceCache('eventStoreService', cacheKey)
    },
    clearCounterServiceCache(cacheKey?: string) {
      provider.clearServiceCache('counterService', cacheKey)
    },
    reset(options?: { services?: boolean; repositories?: boolean }) {
      provider.reset(options)
    },
    getRegistryStats(): SysKitDomainServiceRegistryStats {
      return provider.getStats()
    },
    async resolveLogger(overrides) {
      if (!options.resolveLogger) return undefined
      const base = await Promise.resolve(options.getContext(overrides))
      return options.resolveLogger({ ...base, ...(overrides ?? {}) })
    },
  }
}
