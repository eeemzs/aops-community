import type { DefaultServiceProviderOptions, RegistryStats, ServiceCacheOptions, MetricsCollector, RetryOptions, CircuitBreaker, RepositoryEndpoint } from '@aopslab/xf-dm-kits'
import type { RepositoryConfig } from '@aopslab/xf-db'
import type { XfLogger } from '@aopslab/xf-logger'
import type { IAgentProfileServicePort, IProjectServicePort, IProjectPathServicePort, IPromptServicePort, IPromptVersionServicePort, IResourceServicePort, ISkillServicePort, ISkillVersionServicePort, IKanbanBoardServicePort, IKanbanColumnServicePort, ISprintServicePort, ISprintItemServicePort, ITaskServicePort, ITaskCommentServicePort, IAgentSessionServicePort, IAgentRunServicePort, IAgentRunEventServicePort, IActivityItemServicePort, IArtifactServicePort, IArtifactLinkServicePort, ICodexChatMessageServicePort, ICodexChatSettingServicePort, ICodexChatThreadServicePort, IChatServicePort, IDiscussionServicePort, IExperienceItemServicePort, IMemoryItemServicePort, IMissionServicePort, ITagServicePort, IWorkflowDefinitionServicePort, IWorkflowInstanceServicePort, IWorkflowStepRunServicePort, IProjectMemberServicePort } from '@aopslab/domain-dm-agentspace/ports'
import type { IRepositoryPortAgentProfile, IRepositoryPortProject, IRepositoryPortProjectPath, IRepositoryPortPrompt, IRepositoryPortPromptVersion, IRepositoryPortResource, IRepositoryPortScope, IRepositoryPortSkill, IRepositoryPortSkillVersion, IRepositoryPortKanbanBoard, IRepositoryPortKanbanColumn, IRepositoryPortSprint, IRepositoryPortSprintItem, IRepositoryPortTask, IRepositoryPortTaskChecklistItem, IRepositoryPortTaskComment, IRepositoryPortTaskLabel, IRepositoryPortTaskLabelLink, IRepositoryPortTaskRelation, IRepositoryPortAgentSession, IRepositoryPortAgentRun, IRepositoryPortAgentRunEvent, IRepositoryPortActivityItem, IRepositoryPortArtifact, IRepositoryPortArtifactLink, IRepositoryPortCodexChatMessage, IRepositoryPortCodexChatSetting, IRepositoryPortCodexChatThread, IRepositoryPortChatMessage, IRepositoryPortChatRoom, IRepositoryPortChatRoomBinding, IRepositoryPortChatRoomMember, IRepositoryPortDiscussionTopic, IRepositoryPortDiscussionTurn, IRepositoryPortDiscussionOutput, IRepositoryPortExperienceItem, IRepositoryPortMemoryItem, IRepositoryPortMission, IRepositoryPortTag, IRepositoryPortWorkflowDefinition, IRepositoryPortWorkflowInstance, IRepositoryPortWorkflowStepRun, IRepositoryPortProjectMember } from '@aopslab/domain-dm-agentspace/repository-ports'

export interface AgentspaceKitContext {
  tenantId: string
  locale?: string
  fallbackLocale?: string
  cacheKey?: string
  logger?: XfLogger
}

export interface AgentspaceKitStaticConfig {
  logLevel?: DefaultServiceProviderOptions['logLevel']
  agentProfileRepository: RepositoryEndpoint
  projectRepository: RepositoryEndpoint
  projectPathRepository: RepositoryEndpoint
  scopeRepository: RepositoryEndpoint
  projectMemberRepository: RepositoryEndpoint
  promptRepository: RepositoryEndpoint
  promptVersionRepository: RepositoryEndpoint
  resourceRepository: RepositoryEndpoint
  skillRepository: RepositoryEndpoint
  skillVersionRepository: RepositoryEndpoint
  kanbanBoardRepository: RepositoryEndpoint
  kanbanColumnRepository: RepositoryEndpoint
  sprintRepository: RepositoryEndpoint
  sprintItemRepository: RepositoryEndpoint
  taskRepository: RepositoryEndpoint
  taskChecklistItemRepository: RepositoryEndpoint
  taskCommentRepository: RepositoryEndpoint
  taskLabelRepository: RepositoryEndpoint
  taskLabelLinkRepository: RepositoryEndpoint
  taskRelationRepository: RepositoryEndpoint
  agentSessionRepository: RepositoryEndpoint
  agentRunRepository: RepositoryEndpoint
  agentRunEventRepository: RepositoryEndpoint
  activityItemRepository: RepositoryEndpoint
  artifactRepository: RepositoryEndpoint
  artifactLinkRepository: RepositoryEndpoint
  codexChatThreadRepository: RepositoryEndpoint
  codexChatMessageRepository: RepositoryEndpoint
  codexChatSettingRepository: RepositoryEndpoint
  chatRoomRepository: RepositoryEndpoint
  chatRoomMemberRepository: RepositoryEndpoint
  chatRoomBindingRepository: RepositoryEndpoint
  chatMessageRepository: RepositoryEndpoint
  discussionTopicRepository: RepositoryEndpoint
  discussionTurnRepository: RepositoryEndpoint
  discussionOutputRepository: RepositoryEndpoint
  experienceItemRepository: RepositoryEndpoint
  memoryItemRepository: RepositoryEndpoint
  missionRepository: RepositoryEndpoint
  tagRepository: RepositoryEndpoint
  workflowDefinitionRepository: RepositoryEndpoint
  workflowInstanceRepository: RepositoryEndpoint
  workflowStepRunRepository: RepositoryEndpoint
}

