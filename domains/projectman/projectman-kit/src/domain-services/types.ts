import type { DefaultServiceProviderOptions, RegistryStats, ServiceCacheOptions, MetricsCollector, RetryOptions, CircuitBreaker, RepositoryEndpoint } from '@aopslab/xf-dm-kits'
import type { RepositoryConfig } from '@aopslab/xf-db'
import type { XfLogger } from '@aopslab/xf-logger'
import type {
  IKanbanBoardServicePort,
  IKanbanColumnServicePort,
  IKanbanBoardColumnServicePort,
  IKanbanTaskServicePort,
  ISprintServicePort,
  ISprintGroupServicePort,
  IMicroTaskItemServicePort,
  IIssueItemServicePort,
  IFeedbackItemServicePort,
  IReviewRequestServicePort,
  IHistoryServicePort,
  IPlanningLineageServicePort,
  ISprintKanbanTaskLinkServicePort,
  IKanbanTemplateServicePort,
  IProjectmanEventServicePort,
} from '@aopslab/domain-dm-projectman/ports'
import type {
  IRepositoryPortKanbanBoard,
  IRepositoryPortKanbanColumn,
  IRepositoryPortKanbanBoardColumn,
  IRepositoryPortKanbanTask,
  IRepositoryPortSprint,
  IRepositoryPortSprintGroup,
  IRepositoryPortMicroTaskItem,
  IRepositoryPortIssueItem,
  IRepositoryPortFeedbackItem,
  IRepositoryPortReviewRequest,
  IRepositoryPortHistory,
  IRepositoryPortPlanningLineage,
  IRepositoryPortSprintKanbanTaskLink,
  IRepositoryPortKanbanTemplate,
  IRepositoryPortProjectmanEvent,
} from '@aopslab/domain-dm-projectman/repository-ports'

export interface ProjectmanKitContext {
  tenantId: string
  locale?: string
  fallbackLocale?: string
  cacheKey?: string
  logger?: XfLogger
}

export interface ProjectmanKitStaticConfig {
  logLevel?: DefaultServiceProviderOptions['logLevel']
  kanbanBoardRepository: RepositoryEndpoint
  kanbanColumnRepository: RepositoryEndpoint
  kanbanBoardColumnRepository: RepositoryEndpoint
  kanbanTaskRepository: RepositoryEndpoint
  sprintRepository: RepositoryEndpoint
  sprintGroupRepository: RepositoryEndpoint
  microTaskItemRepository: RepositoryEndpoint
  issueItemRepository: RepositoryEndpoint
  feedbackItemRepository: RepositoryEndpoint
  reviewRequestRepository: RepositoryEndpoint
  historyRepository: RepositoryEndpoint
  planningLineageRepository: RepositoryEndpoint
  sprintKanbanTaskLinkRepository: RepositoryEndpoint
  kanbanTemplateRepository: RepositoryEndpoint
  projectmanEventRepository: RepositoryEndpoint
}

export interface ProjectmanKitServiceProviderOptions extends DefaultServiceProviderOptions {
  tenantId: string
  localeOptions?: { locale?: string; fallbackLocale?: string }
  logLevel?: DefaultServiceProviderOptions['logLevel']
  kanbanBoardRepositoryConfig: RepositoryConfig
  kanbanColumnRepositoryConfig: RepositoryConfig
  kanbanBoardColumnRepositoryConfig: RepositoryConfig
  kanbanTaskRepositoryConfig: RepositoryConfig
  sprintRepositoryConfig: RepositoryConfig
  sprintGroupRepositoryConfig: RepositoryConfig
  microTaskItemRepositoryConfig: RepositoryConfig
  issueItemRepositoryConfig: RepositoryConfig
  feedbackItemRepositoryConfig: RepositoryConfig
  reviewRequestRepositoryConfig: RepositoryConfig
  historyRepositoryConfig: RepositoryConfig
  planningLineageRepositoryConfig: RepositoryConfig
  sprintKanbanTaskLinkRepositoryConfig: RepositoryConfig
  kanbanTemplateRepositoryConfig: RepositoryConfig
  projectmanEventRepositoryConfig: RepositoryConfig
}

export interface ProjectmanKitServices {
  kanbanBoardService: IKanbanBoardServicePort
  kanbanColumnService: IKanbanColumnServicePort
  kanbanBoardColumnService: IKanbanBoardColumnServicePort
  kanbanTaskService: IKanbanTaskServicePort
  sprintService: ISprintServicePort
  sprintGroupService: ISprintGroupServicePort
  microTaskItemService: IMicroTaskItemServicePort
  issueItemService: IIssueItemServicePort
  feedbackItemService: IFeedbackItemServicePort
  reviewRequestService: IReviewRequestServicePort
  historyService: IHistoryServicePort
  planningLineageService: IPlanningLineageServicePort
  sprintKanbanTaskLinkService: ISprintKanbanTaskLinkServicePort
  kanbanTemplateService: IKanbanTemplateServicePort
  projectmanEventService: IProjectmanEventServicePort
}

export interface ProjectmanKitRepositories {
  kanbanBoardRepository: IRepositoryPortKanbanBoard
  kanbanColumnRepository: IRepositoryPortKanbanColumn
  kanbanBoardColumnRepository: IRepositoryPortKanbanBoardColumn
  kanbanTaskRepository: IRepositoryPortKanbanTask
  sprintRepository: IRepositoryPortSprint
  sprintGroupRepository: IRepositoryPortSprintGroup
  microTaskItemRepository: IRepositoryPortMicroTaskItem
  issueItemRepository: IRepositoryPortIssueItem
  feedbackItemRepository: IRepositoryPortFeedbackItem
  reviewRequestRepository: IRepositoryPortReviewRequest
  historyRepository: IRepositoryPortHistory
  planningLineageRepository: IRepositoryPortPlanningLineage
  sprintKanbanTaskLinkRepository: IRepositoryPortSprintKanbanTaskLink
  kanbanTemplateRepository: IRepositoryPortKanbanTemplate
  projectmanEventRepository: IRepositoryPortProjectmanEvent
}

