import type { XfLogger } from '@aopslab/xf-logger'
import { Effect } from 'effect'
import {
  cacheKeyFromLocale,
  CountersMetricsCollector,
  LoggerMetricsCollector,
  MultiMetricsCollector,
  parseEnvConfig,
} from '@aopslab/xf-dm-kits'

import type { ProjectmanKitEnvConfig } from '../config/config.js'
import type { ProjectmanKitProvider, ProjectmanKitProviderOptions, ProjectmanKitContext, ProjectmanKitStaticConfig } from './types.js'
import { createProjectmanKitProvider } from './provider.js'

function inferRepositoryType(url: string): ProjectmanKitStaticConfig['kanbanBoardRepository']['repositoryType'] {
  const normalized = url.trim().toLowerCase()
  if (!normalized) return 'mongo'
  if (normalized.startsWith('postgres://') || normalized.startsWith('postgresql://')) return 'drizzle'
  if (normalized === ':memory:') return 'drizzle'
  if (normalized.startsWith('sqlite:') || normalized.startsWith('file:')) return 'drizzle'
  if (normalized.endsWith('.db') || normalized.endsWith('.sqlite') || normalized.endsWith('.sqlite3')) return 'drizzle'
  return 'mongo'
}

export interface CreateProjectmanKitOptions extends Omit<ProjectmanKitProviderOptions, 'getCacheKey'> {
  name?: string
  getCacheKey?: (context: ProjectmanKitContext) => string | null
}