export interface AgentspaceKitServiceProviderOptions extends DefaultServiceProviderOptions {
  tenantId: string
  localeOptions?: { locale?: string; fallbackLocale?: string }
  logLevel?: DefaultServiceProviderOptions['logLevel']
  agentProfileRepositoryConfig: RepositoryConfig
  projectRepositoryConfig: RepositoryConfig
  projectPathRepositoryConfig: RepositoryConfig
  scopeRepositoryConfig: RepositoryConfig
  projectMemberRepositoryConfig: RepositoryConfig
  promptRepositoryConfig: RepositoryConfig
  promptVersionRepositoryConfig: RepositoryConfig
  resourceRepositoryConfig: RepositoryConfig
  skillRepositoryConfig: RepositoryConfig
  skillVersionRepositoryConfig: RepositoryConfig
  kanbanBoardRepositoryConfig: RepositoryConfig
  kanbanColumnRepositoryConfig: RepositoryConfig
  sprintRepositoryConfig: RepositoryConfig
  sprintItemRepositoryConfig: RepositoryConfig
  taskRepositoryConfig: RepositoryConfig
  taskChecklistItemRepositoryConfig: RepositoryConfig
  taskCommentRepositoryConfig: RepositoryConfig
  taskLabelRepositoryConfig: RepositoryConfig
  taskLabelLinkRepositoryConfig: RepositoryConfig
  taskRelationRepositoryConfig: RepositoryConfig
  agentSessionRepositoryConfig: RepositoryConfig
  agentRunRepositoryConfig: RepositoryConfig
  agentRunEventRepositoryConfig: RepositoryConfig
  activityItemRepositoryConfig: RepositoryConfig
  artifactRepositoryConfig: RepositoryConfig
  artifactLinkRepositoryConfig: RepositoryConfig
  codexChatThreadRepositoryConfig: RepositoryConfig
  codexChatMessageRepositoryConfig: RepositoryConfig
  codexChatSettingRepositoryConfig: RepositoryConfig
  chatRoomRepositoryConfig: RepositoryConfig
  chatRoomMemberRepositoryConfig: RepositoryConfig
  chatRoomBindingRepositoryConfig: RepositoryConfig
  chatMessageRepositoryConfig: RepositoryConfig
  discussionTopicRepositoryConfig: RepositoryConfig
  discussionTurnRepositoryConfig: RepositoryConfig
  discussionOutputRepositoryConfig: RepositoryConfig
  experienceItemRepositoryConfig: RepositoryConfig
  memoryItemRepositoryConfig: RepositoryConfig
  missionRepositoryConfig: RepositoryConfig
  tagRepositoryConfig: RepositoryConfig
  workflowDefinitionRepositoryConfig: RepositoryConfig
  workflowInstanceRepositoryConfig: RepositoryConfig
  workflowStepRunRepositoryConfig: RepositoryConfig
}

