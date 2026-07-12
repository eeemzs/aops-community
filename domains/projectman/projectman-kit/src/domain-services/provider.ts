import { Effect } from 'effect'

import { createProvider, cacheKeyFromLocale, fingerprintRepositoryConfig, buildRepositoryConfig } from '@aopslab/xf-dm-kits'
import type { XfLogger } from '@aopslab/xf-logger'

import type { ProjectmanKitProviderOptions, ProjectmanKitProvider, ProjectmanKitContext, ProjectmanKitStaticConfig, ProjectmanKitServiceProviderOptions, ProjectmanKitServices, ProjectmanKitRepositories, ProjectmanKitDomainServiceRegistryStats } from './types.js'

import {
  RepositoryFactoryKanbanBoard,
  RepositoryFactoryKanbanColumn,
  RepositoryFactoryKanbanBoardColumn,
  RepositoryFactoryKanbanTask,
  RepositoryFactorySprint,
  RepositoryFactorySprintGroup,
  RepositoryFactoryMicroTaskItem,
  RepositoryFactoryIssueItem,
  RepositoryFactoryFeedbackItem,
  RepositoryFactoryReviewRequest,
  RepositoryFactoryHistory,
  RepositoryFactoryPlanningLineage,
  ServiceFactoryPlanningLineage,
  RepositoryFactorySprintKanbanTaskLink,
  RepositoryFactoryKanbanTemplate,
  RepositoryFactoryProjectmanEvent,
} from '@aopslab/domain-dm-projectman/factories'
import {
  KanbanBoardService,
  KanbanColumnService,
  KanbanBoardColumnService,
  KanbanTaskService,
  SprintService,
  SprintGroupService,
  MicroTaskItemService,
  IssueItemService,
  FeedbackItemService,
  ReviewRequestService,
  HistoryService,
  SprintKanbanTaskLinkService,
  KanbanTemplateService,
  ProjectmanEventService,
} from '@aopslab/domain-dm-projectman/services'

function computeConfigKey(name: string, cfg: ProjectmanKitServiceProviderOptions): string {
  const sigs = [
    fingerprintRepositoryConfig(cfg.kanbanBoardRepositoryConfig),
    fingerprintRepositoryConfig(cfg.kanbanColumnRepositoryConfig),
    fingerprintRepositoryConfig(cfg.kanbanBoardColumnRepositoryConfig),
    fingerprintRepositoryConfig(cfg.kanbanTaskRepositoryConfig),
    fingerprintRepositoryConfig(cfg.sprintRepositoryConfig),
    fingerprintRepositoryConfig(cfg.sprintGroupRepositoryConfig),
    fingerprintRepositoryConfig(cfg.microTaskItemRepositoryConfig),
    fingerprintRepositoryConfig(cfg.issueItemRepositoryConfig),
    fingerprintRepositoryConfig(cfg.feedbackItemRepositoryConfig),
    fingerprintRepositoryConfig(cfg.reviewRequestRepositoryConfig),
    fingerprintRepositoryConfig(cfg.historyRepositoryConfig),
    fingerprintRepositoryConfig(cfg.planningLineageRepositoryConfig),
    fingerprintRepositoryConfig(cfg.sprintKanbanTaskLinkRepositoryConfig),
    fingerprintRepositoryConfig(cfg.kanbanTemplateRepositoryConfig),
    fingerprintRepositoryConfig(cfg.projectmanEventRepositoryConfig),
  ].filter(Boolean)
  return [name, cfg.tenantId ?? '', ...sigs].join('|')
}