export function createProjectmanKit(options: CreateProjectmanKitOptions) {
  const provider: ProjectmanKitProvider = createProjectmanKitProvider({
    ...options,
    getCacheKey: options.getCacheKey ?? ((ctx) => cacheKeyFromLocale(ctx.locale, ctx.fallbackLocale)),
  })

  return {
    getStaticConfig(): ProjectmanKitStaticConfig {
      return options.staticConfig
    },
    getKanbanBoardService: provider.getKanbanBoardService,
    createKanbanBoardService: provider.createKanbanBoardService,
    getKanbanColumnService: provider.getKanbanColumnService,
    createKanbanColumnService: provider.createKanbanColumnService,
    getKanbanBoardColumnService: provider.getKanbanBoardColumnService,
    createKanbanBoardColumnService: provider.createKanbanBoardColumnService,
    getKanbanTaskService: provider.getKanbanTaskService,
    createKanbanTaskService: provider.createKanbanTaskService,
    getSprintService: provider.getSprintService,
    createSprintService: provider.createSprintService,
    getSprintGroupService: provider.getSprintGroupService,
    createSprintGroupService: provider.createSprintGroupService,
    getMicroTaskItemService: provider.getMicroTaskItemService,
    createMicroTaskItemService: provider.createMicroTaskItemService,
    getIssueItemService: provider.getIssueItemService,
    createIssueItemService: provider.createIssueItemService,
    getFeedbackItemService: provider.getFeedbackItemService,
    createFeedbackItemService: provider.createFeedbackItemService,
    getReviewRequestService: provider.getReviewRequestService,
    createReviewRequestService: provider.createReviewRequestService,
    getHistoryService: provider.getHistoryService,
    createHistoryService: provider.createHistoryService,
    getPlanningLineageService: provider.getPlanningLineageService,
    createPlanningLineageService: provider.createPlanningLineageService,
    getSprintKanbanTaskLinkService: provider.getSprintKanbanTaskLinkService,
    createSprintKanbanTaskLinkService: provider.createSprintKanbanTaskLinkService,
    getKanbanTemplateService: provider.getKanbanTemplateService,
    createKanbanTemplateService: provider.createKanbanTemplateService,
    getProjectmanEventService: provider.getProjectmanEventService,
    createProjectmanEventService: provider.createProjectmanEventService,
    getKanbanBoardRepository: provider.getKanbanBoardRepository,
    getKanbanColumnRepository: provider.getKanbanColumnRepository,
    getKanbanBoardColumnRepository: provider.getKanbanBoardColumnRepository,
    getKanbanTaskRepository: provider.getKanbanTaskRepository,
    getSprintRepository: provider.getSprintRepository,
    getSprintGroupRepository: provider.getSprintGroupRepository,
    getMicroTaskItemRepository: provider.getMicroTaskItemRepository,
    getIssueItemRepository: provider.getIssueItemRepository,
    getFeedbackItemRepository: provider.getFeedbackItemRepository,
    getReviewRequestRepository: provider.getReviewRequestRepository,
    getHistoryRepository: provider.getHistoryRepository,
    getPlanningLineageRepository: provider.getPlanningLineageRepository,
    getSprintKanbanTaskLinkRepository: provider.getSprintKanbanTaskLinkRepository,
    getKanbanTemplateRepository: provider.getKanbanTemplateRepository,
    getProjectmanEventRepository: provider.getProjectmanEventRepository,
    getAll: provider.getAll,
    createAll: provider.createAll,
    clearServiceCache: provider.clearServiceCache,
    clearKanbanBoardServiceCache: provider.clearKanbanBoardServiceCache,
    clearKanbanColumnServiceCache: provider.clearKanbanColumnServiceCache,
    clearKanbanBoardColumnServiceCache: provider.clearKanbanBoardColumnServiceCache,
    clearKanbanTaskServiceCache: provider.clearKanbanTaskServiceCache,
    clearSprintServiceCache: provider.clearSprintServiceCache,
    clearSprintGroupServiceCache: provider.clearSprintGroupServiceCache,
    clearMicroTaskItemServiceCache: provider.clearMicroTaskItemServiceCache,
    clearIssueItemServiceCache: provider.clearIssueItemServiceCache,
    clearFeedbackItemServiceCache: provider.clearFeedbackItemServiceCache,
    clearReviewRequestServiceCache: provider.clearReviewRequestServiceCache,
    clearHistoryServiceCache: provider.clearHistoryServiceCache,
    clearPlanningLineageServiceCache: provider.clearPlanningLineageServiceCache,
    clearSprintKanbanTaskLinkServiceCache: provider.clearSprintKanbanTaskLinkServiceCache,
    clearKanbanTemplateServiceCache: provider.clearKanbanTemplateServiceCache,
    clearProjectmanEventServiceCache: provider.clearProjectmanEventServiceCache,
    reset: provider.reset,
    getRegistryStats: provider.getRegistryStats,
    resolveLogger: provider.resolveLogger,

    withContext(overrides: Partial<ProjectmanKitContext>) {
      return {
        getStaticConfig(): ProjectmanKitStaticConfig {
          return options.staticConfig
        },
        getKanbanBoardService: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanBoardService({ ...overrides, ...o }),
        getKanbanColumnService: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanColumnService({ ...overrides, ...o }),
        getKanbanBoardColumnService: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanBoardColumnService({ ...overrides, ...o }),
        getKanbanTaskService: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanTaskService({ ...overrides, ...o }),
        getSprintService: (o?: Partial<ProjectmanKitContext>) => provider.getSprintService({ ...overrides, ...o }),
        getSprintGroupService: (o?: Partial<ProjectmanKitContext>) => provider.getSprintGroupService({ ...overrides, ...o }),
        getMicroTaskItemService: (o?: Partial<ProjectmanKitContext>) => provider.getMicroTaskItemService({ ...overrides, ...o }),
        getIssueItemService: (o?: Partial<ProjectmanKitContext>) => provider.getIssueItemService({ ...overrides, ...o }),
        getFeedbackItemService: (o?: Partial<ProjectmanKitContext>) => provider.getFeedbackItemService({ ...overrides, ...o }),
        getReviewRequestService: (o?: Partial<ProjectmanKitContext>) => provider.getReviewRequestService({ ...overrides, ...o }),
        getHistoryService: (o?: Partial<ProjectmanKitContext>) => provider.getHistoryService({ ...overrides, ...o }),
        getPlanningLineageService: (o?: Partial<ProjectmanKitContext>) => provider.getPlanningLineageService({ ...overrides, ...o }),
        getSprintKanbanTaskLinkService: (o?: Partial<ProjectmanKitContext>) => provider.getSprintKanbanTaskLinkService({ ...overrides, ...o }),
        getKanbanTemplateService: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanTemplateService({ ...overrides, ...o }),
        getProjectmanEventService: (o?: Partial<ProjectmanKitContext>) => provider.getProjectmanEventService({ ...overrides, ...o }),
        getKanbanBoardRepository: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanBoardRepository({ ...overrides, ...o }),
        getKanbanColumnRepository: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanColumnRepository({ ...overrides, ...o }),
        getKanbanBoardColumnRepository: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanBoardColumnRepository({ ...overrides, ...o }),
        getKanbanTaskRepository: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanTaskRepository({ ...overrides, ...o }),
        getSprintRepository: (o?: Partial<ProjectmanKitContext>) => provider.getSprintRepository({ ...overrides, ...o }),
        getSprintGroupRepository: (o?: Partial<ProjectmanKitContext>) => provider.getSprintGroupRepository({ ...overrides, ...o }),
        getMicroTaskItemRepository: (o?: Partial<ProjectmanKitContext>) => provider.getMicroTaskItemRepository({ ...overrides, ...o }),
        getIssueItemRepository: (o?: Partial<ProjectmanKitContext>) => provider.getIssueItemRepository({ ...overrides, ...o }),
        getFeedbackItemRepository: (o?: Partial<ProjectmanKitContext>) => provider.getFeedbackItemRepository({ ...overrides, ...o }),
        getReviewRequestRepository: (o?: Partial<ProjectmanKitContext>) => provider.getReviewRequestRepository({ ...overrides, ...o }),
        getHistoryRepository: (o?: Partial<ProjectmanKitContext>) => provider.getHistoryRepository({ ...overrides, ...o }),
        getPlanningLineageRepository: (o?: Partial<ProjectmanKitContext>) => provider.getPlanningLineageRepository({ ...overrides, ...o }),
        getSprintKanbanTaskLinkRepository: (o?: Partial<ProjectmanKitContext>) => provider.getSprintKanbanTaskLinkRepository({ ...overrides, ...o }),
        getKanbanTemplateRepository: (o?: Partial<ProjectmanKitContext>) => provider.getKanbanTemplateRepository({ ...overrides, ...o }),
        getProjectmanEventRepository: (o?: Partial<ProjectmanKitContext>) => provider.getProjectmanEventRepository({ ...overrides, ...o }),
        getAll: (o?: Partial<ProjectmanKitContext>) => provider.getAll({ ...overrides, ...o }),
        createAll: (o?: Partial<ProjectmanKitContext>) => provider.createAll({ ...overrides, ...o }),
        clearServiceCache: (cacheKey?: string) => provider.clearServiceCache(cacheKey),
        clearKanbanBoardServiceCache: (cacheKey?: string) => provider.clearKanbanBoardServiceCache(cacheKey),
        clearKanbanColumnServiceCache: (cacheKey?: string) => provider.clearKanbanColumnServiceCache(cacheKey),
        clearKanbanBoardColumnServiceCache: (cacheKey?: string) => provider.clearKanbanBoardColumnServiceCache(cacheKey),
        clearKanbanTaskServiceCache: (cacheKey?: string) => provider.clearKanbanTaskServiceCache(cacheKey),
        clearSprintServiceCache: (cacheKey?: string) => provider.clearSprintServiceCache(cacheKey),
        clearSprintGroupServiceCache: (cacheKey?: string) => provider.clearSprintGroupServiceCache(cacheKey),
        clearMicroTaskItemServiceCache: (cacheKey?: string) => provider.clearMicroTaskItemServiceCache(cacheKey),
        clearIssueItemServiceCache: (cacheKey?: string) => provider.clearIssueItemServiceCache(cacheKey),
        clearFeedbackItemServiceCache: (cacheKey?: string) => provider.clearFeedbackItemServiceCache(cacheKey),
        clearReviewRequestServiceCache: (cacheKey?: string) => provider.clearReviewRequestServiceCache(cacheKey),
        clearHistoryServiceCache: (cacheKey?: string) => provider.clearHistoryServiceCache(cacheKey),
        clearPlanningLineageServiceCache: (cacheKey?: string) => provider.clearPlanningLineageServiceCache(cacheKey),
        clearSprintKanbanTaskLinkServiceCache: (cacheKey?: string) => provider.clearSprintKanbanTaskLinkServiceCache(cacheKey),
        clearKanbanTemplateServiceCache: (cacheKey?: string) => provider.clearKanbanTemplateServiceCache(cacheKey),
        clearProjectmanEventServiceCache: (cacheKey?: string) => provider.clearProjectmanEventServiceCache(cacheKey),
        reset: (opts?: { services?: boolean; repositories?: boolean }) => provider.reset(opts),
        getRegistryStats: () => provider.getRegistryStats(),
        resolveLogger: (o?: Partial<ProjectmanKitContext>) => provider.resolveLogger({ ...overrides, ...o }),
      }
    },
  }
}