export interface AgentspaceKitServices {
  agentProfileService: IAgentProfileServicePort
  projectService: IProjectServicePort
  projectPathService: IProjectPathServicePort
  projectMemberService: IProjectMemberServicePort
  promptService: IPromptServicePort
  promptVersionService: IPromptVersionServicePort
  resourceService: IResourceServicePort
  skillService: ISkillServicePort
  skillVersionService: ISkillVersionServicePort
  kanbanBoardService: IKanbanBoardServicePort
  kanbanColumnService: IKanbanColumnServicePort
  sprintService: ISprintServicePort
  sprintItemService: ISprintItemServicePort
  taskService: ITaskServicePort
  taskCommentService: ITaskCommentServicePort
  agentSessionService: IAgentSessionServicePort
  agentRunService: IAgentRunServicePort
  agentRunEventService: IAgentRunEventServicePort
  activityItemService: IActivityItemServicePort
  artifactService: IArtifactServicePort
  artifactLinkService: IArtifactLinkServicePort
  codexChatThreadService: ICodexChatThreadServicePort
  codexChatMessageService: ICodexChatMessageServicePort
  codexChatSettingService: ICodexChatSettingServicePort
  chatService: IChatServicePort
  discussionService: IDiscussionServicePort
  experienceItemService: IExperienceItemServicePort
  memoryItemService: IMemoryItemServicePort
  missionService: IMissionServicePort
  tagService: ITagServicePort
  workflowDefinitionService: IWorkflowDefinitionServicePort
  workflowInstanceService: IWorkflowInstanceServicePort
  workflowStepRunService: IWorkflowStepRunServicePort
}

export interface AgentspaceKitRepositories {
  agentProfileRepository: IRepositoryPortAgentProfile
  projectRepository: IRepositoryPortProject
  projectPathRepository: IRepositoryPortProjectPath
  scopeRepository: IRepositoryPortScope
  projectMemberRepository: IRepositoryPortProjectMember
  promptRepository: IRepositoryPortPrompt
  promptVersionRepository: IRepositoryPortPromptVersion
  resourceRepository: IRepositoryPortResource
  skillRepository: IRepositoryPortSkill
  skillVersionRepository: IRepositoryPortSkillVersion
  kanbanBoardRepository: IRepositoryPortKanbanBoard
  kanbanColumnRepository: IRepositoryPortKanbanColumn
  sprintRepository: IRepositoryPortSprint
  sprintItemRepository: IRepositoryPortSprintItem
  taskRepository: IRepositoryPortTask
  taskChecklistItemRepository: IRepositoryPortTaskChecklistItem
  taskCommentRepository: IRepositoryPortTaskComment
  taskLabelRepository: IRepositoryPortTaskLabel
  taskLabelLinkRepository: IRepositoryPortTaskLabelLink
  taskRelationRepository: IRepositoryPortTaskRelation
  agentSessionRepository: IRepositoryPortAgentSession
  agentRunRepository: IRepositoryPortAgentRun
  agentRunEventRepository: IRepositoryPortAgentRunEvent
  activityItemRepository: IRepositoryPortActivityItem
  artifactRepository: IRepositoryPortArtifact
  artifactLinkRepository: IRepositoryPortArtifactLink
  codexChatThreadRepository: IRepositoryPortCodexChatThread
  codexChatMessageRepository: IRepositoryPortCodexChatMessage
  codexChatSettingRepository: IRepositoryPortCodexChatSetting
  chatRoomRepository: IRepositoryPortChatRoom
  chatRoomMemberRepository: IRepositoryPortChatRoomMember
  chatRoomBindingRepository: IRepositoryPortChatRoomBinding
  chatMessageRepository: IRepositoryPortChatMessage
  discussionTopicRepository: IRepositoryPortDiscussionTopic
  discussionTurnRepository: IRepositoryPortDiscussionTurn
  discussionOutputRepository: IRepositoryPortDiscussionOutput
  experienceItemRepository: IRepositoryPortExperienceItem
  memoryItemRepository: IRepositoryPortMemoryItem
  missionRepository: IRepositoryPortMission
  tagRepository: IRepositoryPortTag
  workflowDefinitionRepository: IRepositoryPortWorkflowDefinition
  workflowInstanceRepository: IRepositoryPortWorkflowInstance
  workflowStepRunRepository: IRepositoryPortWorkflowStepRun
}

export type AgentspaceKitServiceKeys = Extract<keyof AgentspaceKitServices, string>

export type AgentspaceKitDomainServiceRegistryStats = RegistryStats<AgentspaceKitServiceKeys>