function buildResolvedConfig(staticCfg: ProjectmanKitStaticConfig, ctx: ProjectmanKitContext): ProjectmanKitServiceProviderOptions {
  const tenantId = ctx.tenantId

  return {
    tenantId,
    logLevel: staticCfg.logLevel,
    localeOptions: { locale: ctx.locale, fallbackLocale: ctx.fallbackLocale },
    kanbanBoardRepositoryConfig: buildRepositoryConfig(staticCfg.kanbanBoardRepository, tenantId),
    kanbanColumnRepositoryConfig: buildRepositoryConfig(staticCfg.kanbanColumnRepository, tenantId),
    kanbanBoardColumnRepositoryConfig: buildRepositoryConfig(staticCfg.kanbanBoardColumnRepository, tenantId),
    kanbanTaskRepositoryConfig: buildRepositoryConfig(staticCfg.kanbanTaskRepository, tenantId),
    sprintRepositoryConfig: buildRepositoryConfig(staticCfg.sprintRepository, tenantId),
    sprintGroupRepositoryConfig: buildRepositoryConfig(staticCfg.sprintGroupRepository, tenantId),
    microTaskItemRepositoryConfig: buildRepositoryConfig(staticCfg.microTaskItemRepository, tenantId),
    issueItemRepositoryConfig: buildRepositoryConfig(staticCfg.issueItemRepository, tenantId),
    feedbackItemRepositoryConfig: buildRepositoryConfig(staticCfg.feedbackItemRepository, tenantId),
    reviewRequestRepositoryConfig: buildRepositoryConfig(staticCfg.reviewRequestRepository, tenantId),
    historyRepositoryConfig: buildRepositoryConfig(staticCfg.historyRepository, tenantId),
    planningLineageRepositoryConfig: buildRepositoryConfig(staticCfg.planningLineageRepository, tenantId),
    sprintKanbanTaskLinkRepositoryConfig: buildRepositoryConfig(staticCfg.sprintKanbanTaskLinkRepository, tenantId),
    kanbanTemplateRepositoryConfig: buildRepositoryConfig(staticCfg.kanbanTemplateRepository, tenantId),
    projectmanEventRepositoryConfig: buildRepositoryConfig(staticCfg.projectmanEventRepository, tenantId),
  }
}

