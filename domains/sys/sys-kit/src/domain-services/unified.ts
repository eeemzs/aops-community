import type { XfLogger } from '@aopslab/xf-logger'
import { Effect } from 'effect'
import {
  cacheKeyFromLocale,
  CountersMetricsCollector,
  LoggerMetricsCollector,
  MultiMetricsCollector,
  inferRepoType,
  parseEnvConfig,
} from '@aopslab/xf-dm-kits'

import type { SysKitEnvConfig } from '../config/config.js'
import type { SysKitProvider, SysKitProviderOptions, SysKitContext, SysKitStaticConfig } from './types.js'
import { createSysKitProvider } from './provider.js'

export interface CreateSysKitOptions extends Omit<SysKitProviderOptions, 'getCacheKey'> {
  name?: string
  getCacheKey?: (context: SysKitContext) => string | null
}

export function createSysKit(options: CreateSysKitOptions) {
  const provider: SysKitProvider = createSysKitProvider({
    ...options,
    getCacheKey: options.getCacheKey ?? ((ctx) => cacheKeyFromLocale(ctx.locale, ctx.fallbackLocale)),
  })

  return {
    getStaticConfig(): SysKitStaticConfig {
      return options.staticConfig
    },
    getCountryService: provider.getCountryService,
    createCountryService: provider.createCountryService,
    getRateLimiterService: provider.getRateLimiterService,
    createRateLimiterService: provider.createRateLimiterService,
    getEventStoreService: provider.getEventStoreService,
    createEventStoreService: provider.createEventStoreService,
    getCounterService: provider.getCounterService,
    createCounterService: provider.createCounterService,
    getAll: provider.getAll,
    createAll: provider.createAll,
    clearServiceCache: provider.clearServiceCache,
    clearCountryServiceCache: provider.clearCountryServiceCache,
    clearRateLimiterServiceCache: provider.clearRateLimiterServiceCache,
    clearEventStoreServiceCache: provider.clearEventStoreServiceCache,
    clearCounterServiceCache: provider.clearCounterServiceCache,
    reset: provider.reset,
    getRegistryStats: provider.getRegistryStats,
    resolveLogger: provider.resolveLogger,

    withContext(overrides: Partial<SysKitContext>) {
      return {
        getStaticConfig(): SysKitStaticConfig {
          return options.staticConfig
        },
        getCountryService: (o?: Partial<SysKitContext>) => provider.getCountryService({ ...overrides, ...o }),
        createCountryService: (o?: Partial<SysKitContext>) => provider.createCountryService({ ...overrides, ...o }),
        getRateLimiterService: (o?: Partial<SysKitContext>) => provider.getRateLimiterService({ ...overrides, ...o }),
        createRateLimiterService: (o?: Partial<SysKitContext>) => provider.createRateLimiterService({ ...overrides, ...o }),
        getEventStoreService: (o?: Partial<SysKitContext>) => provider.getEventStoreService({ ...overrides, ...o }),
        createEventStoreService: (o?: Partial<SysKitContext>) => provider.createEventStoreService({ ...overrides, ...o }),
        getCounterService: (o?: Partial<SysKitContext>) => provider.getCounterService({ ...overrides, ...o }),
        createCounterService: (o?: Partial<SysKitContext>) => provider.createCounterService({ ...overrides, ...o }),
        getAll: (o?: Partial<SysKitContext>) => provider.getAll({ ...overrides, ...o }),
        createAll: (o?: Partial<SysKitContext>) => provider.createAll({ ...overrides, ...o }),
        clearServiceCache: (cacheKey?: string) => provider.clearServiceCache(cacheKey),
        clearCountryServiceCache: (cacheKey?: string) => provider.clearCountryServiceCache(cacheKey),
        clearRateLimiterServiceCache: (cacheKey?: string) => provider.clearRateLimiterServiceCache(cacheKey),
        clearEventStoreServiceCache: (cacheKey?: string) => provider.clearEventStoreServiceCache(cacheKey),
        clearCounterServiceCache: (cacheKey?: string) => provider.clearCounterServiceCache(cacheKey),
        reset: (opts?: { services?: boolean; repositories?: boolean }) => provider.reset(opts),
        getRegistryStats: () => provider.getRegistryStats(),
        resolveLogger: (o?: Partial<SysKitContext>) => provider.resolveLogger({ ...overrides, ...o }),
      }
    },
  }
}

export function buildSysKitStaticConfig(envConfig: SysKitEnvConfig): SysKitStaticConfig {
  return {
    logLevel: envConfig.logLevel,
    rateLimiterRepository: {
      repositoryType: inferRepoType(envConfig.rateLimiterRepoUrl),
      url: envConfig.rateLimiterRepoUrl,
    },
    eventStoreRepository: {
      repositoryType: inferRepoType(envConfig.eventStoreRepoUrl),
      url: envConfig.eventStoreRepoUrl,
    },
    counterRepository: {
      repositoryType: inferRepoType(envConfig.counterRepoUrl),
      url: envConfig.counterRepoUrl,
    },
  }
}

export type CreateSysKitWithEnvOptions = {
  name?: string
  envConfig: SysKitEnvConfig
  baseContext: {
    tenantId: string
    locale?: string
    fallbackLocale?: string
    logger?: XfLogger
  }
  getCacheKey?: (context: SysKitContext) => string | null
} & Pick<SysKitProviderOptions, 'cache' | 'metrics' | 'resilience' | 'transformService' | 'resolveLogger'>

export function createSysKitWithEnv(options: CreateSysKitWithEnvOptions) {
  const staticConfig = buildSysKitStaticConfig(options.envConfig)
  const envCfg = parseEnvConfig()

  const statsEnabled = envCfg.statsEnabled === true
  const counters = statsEnabled ? new CountersMetricsCollector() : undefined
  const loggerMetrics = statsEnabled ? new LoggerMetricsCollector(undefined) : undefined
  const metricsCollector =
    options.metrics ?? (counters && loggerMetrics ? new MultiMetricsCollector([counters, loggerMetrics]) : counters ?? loggerMetrics)

  const cacheMerged = (options.cache || envCfg.cacheGlobal)
    ? ({ ...(options.cache ?? {}), ...(envCfg.cacheGlobal ?? {}) } as SysKitProviderOptions['cache'])
    : undefined

  const resilienceMerged = (options.resilience || envCfg.resilience)
    ? ({ ...(options.resilience ?? {}), ...(envCfg.resilience ?? {}) })
    : undefined

  const kit = createSysKit({
    name: options.name ?? 'sys-kit',
    staticConfig,
    getContext: (overrides?: Partial<SysKitContext>) => ({
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
    resilience: resilienceMerged as SysKitProviderOptions['resilience'],
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