export function buildProjectmanKitStaticConfig(envConfig: ProjectmanKitEnvConfig): ProjectmanKitStaticConfig {
  return {
    logLevel: envConfig.logLevel,
    kanbanBoardRepository: { repositoryType: inferRepositoryType(envConfig.kanbanBoardRepoUrl), url: envConfig.kanbanBoardRepoUrl },
    kanbanColumnRepository: { repositoryType: inferRepositoryType(envConfig.kanbanColumnRepoUrl), url: envConfig.kanbanColumnRepoUrl },
    kanbanBoardColumnRepository: { repositoryType: inferRepositoryType(envConfig.kanbanBoardColumnRepoUrl), url: envConfig.kanbanBoardColumnRepoUrl },
    kanbanTaskRepository: { repositoryType: inferRepositoryType(envConfig.kanbanTaskRepoUrl), url: envConfig.kanbanTaskRepoUrl },
    sprintRepository: { repositoryType: inferRepositoryType(envConfig.sprintRepoUrl), url: envConfig.sprintRepoUrl },
    sprintGroupRepository: { repositoryType: inferRepositoryType(envConfig.sprintGroupRepoUrl), url: envConfig.sprintGroupRepoUrl },
    microTaskItemRepository: { repositoryType: inferRepositoryType(envConfig.microTaskItemRepoUrl), url: envConfig.microTaskItemRepoUrl },
    issueItemRepository: { repositoryType: inferRepositoryType(envConfig.issueItemRepoUrl), url: envConfig.issueItemRepoUrl },
    feedbackItemRepository: { repositoryType: inferRepositoryType(envConfig.feedbackItemRepoUrl), url: envConfig.feedbackItemRepoUrl },
    reviewRequestRepository: { repositoryType: inferRepositoryType(envConfig.reviewRequestRepoUrl), url: envConfig.reviewRequestRepoUrl },
    historyRepository: { repositoryType: inferRepositoryType(envConfig.historyRepoUrl), url: envConfig.historyRepoUrl },
    planningLineageRepository: { repositoryType: inferRepositoryType(envConfig.planningLineageRepoUrl), url: envConfig.planningLineageRepoUrl },
    sprintKanbanTaskLinkRepository: { repositoryType: inferRepositoryType(envConfig.sprintKanbanTaskRepoUrl), url: envConfig.sprintKanbanTaskRepoUrl },
    kanbanTemplateRepository: { repositoryType: inferRepositoryType(envConfig.kanbanTemplateRepoUrl), url: envConfig.kanbanTemplateRepoUrl },
    projectmanEventRepository: { repositoryType: inferRepositoryType(envConfig.projectmanEventRepoUrl), url: envConfig.projectmanEventRepoUrl },
  }
}