export function createProjectmanKitProvider(options: ProjectmanKitProviderOptions): ProjectmanKitProvider {
  const name = options.name ?? 'projectman-kit'

  function defaultCacheKey(context: ProjectmanKitContext): string | null {
    if (typeof context.cacheKey === 'string' && context.cacheKey.length > 0) return context.cacheKey
    return cacheKeyFromLocale(context.locale, context.fallbackLocale)
  }

  const gp = createProvider<
    ProjectmanKitContext,
    ProjectmanKitServiceProviderOptions,
    XfLogger | undefined,
    ProjectmanKitServices,
    ProjectmanKitRepositories
  >({
    name: `projectman-kit::provider::${name}`,
    getContext: options.getContext,
    getCacheKey: (ctx) => options.getCacheKey?.(ctx) ?? defaultCacheKey(ctx),
    resolveLogger: options.resolveLogger,
    resolveConfig: (ctx) => buildResolvedConfig(options.staticConfig, ctx),
    computeConfigKey: (cfg) => computeConfigKey(name, cfg),
    repositories: {
      kanbanBoardRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryKanbanBoard.create({
          repositoryConfig: cfg.kanbanBoardRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      kanbanColumnRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryKanbanColumn.create({
          repositoryConfig: cfg.kanbanColumnRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      kanbanBoardColumnRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryKanbanBoardColumn.create({
          repositoryConfig: cfg.kanbanBoardColumnRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      kanbanTaskRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryKanbanTask.create({
          repositoryConfig: cfg.kanbanTaskRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      sprintRepository: async (cfg, logger) => {
        const eff = RepositoryFactorySprint.create({
          repositoryConfig: cfg.sprintRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      sprintGroupRepository: async (cfg, logger) => {
        const eff = RepositoryFactorySprintGroup.create({
          repositoryConfig: cfg.sprintGroupRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      microTaskItemRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryMicroTaskItem.create({
          repositoryConfig: cfg.microTaskItemRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      issueItemRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryIssueItem.create({
          repositoryConfig: cfg.issueItemRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      feedbackItemRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryFeedbackItem.create({
          repositoryConfig: cfg.feedbackItemRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      reviewRequestRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryReviewRequest.create({
          repositoryConfig: cfg.reviewRequestRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      historyRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryHistory.create({
          repositoryConfig: cfg.historyRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      planningLineageRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryPlanningLineage.create({
          repositoryConfig: cfg.planningLineageRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      sprintKanbanTaskLinkRepository: async (cfg, logger) => {
        const eff = RepositoryFactorySprintKanbanTaskLink.create({
          repositoryConfig: cfg.sprintKanbanTaskLinkRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      kanbanTemplateRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryKanbanTemplate.create({
          repositoryConfig: cfg.kanbanTemplateRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
      projectmanEventRepository: async (cfg, logger) => {
        const eff = RepositoryFactoryProjectmanEvent.create({
          repositoryConfig: cfg.projectmanEventRepositoryConfig,
          logger,
          logLevel: cfg.logLevel,
        })
        return await Effect.runPromise(eff)
      },
    },
    services: {
      kanbanBoardService: async (ctx, _deps, repos, logger) => {
        return new KanbanBoardService({
          kanbanBoardRepository: repos.kanbanBoardRepository,
          logger,
          locale: ctx.locale,
        })
      },
      kanbanColumnService: async (ctx, _deps, repos, logger) => {
        return new KanbanColumnService({
          kanbanColumnRepository: repos.kanbanColumnRepository,
          logger,
          locale: ctx.locale,
        })
      },
      kanbanBoardColumnService: async (ctx, _deps, repos, logger) => {
        return new KanbanBoardColumnService({
          kanbanBoardColumnRepository: repos.kanbanBoardColumnRepository,
          logger,
          locale: ctx.locale,
        })
      },
      kanbanTaskService: async (ctx, _deps, repos, logger) => {
        return new KanbanTaskService({
          kanbanBoardColumnRepository: repos.kanbanBoardColumnRepository,
          kanbanBoardRepository: repos.kanbanBoardRepository,
          sprintRepository: repos.sprintRepository,
          kanbanTaskRepository: repos.kanbanTaskRepository,
          eventRepository: repos.projectmanEventRepository,
          logger,
          locale: ctx.locale,
        })
      },
      sprintService: async (ctx, _deps, repos, logger) => {
        return new SprintService({
          sprintRepository: repos.sprintRepository,
          sprintGroupRepository: repos.sprintGroupRepository,
          microTaskItemRepository: repos.microTaskItemRepository,
          issueItemRepository: repos.issueItemRepository,
          feedbackItemRepository: repos.feedbackItemRepository,
          eventRepository: repos.projectmanEventRepository,
          serviceDependencies: {
            microTaskItemService: _deps.microTaskItemService,
            kanbanTaskService: _deps.kanbanTaskService,
            planningLineageService: _deps.planningLineageService,
            sprintKanbanTaskLinkService: _deps.sprintKanbanTaskLinkService,
          },
          logger,
          locale: ctx.locale,
        })
      },
      sprintGroupService: async (ctx, _deps, repos, logger) => {
        return new SprintGroupService({
          sprintGroupRepository: repos.sprintGroupRepository,
          eventRepository: repos.projectmanEventRepository,
          serviceDependencies: {
            microTaskItemService: _deps.microTaskItemService,
            sprintService: _deps.sprintService,
          },
          logger,
          locale: ctx.locale,
        })
      },
      microTaskItemService: async (ctx, _deps, repos, logger) => {
        return new MicroTaskItemService({
          microTaskItemRepository: repos.microTaskItemRepository,
          kanbanTaskRepository: repos.kanbanTaskRepository,
          sprintRepository: repos.sprintRepository,
          sprintGroupRepository: repos.sprintGroupRepository,
          issueItemRepository: repos.issueItemRepository,
          feedbackItemRepository: repos.feedbackItemRepository,
          eventRepository: repos.projectmanEventRepository,
          serviceDependencies: {
            planningLineageService: _deps.planningLineageService,
          },
          logger,
          locale: ctx.locale,
        })
      },
      issueItemService: async (ctx, _deps, repos, logger) => {
        return new IssueItemService({
          issueItemRepository: repos.issueItemRepository,
          logger,
          locale: ctx.locale,
        })
      },
      feedbackItemService: async (ctx, _deps, repos, logger) => {
        return new FeedbackItemService({
          feedbackItemRepository: repos.feedbackItemRepository,
          logger,
          locale: ctx.locale,
        })
      },
      reviewRequestService: async (ctx, _deps, repos, logger) => {
        return new ReviewRequestService({
          reviewRequestRepository: repos.reviewRequestRepository,
          logger,
          locale: ctx.locale,
        })
      },
      historyService: async (ctx, _deps, repos, logger) => {
        return new HistoryService({
          historyRepository: repos.historyRepository,
          logger,
          locale: ctx.locale,
        })
      },
      planningLineageService: async (ctx, _deps, repos, logger) => {
        return await Effect.runPromise(
          ServiceFactoryPlanningLineage
            .builder()
            .withConfig({
              logger,
            })
            .withOverrides({
              planningLineageRepository: repos.planningLineageRepository,
            })
            .build()
        )
      },
      sprintKanbanTaskLinkService: async (ctx, _deps, repos, logger) => {
        return new SprintKanbanTaskLinkService({
          sprintKanbanTaskLinkRepository: repos.sprintKanbanTaskLinkRepository,
          eventRepository: repos.projectmanEventRepository,
          logger,
          locale: ctx.locale,
        })
      },
      kanbanTemplateService: async (ctx, _deps, repos, logger) => {
        return new KanbanTemplateService({
          kanbanTemplateRepository: repos.kanbanTemplateRepository,
          logger,
          locale: ctx.locale,
        })
      },
      projectmanEventService: async (ctx, _deps, repos, logger) => {
        return new ProjectmanEventService({
          projectmanEventRepository: repos.projectmanEventRepository,
          logger,
          locale: ctx.locale,
        })
      },
    },
    dependencies: {
      kanbanTaskService: ['planningLineageService'],
      microTaskItemService: ['planningLineageService'],
      sprintService: ['microTaskItemService', 'kanbanTaskService', 'planningLineageService', 'sprintKanbanTaskLinkService'],
      sprintGroupService: ['microTaskItemService', 'sprintService'],
    },
    cache: options.cache,
    metrics: options.metrics,
    resilience: options.resilience,
    transformService: options.transformService,
  })

  function toStats(): ProjectmanKitDomainServiceRegistryStats {
    const stats = gp.getStats()
    return {
      name: stats.name,
      configKey: stats.configKey,
      services: {
        kanbanBoardService: stats.services.kanbanBoardService,
        kanbanColumnService: stats.services.kanbanColumnService,
        kanbanBoardColumnService: stats.services.kanbanBoardColumnService,
        kanbanTaskService: stats.services.kanbanTaskService,
        sprintService: stats.services.sprintService,
        sprintGroupService: stats.services.sprintGroupService,
        microTaskItemService: stats.services.microTaskItemService,
        issueItemService: stats.services.issueItemService,
        feedbackItemService: stats.services.feedbackItemService,
        reviewRequestService: stats.services.reviewRequestService,
        historyService: stats.services.historyService,
        planningLineageService: stats.services.planningLineageService,
        sprintKanbanTaskLinkService: stats.services.sprintKanbanTaskLinkService,
        kanbanTemplateService: stats.services.kanbanTemplateService,
        projectmanEventService: stats.services.projectmanEventService,
      },
      repositories: {
        kanbanBoardRepository: !!stats.repositories.kanbanBoardRepository,
        kanbanColumnRepository: !!stats.repositories.kanbanColumnRepository,
        kanbanBoardColumnRepository: !!stats.repositories.kanbanBoardColumnRepository,
        kanbanTaskRepository: !!stats.repositories.kanbanTaskRepository,
        sprintRepository: !!stats.repositories.sprintRepository,
        sprintGroupRepository: !!stats.repositories.sprintGroupRepository,
        microTaskItemRepository: !!stats.repositories.microTaskItemRepository,
        issueItemRepository: !!stats.repositories.issueItemRepository,
        feedbackItemRepository: !!stats.repositories.feedbackItemRepository,
        reviewRequestRepository: !!stats.repositories.reviewRequestRepository,
        historyRepository: !!stats.repositories.historyRepository,
        planningLineageRepository: !!stats.repositories.planningLineageRepository,
        sprintKanbanTaskLinkRepository: !!stats.repositories.sprintKanbanTaskLinkRepository,
        kanbanTemplateRepository: !!stats.repositories.kanbanTemplateRepository,
        projectmanEventRepository: !!stats.repositories.projectmanEventRepository,
      },
    }
  }

  return {
    async getKanbanBoardService(overrides) {
      return gp.getService('kanbanBoardService', overrides)
    },
    async createKanbanBoardService(overrides) {
      return gp.createService('kanbanBoardService', overrides)
    },
    async getKanbanColumnService(overrides) {
      return gp.getService('kanbanColumnService', overrides)
    },
    async createKanbanColumnService(overrides) {
      return gp.createService('kanbanColumnService', overrides)
    },
    async getKanbanBoardColumnService(overrides) {
      return gp.getService('kanbanBoardColumnService', overrides)
    },
    async createKanbanBoardColumnService(overrides) {
      return gp.createService('kanbanBoardColumnService', overrides)
    },
    async getKanbanTaskService(overrides) {
      return gp.getService('kanbanTaskService', overrides)
    },
    async createKanbanTaskService(overrides) {
      return gp.createService('kanbanTaskService', overrides)
    },
    async getSprintService(overrides) {
      return gp.getService('sprintService', overrides)
    },
    async createSprintService(overrides) {
      return gp.createService('sprintService', overrides)
    },
    async getSprintGroupService(overrides) {
      return gp.getService('sprintGroupService', overrides)
    },
    async createSprintGroupService(overrides) {
      return gp.createService('sprintGroupService', overrides)
    },
    async getMicroTaskItemService(overrides) {
      return gp.getService('microTaskItemService', overrides)
    },
    async createMicroTaskItemService(overrides) {
      return gp.createService('microTaskItemService', overrides)
    },
    async getIssueItemService(overrides) {
      return gp.getService('issueItemService', overrides)
    },
    async createIssueItemService(overrides) {
      return gp.createService('issueItemService', overrides)
    },
    async getFeedbackItemService(overrides) {
      return gp.getService('feedbackItemService', overrides)
    },
    async createFeedbackItemService(overrides) {
      return gp.createService('feedbackItemService', overrides)
    },
    async getReviewRequestService(overrides) {
      return gp.getService('reviewRequestService', overrides)
    },
    async createReviewRequestService(overrides) {
      return gp.createService('reviewRequestService', overrides)
    },
    async getHistoryService(overrides) {
      return gp.getService('historyService', overrides)
    },
    async createHistoryService(overrides) {
      return gp.createService('historyService', overrides)
    },
    async getPlanningLineageService(overrides) {
      return gp.getService('planningLineageService', overrides)
    },
    async createPlanningLineageService(overrides) {
      return gp.createService('planningLineageService', overrides)
    },
    async getSprintKanbanTaskLinkService(overrides) {
      return gp.getService('sprintKanbanTaskLinkService', overrides)
    },
    async createSprintKanbanTaskLinkService(overrides) {
      return gp.createService('sprintKanbanTaskLinkService', overrides)
    },
    async getKanbanTemplateService(overrides) {
      return gp.getService('kanbanTemplateService', overrides)
    },
    async createKanbanTemplateService(overrides) {
      return gp.createService('kanbanTemplateService', overrides)
    },
    async getProjectmanEventService(overrides) {
      return gp.getService('projectmanEventService', overrides)
    },
    async createProjectmanEventService(overrides) {
      return gp.createService('projectmanEventService', overrides)
    },
    async getKanbanBoardRepository(overrides) {
      return gp.getRepository('kanbanBoardRepository', overrides)
    },
    async getKanbanColumnRepository(overrides) {
      return gp.getRepository('kanbanColumnRepository', overrides)
    },
    async getKanbanBoardColumnRepository(overrides) {
      return gp.getRepository('kanbanBoardColumnRepository', overrides)
    },
    async getKanbanTaskRepository(overrides) {
      return gp.getRepository('kanbanTaskRepository', overrides)
    },
    async getSprintRepository(overrides) {
      return gp.getRepository('sprintRepository', overrides)
    },
    async getSprintGroupRepository(overrides) {
      return gp.getRepository('sprintGroupRepository', overrides)
    },
    async getMicroTaskItemRepository(overrides) {
      return gp.getRepository('microTaskItemRepository', overrides)
    },
    async getIssueItemRepository(overrides) {
      return gp.getRepository('issueItemRepository', overrides)
    },
    async getFeedbackItemRepository(overrides) {
      return gp.getRepository('feedbackItemRepository', overrides)
    },
    async getReviewRequestRepository(overrides) {
      return gp.getRepository('reviewRequestRepository', overrides)
    },
    async getHistoryRepository(overrides) {
      return gp.getRepository('historyRepository', overrides)
    },
    async getPlanningLineageRepository(overrides) {
      return gp.getRepository('planningLineageRepository', overrides)
    },
    async getSprintKanbanTaskLinkRepository(overrides) {
      return gp.getRepository('sprintKanbanTaskLinkRepository', overrides)
    },
    async getKanbanTemplateRepository(overrides) {
      return gp.getRepository('kanbanTemplateRepository', overrides)
    },
    async getProjectmanEventRepository(overrides) {
      return gp.getRepository('projectmanEventRepository', overrides)
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
    clearKanbanBoardServiceCache(cacheKey?: string) {
      gp.clearServiceCache('kanbanBoardService', cacheKey)
    },
    clearKanbanColumnServiceCache(cacheKey?: string) {
      gp.clearServiceCache('kanbanColumnService', cacheKey)
    },
    clearKanbanBoardColumnServiceCache(cacheKey?: string) {
      gp.clearServiceCache('kanbanBoardColumnService', cacheKey)
    },
    clearKanbanTaskServiceCache(cacheKey?: string) {
      gp.clearServiceCache('kanbanTaskService', cacheKey)
    },
    clearSprintServiceCache(cacheKey?: string) {
      gp.clearServiceCache('sprintService', cacheKey)
    },
    clearSprintGroupServiceCache(cacheKey?: string) {
      gp.clearServiceCache('sprintGroupService', cacheKey)
    },
    clearMicroTaskItemServiceCache(cacheKey?: string) {
      gp.clearServiceCache('microTaskItemService', cacheKey)
    },
    clearIssueItemServiceCache(cacheKey?: string) {
      gp.clearServiceCache('issueItemService', cacheKey)
    },
    clearFeedbackItemServiceCache(cacheKey?: string) {
      gp.clearServiceCache('feedbackItemService', cacheKey)
    },
    clearReviewRequestServiceCache(cacheKey?: string) {
      gp.clearServiceCache('reviewRequestService', cacheKey)
    },
    clearHistoryServiceCache(cacheKey?: string) {
      gp.clearServiceCache('historyService', cacheKey)
    },
    clearPlanningLineageServiceCache(cacheKey?: string) {
      gp.clearServiceCache('planningLineageService', cacheKey)
    },
    clearSprintKanbanTaskLinkServiceCache(cacheKey?: string) {
      gp.clearServiceCache('sprintKanbanTaskLinkService', cacheKey)
    },
    clearKanbanTemplateServiceCache(cacheKey?: string) {
      gp.clearServiceCache('kanbanTemplateService', cacheKey)
    },
    clearProjectmanEventServiceCache(cacheKey?: string) {
      gp.clearServiceCache('projectmanEventService', cacheKey)
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
