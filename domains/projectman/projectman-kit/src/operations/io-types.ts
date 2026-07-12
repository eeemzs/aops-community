import type { Effect } from 'effect'

import type { ProjectmanKitServices } from '../domain-services/types.js'
import { PROJECTMAN_OPERATION_CATALOG_ROWS } from './catalog.data.js'

type ProjectmanCatalogRow = (typeof PROJECTMAN_OPERATION_CATALOG_ROWS)[number]
type ProjectmanOperationId = Extract<ProjectmanCatalogRow['operationId'], string>
type ProjectmanToolId = Extract<ProjectmanCatalogRow['toolId'], string>

type ProjectmanSpecialMethods = {
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
type JsonObject = { [key: string]: JsonValue }

type ProjectmanArgTypeByName = {
  action: string
  board: string
  boardColumn: string
  column: string
  basedOnSeqRange: JsonObject
  collabRequestEvent: string | null
  collabResultEventId: string | null
  collabResultEventIds: string[]
  collabSession: string | null
  concerns: string[]
  createdBy: string
  closedAt: string
  definition: JsonObject
  description: string | null
  entityId: string
  entityType: string
  expectedUpdatedAt: string
  feedback: string
  goal: string | null
  id: string
  idempotencyKey: string
  instructions: string | null
  issue: string
  issueIds: string[]
  json: boolean
  kanbanTask: string
  kind: string
  meta: JsonObject
  microTask: string
  name: string
  notes: string | null
  operation: string
  orderedIds: string[]
  objections: string[]
  outcome: string
  parentReviewRequest: string | null
  phases: JsonValue[]
  position: number
  positives: string[]
  progress: number
  project: string
  references: string[]
  requestedAt: string
  requestedBy: string | null
  resultCreatedAt: string
  resultId: string
  reviewRequest: string | null
  reviewer: string
  reviewScope: string | null
  rootReviewRequest: string | null
  severity: string
  slug: string
  source: string
  scope: string[]
  sprint: string
  status: string
  suggestion: string | null
  sourceCreatedAt: string
  sourceUpdatedAt: string
  tags: string[]
  targetAgent: string | null
  targetSlot: string | null
  taskCode: string | null
  title: string
  type: string
  updatedBy: string
  validationPlan: string[]
  wipLimit: number | null
}

type ProjectmanServiceByKey = ProjectmanKitServices & {
  __calls__: ProjectmanSpecialMethods
}

type ProjectmanServiceMethodRef = {
  [S in keyof ProjectmanServiceByKey]: {
    serviceKey: S
    methodName: Extract<keyof ProjectmanServiceByKey[S], string>
  }
}[keyof ProjectmanServiceByKey]

const PROJECTMAN_TOOL_SERVICE_METHOD_MAP = {
  'projectman-event-delete': { serviceKey: 'projectmanEventService', methodName: 'removeEvent' },
  'projectman-event-list': { serviceKey: 'projectmanEventService', methodName: 'listEvents' },
  'projectman-feedback-create': { serviceKey: 'feedbackItemService', methodName: 'createFeedback' },
  'projectman-feedback-delete': { serviceKey: 'feedbackItemService', methodName: 'removeFeedback' },
  'projectman-feedback-get': { serviceKey: 'feedbackItemService', methodName: 'getById' },
  'projectman-feedback-list': { serviceKey: 'feedbackItemService', methodName: 'listFeedback' },
  'projectman-feedback-update': { serviceKey: 'feedbackItemService', methodName: 'updateFeedback' },
  'projectman-issue-create': { serviceKey: 'issueItemService', methodName: 'createIssue' },
  'projectman-issue-delete': { serviceKey: 'issueItemService', methodName: 'removeIssue' },
  'projectman-issue-get': { serviceKey: 'issueItemService', methodName: 'getById' },
  'projectman-issue-list': { serviceKey: 'issueItemService', methodName: 'listIssues' },
  'projectman-issue-update': { serviceKey: 'issueItemService', methodName: 'updateIssue' },
  'projectman-review-request-add-result': { serviceKey: 'reviewRequestService', methodName: 'addResult' },
  'projectman-review-request-create': { serviceKey: 'reviewRequestService', methodName: 'createReviewRequest' },
  'projectman-review-request-delete': { serviceKey: 'reviewRequestService', methodName: 'removeReviewRequest' },
  'projectman-review-request-get': { serviceKey: 'reviewRequestService', methodName: 'getById' },
  'projectman-review-request-list': { serviceKey: 'reviewRequestService', methodName: 'listReviewRequests' },
  'projectman-review-request-update': { serviceKey: 'reviewRequestService', methodName: 'updateReviewRequest' },
  'projectman-kanban-board-column-create': { serviceKey: 'kanbanBoardColumnService', methodName: 'addColumnToBoard' },
  'projectman-kanban-board-column-delete': { serviceKey: 'kanbanBoardColumnService', methodName: 'removeBoardColumn' },
  'projectman-kanban-board-column-list': { serviceKey: 'kanbanBoardColumnService', methodName: 'listBoardColumns' },
  'projectman-kanban-board-column-reorder': { serviceKey: 'kanbanBoardColumnService', methodName: 'reorderBoardColumns' },
  'projectman-kanban-board-column-update': { serviceKey: 'kanbanBoardColumnService', methodName: 'updateBoardColumn' },
  'projectman-kanban-board-archive': { serviceKey: 'kanbanBoardService', methodName: 'archiveBoard' },
  'projectman-kanban-board-create': { serviceKey: 'kanbanBoardService', methodName: 'createBoard' },
  'projectman-kanban-board-delete': { serviceKey: 'kanbanBoardService', methodName: 'removeBoard' },
  'projectman-kanban-board-list': { serviceKey: 'kanbanBoardService', methodName: 'listBoards' },
  'projectman-kanban-board-unarchive': { serviceKey: 'kanbanBoardService', methodName: 'unarchiveBoard' },
  'projectman-kanban-board-reorder': { serviceKey: 'kanbanBoardService', methodName: 'reorderBoards' },
  'projectman-kanban-board-update': { serviceKey: 'kanbanBoardService', methodName: 'updateBoard' },
  'projectman-kanban-column-create': { serviceKey: 'kanbanColumnService', methodName: 'createColumn' },
  'projectman-kanban-column-delete': { serviceKey: 'kanbanColumnService', methodName: 'removeColumn' },
  'projectman-kanban-column-get': { serviceKey: 'kanbanColumnService', methodName: 'getById' },
  'projectman-kanban-column-list': { serviceKey: 'kanbanColumnService', methodName: 'listColumns' },
  'projectman-kanban-column-set-wip-limit': { serviceKey: 'kanbanColumnService', methodName: 'setColumnWipLimit' },
  'projectman-kanban-column-update': { serviceKey: 'kanbanColumnService', methodName: 'updateColumn' },
  'projectman-kanban-task-create': { serviceKey: 'kanbanTaskService', methodName: 'createTask' },
  'projectman-kanban-task-delete': { serviceKey: 'kanbanTaskService', methodName: 'removeTask' },
  'projectman-kanban-task-get': { serviceKey: 'kanbanTaskService', methodName: 'getById' },
  'projectman-kanban-task-list': { serviceKey: 'kanbanTaskService', methodName: 'listTasks' },
  'projectman-kanban-task-move': { serviceKey: 'kanbanTaskService', methodName: 'moveTaskToColumn' },
  'projectman-kanban-task-reorder': { serviceKey: 'kanbanTaskService', methodName: 'reorderTasksInColumn' },
  'projectman-kanban-task-update': { serviceKey: 'kanbanTaskService', methodName: 'updateTask' },
  'projectman-kanban-template-apply': { serviceKey: 'kanbanTemplateService', methodName: 'applyTemplateToProject' },
  'projectman-kanban-template-create': { serviceKey: 'kanbanTemplateService', methodName: 'createTemplate' },
  'projectman-kanban-template-delete': { serviceKey: 'kanbanTemplateService', methodName: 'removeTemplate' },
  'projectman-kanban-template-list': { serviceKey: 'kanbanTemplateService', methodName: 'listTemplates' },
  'projectman-kanban-template-update': { serviceKey: 'kanbanTemplateService', methodName: 'updateTemplate' },
  'projectman-implementation-plan-create': { serviceKey: 'sprintService', methodName: 'createSprint' },
  'projectman-implementation-plan-add-microtask': { serviceKey: 'sprintService', methodName: 'addMicrotask' },
  'projectman-implementation-plan-get': { serviceKey: 'sprintService', methodName: 'getById' },
  'projectman-implementation-plan-list': { serviceKey: 'sprintService', methodName: 'listSprints' },
  'projectman-implementation-plan-delete-microtask': { serviceKey: 'sprintService', methodName: 'deleteMicrotask' },
  'projectman-implementation-plan-update-microtask': { serviceKey: 'sprintService', methodName: 'updateMicrotask' },
  'projectman-implementation-plan-update': { serviceKey: 'sprintService', methodName: 'updatePlan' },
  'projectman-sprint-create': { serviceKey: 'sprintService', methodName: 'createSprint' },
  'projectman-sprint-add-microtask': { serviceKey: 'sprintService', methodName: 'addMicrotask' },
  'projectman-sprint-archive': { serviceKey: 'sprintService', methodName: 'archiveSprint' },
  'projectman-sprint-get': { serviceKey: 'sprintService', methodName: 'getById' },
  'projectman-sprint-delete': { serviceKey: 'sprintService', methodName: 'removeSprint' },
  'projectman-sprint-list': { serviceKey: 'sprintService', methodName: 'listSprints' },
  'projectman-sprint-unarchive': { serviceKey: 'sprintService', methodName: 'unarchiveSprint' },
  'projectman-sprint-delete-microtask': { serviceKey: 'sprintService', methodName: 'deleteMicrotask' },
  'projectman-sprint-update-microtask': { serviceKey: 'sprintService', methodName: 'updateMicrotask' },
  'projectman-sprint-update-microtask-status': { serviceKey: 'sprintService', methodName: 'updateMicrotaskStatus' },
  'projectman-sprint-update-plan': { serviceKey: 'sprintService', methodName: 'updatePlan' },
} as const satisfies Record<ProjectmanToolId, ProjectmanServiceMethodRef>

type RowMethodRef<TRow extends ProjectmanCatalogRow> =
  TRow['toolId'] extends keyof typeof PROJECTMAN_TOOL_SERVICE_METHOD_MAP
    ? (typeof PROJECTMAN_TOOL_SERVICE_METHOD_MAP)[TRow['toolId']]
    : never

type RowService<TRow extends ProjectmanCatalogRow> =
  RowMethodRef<TRow>['serviceKey'] extends keyof ProjectmanServiceByKey
    ? ProjectmanServiceByKey[RowMethodRef<TRow>['serviceKey']]
    : never

type RowMethod<TRow extends ProjectmanCatalogRow> =
  RowMethodRef<TRow>['methodName'] extends keyof RowService<TRow>
    ? RowService<TRow>[RowMethodRef<TRow>['methodName']]
    : never

type RowResult<TRow extends ProjectmanCatalogRow> =
  RowMethod<TRow> extends (...args: unknown[]) => infer TResult
    ? TResult
    : never

type UnwrapEffect<T> = T extends Effect.Effect<infer A, unknown, unknown>
  ? A
  : Awaited<T>

type BuildInputShape<TRow extends ProjectmanCatalogRow> = {
  [I in keyof TRow['args'] as TRow['args'][I] extends {
    name: infer N extends string
    optional: false
  }
    ? N
    : never]: TRow['args'][I] extends {
    name: infer N extends keyof ProjectmanArgTypeByName
  }
    ? ProjectmanArgTypeByName[N]
    : never
} & {
  [I in keyof TRow['args'] as TRow['args'][I] extends {
    name: infer N extends string
    optional: true
  }
    ? N
    : never]?: TRow['args'][I] extends {
    name: infer N extends keyof ProjectmanArgTypeByName
  }
    ? ProjectmanArgTypeByName[N]
    : never
}

type ProjectmanOperationOutputOverrideById = {
  'kanban-board.delete': {
    boardId: string
    deletedTaskCount: number
    deletedBoardColumnCount: number
  }
}

type RowByOperationId<TId extends ProjectmanOperationId> = Extract<ProjectmanCatalogRow, { operationId: TId }>

type RowOutput<TRow extends ProjectmanCatalogRow> =
  TRow['operationId'] extends keyof ProjectmanOperationOutputOverrideById
    ? ProjectmanOperationOutputOverrideById[TRow['operationId']]
    : UnwrapEffect<RowResult<TRow>>

export type ProjectmanOperationInputById = {
  [TId in ProjectmanOperationId]: BuildInputShape<RowByOperationId<TId>>
}

export type ProjectmanOperationOutputById = {
  [TId in ProjectmanOperationId]: RowOutput<RowByOperationId<TId>>
}

export type ProjectmanTypedOperationId = ProjectmanOperationId

export type ProjectmanOperationHostContextInput = {
  projectId?: string
  scopeId?: string
}

export type ProjectmanOperationInput<TId extends ProjectmanTypedOperationId> =
  ProjectmanOperationInputById[TId] & ProjectmanOperationHostContextInput
export type ProjectmanOperationOutput<TId extends ProjectmanTypedOperationId> = ProjectmanOperationOutputById[TId]