export type CreateProjectmanKitWithEnvOptions = {
  name?: string
  envConfig: ProjectmanKitEnvConfig
  baseContext: {
    tenantId: string
    locale?: string
    fallbackLocale?: string
    logger?: XfLogger
  }
  getCacheKey?: (context: ProjectmanKitContext) => string | null
} & Pick<ProjectmanKitProviderOptions, 'cache' | 'metrics' | 'resilience' | 'transformService' | 'resolveLogger'>

export function createProjectmanKitWithEnv(options: CreateProjectmanKitWithEnvOptions) {
  const staticConfig = buildProjectmanKitStaticConfig(options.envConfig)
  const envCfg = parseEnvConfig()

  const statsEnabled = envCfg.statsEnabled === true
  const counters = statsEnabled ? new CountersMetricsCollector() : undefined
  const loggerMetrics = statsEnabled ? new LoggerMetricsCollector(undefined) : undefined
  const metricsCollector =
    options.metrics ?? (counters && loggerMetrics ? new MultiMetricsCollector([counters, loggerMetrics]) : counters ?? loggerMetrics)

  const cacheMerged = (options.cache || envCfg.cacheGlobal)
    ? ({ ...(options.cache ?? {}), ...(envCfg.cacheGlobal ?? {}) } as ProjectmanKitProviderOptions['cache'])
    : undefined

  const resilienceMerged = (options.resilience || envCfg.resilience)
    ? ({ ...(options.resilience ?? {}), ...(envCfg.resilience ?? {}) })
    : undefined

  const kit = createProjectmanKit({
    name: options.name ?? 'projectman-kit',
    staticConfig,
    getContext: (overrides?: Partial<ProjectmanKitContext>) => ({
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
    resilience: resilienceMerged as ProjectmanKitProviderOptions['resilience'],
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