export interface AgentspaceKitProvider {
  getAgentProfileService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['agentProfileService']>
  createAgentProfileService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['agentProfileService']>
  getProjectService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['projectService']>
  createProjectService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['projectService']>
  getProjectPathService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['projectPathService']>
  createProjectPathService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['projectPathService']>
  getProjectMemberService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['projectMemberService']>
  createProjectMemberService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['projectMemberService']>
  getPromptService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['promptService']>
  createPromptService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['promptService']>
  getPromptVersionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['promptVersionService']>
  createPromptVersionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['promptVersionService']>
  getResourceService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['resourceService']>
  createResourceService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['resourceService']>
  getSkillService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['skillService']>
  createSkillService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['skillService']>
  getSkillVersionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['skillVersionService']>
  createSkillVersionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['skillVersionService']>
  getKanbanBoardService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['kanbanBoardService']>
  createKanbanBoardService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['kanbanBoardService']>
  getKanbanColumnService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['kanbanColumnService']>
  createKanbanColumnService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['kanbanColumnService']>
  getSprintService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['sprintService']>
  createSprintService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['sprintService']>
  getSprintItemService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['sprintItemService']>
  createSprintItemService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['sprintItemService']>
  getTaskService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['taskService']>
  createTaskService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['taskService']>
  getTaskCommentService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['taskCommentService']>
  createTaskCommentService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['taskCommentService']>
  getAgentSessionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['agentSessionService']>
  createAgentSessionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['agentSessionService']>
  getAgentRunService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['agentRunService']>
  createAgentRunService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['agentRunService']>
  getAgentRunEventService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['agentRunEventService']>
  createAgentRunEventService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['agentRunEventService']>
  getActivityItemService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['activityItemService']>
  createActivityItemService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['activityItemService']>
  getArtifactService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['artifactService']>
  createArtifactService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['artifactService']>
  getArtifactLinkService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['artifactLinkService']>
  createArtifactLinkService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['artifactLinkService']>
  getCodexChatThreadService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['codexChatThreadService']>
  createCodexChatThreadService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['codexChatThreadService']>
  getCodexChatMessageService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['codexChatMessageService']>
  createCodexChatMessageService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['codexChatMessageService']>
  getCodexChatSettingService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['codexChatSettingService']>
  createCodexChatSettingService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['codexChatSettingService']>
  getChatService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['chatService']>
  createChatService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['chatService']>
  getDiscussionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['discussionService']>
  createDiscussionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['discussionService']>
  getExperienceItemService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['experienceItemService']>
  createExperienceItemService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['experienceItemService']>
  getMemoryItemService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['memoryItemService']>
  createMemoryItemService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['memoryItemService']>
  getMissionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['missionService']>
  createMissionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['missionService']>
  getTagService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['tagService']>
  createTagService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['tagService']>
  getWorkflowDefinitionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['workflowDefinitionService']>
  createWorkflowDefinitionService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['workflowDefinitionService']>
  getWorkflowInstanceService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['workflowInstanceService']>
  createWorkflowInstanceService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['workflowInstanceService']>
  getWorkflowStepRunService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['workflowStepRunService']>
  createWorkflowStepRunService(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices['workflowStepRunService']>
  getAgentProfileRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['agentProfileRepository']>
  getProjectRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['projectRepository']>
  getProjectPathRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['projectPathRepository']>
  getScopeRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['scopeRepository']>
  getProjectMemberRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['projectMemberRepository']>
  getPromptRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['promptRepository']>
  getPromptVersionRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['promptVersionRepository']>
  getResourceRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['resourceRepository']>
  getSkillRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['skillRepository']>
  getSkillVersionRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['skillVersionRepository']>
  getKanbanBoardRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['kanbanBoardRepository']>
  getKanbanColumnRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['kanbanColumnRepository']>
  getSprintRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['sprintRepository']>
  getSprintItemRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['sprintItemRepository']>
  getTaskRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['taskRepository']>
  getTaskChecklistItemRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['taskChecklistItemRepository']>
  getTaskCommentRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['taskCommentRepository']>
  getTaskLabelRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['taskLabelRepository']>
  getTaskLabelLinkRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['taskLabelLinkRepository']>
  getTaskRelationRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['taskRelationRepository']>
  getAgentSessionRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['agentSessionRepository']>
  getAgentRunRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['agentRunRepository']>
  getAgentRunEventRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['agentRunEventRepository']>
  getActivityItemRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['activityItemRepository']>
  getArtifactRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['artifactRepository']>
  getArtifactLinkRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['artifactLinkRepository']>
  getCodexChatThreadRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['codexChatThreadRepository']>
  getCodexChatMessageRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['codexChatMessageRepository']>
  getCodexChatSettingRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['codexChatSettingRepository']>
  getChatRoomRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['chatRoomRepository']>
  getChatRoomMemberRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['chatRoomMemberRepository']>
  getChatRoomBindingRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['chatRoomBindingRepository']>
  getChatMessageRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['chatMessageRepository']>
  getDiscussionTopicRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['discussionTopicRepository']>
  getDiscussionTurnRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['discussionTurnRepository']>
  getDiscussionOutputRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['discussionOutputRepository']>
  getExperienceItemRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['experienceItemRepository']>
  getMemoryItemRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['memoryItemRepository']>
  getMissionRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['missionRepository']>
  getTagRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['tagRepository']>
  getWorkflowDefinitionRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['workflowDefinitionRepository']>
  getWorkflowInstanceRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['workflowInstanceRepository']>
  getWorkflowStepRunRepository(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitRepositories['workflowStepRunRepository']>
  getAll(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices>
  createAll(overrides?: Partial<AgentspaceKitContext>): Promise<AgentspaceKitServices>
  clearServiceCache(cacheKey?: string): void
  clearAgentProfileServiceCache(cacheKey?: string): void
  clearProjectServiceCache(cacheKey?: string): void
  clearProjectPathServiceCache(cacheKey?: string): void
  clearProjectMemberServiceCache(cacheKey?: string): void
  clearPromptServiceCache(cacheKey?: string): void
  clearPromptVersionServiceCache(cacheKey?: string): void
  clearResourceServiceCache(cacheKey?: string): void
  clearSkillServiceCache(cacheKey?: string): void
  clearSkillVersionServiceCache(cacheKey?: string): void
  clearKanbanBoardServiceCache(cacheKey?: string): void
  clearKanbanColumnServiceCache(cacheKey?: string): void
  clearSprintServiceCache(cacheKey?: string): void
  clearSprintItemServiceCache(cacheKey?: string): void
  clearTaskServiceCache(cacheKey?: string): void
  clearTaskCommentServiceCache(cacheKey?: string): void
  clearAgentSessionServiceCache(cacheKey?: string): void
  clearAgentRunServiceCache(cacheKey?: string): void
  clearAgentRunEventServiceCache(cacheKey?: string): void
  clearActivityItemServiceCache(cacheKey?: string): void
  clearArtifactServiceCache(cacheKey?: string): void
  clearArtifactLinkServiceCache(cacheKey?: string): void
  clearCodexChatThreadServiceCache(cacheKey?: string): void
  clearCodexChatMessageServiceCache(cacheKey?: string): void
  clearCodexChatSettingServiceCache(cacheKey?: string): void
  clearChatServiceCache(cacheKey?: string): void
  clearDiscussionServiceCache(cacheKey?: string): void
  clearExperienceItemServiceCache(cacheKey?: string): void
  clearMemoryItemServiceCache(cacheKey?: string): void
  clearMissionServiceCache(cacheKey?: string): void
  clearTagServiceCache(cacheKey?: string): void
  clearWorkflowDefinitionServiceCache(cacheKey?: string): void
  clearWorkflowInstanceServiceCache(cacheKey?: string): void
  clearWorkflowStepRunServiceCache(cacheKey?: string): void
  reset(options?: { services?: boolean; repositories?: boolean }): void
  getRegistryStats(): AgentspaceKitDomainServiceRegistryStats
  resolveLogger(overrides?: Partial<AgentspaceKitContext>): Promise<XfLogger | undefined>
}

export interface AgentspaceKitProviderOptions {
  name?: string
  getContext: (overrides?: Partial<AgentspaceKitContext>) => Promise<AgentspaceKitContext> | AgentspaceKitContext
  staticConfig: AgentspaceKitStaticConfig
  resolveLogger?: (context: AgentspaceKitContext) => XfLogger | undefined
  getCacheKey?: (context: AgentspaceKitContext) => string | null
  cache?: Partial<Record<keyof AgentspaceKitServices, ServiceCacheOptions>> & ServiceCacheOptions
  metrics?: MetricsCollector
  resilience?: {
    services?: { retry?: RetryOptions; timeoutMs?: number; breaker?: CircuitBreaker }
    repositories?: { retry?: RetryOptions; timeoutMs?: number; breaker?: CircuitBreaker }
  }
  transformService?: (
    name: keyof AgentspaceKitServices,
    instance: AgentspaceKitServices[keyof AgentspaceKitServices]
  ) => AgentspaceKitServices[keyof AgentspaceKitServices]
  hooks?: Record<string, unknown>
}