export type ProjectmanKitServiceKeys = Extract<keyof ProjectmanKitServices, string>

export type ProjectmanKitDomainServiceRegistryStats = RegistryStats<ProjectmanKitServiceKeys>

export interface ProjectmanKitProvider {
  getKanbanBoardService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanBoardService']>
  createKanbanBoardService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanBoardService']>
  getKanbanColumnService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanColumnService']>
  createKanbanColumnService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanColumnService']>
  getKanbanBoardColumnService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanBoardColumnService']>
  createKanbanBoardColumnService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanBoardColumnService']>
  getKanbanTaskService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanTaskService']>
  createKanbanTaskService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanTaskService']>
  getSprintService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['sprintService']>
  createSprintService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['sprintService']>
  getSprintGroupService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['sprintGroupService']>
  createSprintGroupService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['sprintGroupService']>
  getMicroTaskItemService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['microTaskItemService']>
  createMicroTaskItemService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['microTaskItemService']>
  getIssueItemService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['issueItemService']>
  createIssueItemService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['issueItemService']>
  getFeedbackItemService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['feedbackItemService']>
  createFeedbackItemService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['feedbackItemService']>
  getReviewRequestService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['reviewRequestService']>
  createReviewRequestService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['reviewRequestService']>
  getHistoryService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['historyService']>
  createHistoryService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['historyService']>
  getPlanningLineageService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['planningLineageService']>
  createPlanningLineageService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['planningLineageService']>
  getSprintKanbanTaskLinkService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['sprintKanbanTaskLinkService']>
  createSprintKanbanTaskLinkService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['sprintKanbanTaskLinkService']>
  getKanbanTemplateService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanTemplateService']>
  createKanbanTemplateService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['kanbanTemplateService']>
  getProjectmanEventService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['projectmanEventService']>
  createProjectmanEventService(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices['projectmanEventService']>
  getKanbanBoardRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['kanbanBoardRepository']>
  getKanbanColumnRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['kanbanColumnRepository']>
  getKanbanBoardColumnRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['kanbanBoardColumnRepository']>
  getKanbanTaskRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['kanbanTaskRepository']>
  getSprintRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['sprintRepository']>
  getSprintGroupRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['sprintGroupRepository']>
  getMicroTaskItemRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['microTaskItemRepository']>
  getIssueItemRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['issueItemRepository']>
  getFeedbackItemRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['feedbackItemRepository']>
  getReviewRequestRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['reviewRequestRepository']>
  getHistoryRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['historyRepository']>
  getPlanningLineageRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['planningLineageRepository']>
  getSprintKanbanTaskLinkRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['sprintKanbanTaskLinkRepository']>
  getKanbanTemplateRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['kanbanTemplateRepository']>
  getProjectmanEventRepository(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitRepositories['projectmanEventRepository']>
  getAll(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices>
  createAll(overrides?: Partial<ProjectmanKitContext>): Promise<ProjectmanKitServices>
  clearServiceCache(cacheKey?: string): void
  clearKanbanBoardServiceCache(cacheKey?: string): void
  clearKanbanColumnServiceCache(cacheKey?: string): void
  clearKanbanBoardColumnServiceCache(cacheKey?: string): void
  clearKanbanTaskServiceCache(cacheKey?: string): void
  clearSprintServiceCache(cacheKey?: string): void
  clearSprintGroupServiceCache(cacheKey?: string): void
  clearMicroTaskItemServiceCache(cacheKey?: string): void
  clearIssueItemServiceCache(cacheKey?: string): void
  clearFeedbackItemServiceCache(cacheKey?: string): void
  clearReviewRequestServiceCache(cacheKey?: string): void
  clearHistoryServiceCache(cacheKey?: string): void
  clearPlanningLineageServiceCache(cacheKey?: string): void
  clearSprintKanbanTaskLinkServiceCache(cacheKey?: string): void
  clearKanbanTemplateServiceCache(cacheKey?: string): void
  clearProjectmanEventServiceCache(cacheKey?: string): void
  reset(options?: { services?: boolean; repositories?: boolean }): void
  getRegistryStats(): ProjectmanKitDomainServiceRegistryStats
  resolveLogger(overrides?: Partial<ProjectmanKitContext>): Promise<XfLogger | undefined>
}

export interface ProjectmanKitProviderOptions {
  name?: string
  getContext: (overrides?: Partial<ProjectmanKitContext>) => Promise<ProjectmanKitContext> | ProjectmanKitContext
  staticConfig: ProjectmanKitStaticConfig
  resolveLogger?: (context: ProjectmanKitContext) => XfLogger | undefined
  getCacheKey?: (context: ProjectmanKitContext) => string | null
  cache?: Partial<Record<keyof ProjectmanKitServices, ServiceCacheOptions>> & ServiceCacheOptions
  metrics?: MetricsCollector
  resilience?: {
    services?: { retry?: RetryOptions; timeoutMs?: number; breaker?: CircuitBreaker }
    repositories?: { retry?: RetryOptions; timeoutMs?: number; breaker?: CircuitBreaker }
  }
  transformService?: (
    name: keyof ProjectmanKitServices,
    instance: ProjectmanKitServices[keyof ProjectmanKitServices]
  ) => ProjectmanKitServices[keyof ProjectmanKitServices]
  hooks?: Record<string, unknown>
}
