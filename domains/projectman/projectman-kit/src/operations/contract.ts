import type {
  ProjectmanOperationArgument,
  ProjectmanOperationEffect,
  ProjectmanOperationKind,
  ProjectmanOperationPolicy,
  ProjectmanOperationSchema,
  ProjectmanOperationSpec,
} from './types.js'
import { listProjectmanOperationSpecs } from './catalog.js'
import { normalizeProjectmanOperationId } from './definition.js'

export type ProjectmanOperationSideEffect = ProjectmanOperationEffect

export type ProjectmanOperationContract = {
  operationId: string
  toolId: string
  summary: string
  kind: ProjectmanOperationKind
  sideEffect: ProjectmanOperationSideEffect
  serviceKey: string
  serviceEntity: string
  methodName: string
  args: ProjectmanOperationArgument[]
  tags?: string[]
  inputSchema?: ProjectmanOperationSchema
  outputSchema?: ProjectmanOperationSchema
  policy?: ProjectmanOperationPolicy
  examples?: string[]
}

type ProjectmanOperationPolicyRecord = {
  scope: 'tenant' | 'global' | 'project'
  auth?: { required?: boolean; roles?: string[]; capabilities?: string[] }
  safety?: { destructive?: boolean; confirmationRequired?: boolean; applyRequired?: boolean }
  rateLimit?: { bucket: string; max: number; windowSeconds: number }
}

function toSummary(operationId: string): string {
  const normalized = operationId
    .split('.')
    .flatMap((segment) => segment.split('-'))
    .join(' ')
    .trim()
  if (!normalized) return operationId
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function toSideEffect(kind: ProjectmanOperationKind): ProjectmanOperationSideEffect {
  if (kind === 'list' || kind === 'get') return 'none'
  if (kind === 'custom') return 'mixed'
  return 'db'
}

function isDestructiveOperation(spec: ProjectmanOperationSpec): boolean {
  return spec.kind === 'delete' || spec.operationId.includes('.delete')
}

function toDefaultPolicy(spec: ProjectmanOperationSpec): ProjectmanOperationPolicy {
  const destructive = isDestructiveOperation(spec)
  const writeKind = spec.kind === 'create' || spec.kind === 'update' || spec.kind === 'delete' || spec.kind === 'custom'

  const policy: ProjectmanOperationPolicyRecord = {
    scope: 'project',
    auth: { required: true },
  }

  if (writeKind) {
    policy.safety = {
      destructive,
      applyRequired: true,
      confirmationRequired: false,
    }
    policy.rateLimit = {
      bucket: destructive ? 'projectman-write-destructive' : 'projectman-write',
      max: destructive ? 40 : 90,
      windowSeconds: 60,
    }
    return policy
  }

  policy.rateLimit = {
    bucket: 'projectman-read',
    max: spec.kind === 'list' ? 220 : 320,
    windowSeconds: 60,
  }
  return policy
}

function toJsonExample(input: Record<string, unknown>): string {
  return JSON.stringify(input)
}

function toOperationSpecificExamples(spec: ProjectmanOperationSpec): string[] | undefined {
  switch (spec.operationId) {
    case 'kanban-column.list':
      return [
        toJsonExample({
          name: 'Doing',
          slug: 'doing',
        }),
      ]
    case 'kanban-column.get':
      return [
        toJsonExample({
          id: '<columnId>',
        }),
      ]
    case 'kanban-column.create':
      return [
        toJsonExample({
          name: 'Doing',
          slug: 'ui-gelistirme-doing',
          description: 'Board-owned column for active work on the UI Gelistirme board',
        }),
      ]
    case 'kanban-task.create':
      return [
        toJsonExample({
          scopeId: '<scopeId>',
          board: '<boardId>',
          boardColumn: '<boardColumnId>',
          title: 'Hosted invoke guidance hardening',
          description: 'Fix Projectman agent-facing docs and CLI UX',
          createdBy: 'agent:codex:gpt-5',
          updatedBy: 'agent:codex:gpt-5',
        }),
      ]
    case 'sprint-group.create':
      return [
        toJsonExample({
          sprint: '<sprintId>',
          name: 'Backend',
          description: 'Agent-facing Projectman fixes',
          createdBy: 'agent:codex:gpt-5',
          updatedBy: 'agent:codex:gpt-5',
        }),
      ]
    case 'microtask.create':
      return [
        toJsonExample({
          project: '<projectId>',
          title: 'Patch agent invoke apply_required UX',
          sprint: '<sprintId>',
          sprintGroup: '<sprintGroupId>',
          kanbanTask: '<taskId>',
          status: 'active',
          createdBy: 'agent:codex:gpt-5',
          updatedBy: 'agent:codex:gpt-5',
        }),
      ]
    case 'microtask.update':
      return [
        toJsonExample({
          id: '<microTaskId>',
          status: 'completed',
          notes: 'Validation and closeout finished',
        }),
      ]
    case 'sprint.add-microtask':
      return [
        toJsonExample({
          id: '<sprintId>',
          phaseId: '<phaseId>',
          phase: '<phaseName-or-phaseId>',
          title: 'Desktop checklist item',
          status: 'todo',
          notes: 'Smoke detail',
          updatedBy: 'agent:codex:gpt-5',
        }),
      ]
    case 'sprint.update-plan':
      return [
        toJsonExample({
          id: '<sprintId>',
          expectedUpdatedAt: '<latest-sprint-updatedAt>',
          phases: [
            {
              id: '<phaseId>',
              name: 'Main',
              microtasks: [{ id: '<microTaskId>', title: 'Wire API', status: 'doing' }],
            },
          ],
          updatedBy: 'agent:codex:gpt-5',
        }),
      ]
    case 'implementation-plan.create':
      return [
        toJsonExample({
          scopeId: '<scopeId>',
          kanbanTask: '<taskId>',
          name: 'PR2 plan facade',
          goal: 'Ship the implementation plan facade against the sprint source of truth.',
          scope: ['Projectman facade operations', 'aops-cli plan sugar'],
          validationPlan: ['build:kit', 'agent schema smoke'],
        }),
      ]
    case 'implementation-plan.update':
      return [
        toJsonExample({
          id: '<planId-or-sprintId>',
          expectedUpdatedAt: '<latest-sprint-updatedAt>',
          phases: [
            {
              id: '<phaseId>',
              name: 'Implementation',
              microtasks: [{ id: '<microTaskId>', title: 'Wire CLI sugar', status: 'doing' }],
            },
          ],
        }),
      ]
    case 'implementation-plan.add-microtask':
      return [
        toJsonExample({
          id: '<planId-or-sprintId>',
          phase: '<phaseName-or-phaseId>',
          title: 'Add smoke coverage',
          status: 'todo',
        }),
      ]
    case 'implementation-plan.update-microtask':
      return [
        toJsonExample({
          id: '<planId-or-sprintId>',
          microTask: '<microTaskId>',
          status: 'doing',
          notes: 'Execution started',
        }),
      ]
    case 'implementation-plan.delete-microtask':
      return [
        toJsonExample({
          id: '<planId-or-sprintId>',
          microTask: '<microTaskId>',
        }),
      ]
    case 'sprint.update-microtask':
      return [
        toJsonExample({
          id: '<sprintId>',
          microTask: '<microTaskId>',
          status: 'doing',
          notes: 'Execution started',
          updatedBy: 'agent:codex:gpt-5',
        }),
      ]
    case 'sprint.delete-microtask':
      return [
        toJsonExample({
          id: '<sprintId>',
          microTask: '<microTaskId>',
          updatedBy: 'agent:codex:gpt-5',
        }),
      ]
    case 'issue.list':
      return [
        toJsonExample({
          scopeId: '<scopeId>',
          status: 'open',
          source: 'agent',
        }),
      ]
    case 'feedback.list':
      return [
        toJsonExample({
          scopeId: '<scopeId>',
          status: 'new',
          type: 'improvement',
          source: 'agent',
        }),
      ]
    case 'review-request.create':
      return [
        toJsonExample({
          scopeId: '<scopeId>',
          kanbanTask: '<taskId>',
          sprint: '<sprintId>',
          title: 'Review implementation slice',
          instructions: 'Check API contract, server-canonical PM state, and validation evidence.',
          references: ['docs/design.md', 'tests/review-request.test.ts'],
          targetAgent: 'agent:reviewer',
          source: 'agent',
        }),
      ]
    case 'review-request.add-result':
      return [
        toJsonExample({
          id: '<reviewRequestId>',
          reviewer: 'agent:reviewer',
          outcome: 'changes_requested',
          summary: 'The core path works, but issue linking needs one fix.',
          concerns: ['Issue source review is not yet exposed in CLI help.'],
          issueIds: ['<issueId>'],
        }),
      ]
    case 'kanban-template.apply':
      return [
        toJsonExample({
          id: '<templateId>',
          scopeId: '<scopeId>',
        }),
      ]
    case 'kanban-template.create':
      return [
        toJsonExample({
          name: 'Starter',
          description: 'AI-friendly starter workflow',
          definition: {
            boards: [
              {
                name: 'Delivery',
                description: 'Default delivery board',
                columns: [
                  { name: 'Todo', position: 1 },
                  { name: 'Doing', position: 2 },
                  { name: 'Done', position: 3 },
                ],
              },
            ],
          },
        }),
      ]
    case 'kanban-template.list':
      return [
        toJsonExample({
          name: 'Starter',
        }),
      ]
    case 'kanban-template.delete':
      return [
        toJsonExample({
          id: '<templateId>',
        }),
      ]
    default:
      return undefined
  }
}

function toDefaultExampleFromArgs(spec: ProjectmanOperationSpec): string {
  const payload: Record<string, unknown> = {}
  for (const arg of spec.args) {
    if (arg.name === 'id') payload.id = '<id>'
    else if (arg.name === 'scopeId') payload.scopeId = '<scopeId>'
    else if (arg.name === 'project') payload.project = '<projectId>'
    else if (arg.name === 'board') payload.board = '<boardId>'
    else if (arg.name === 'boardColumn') payload.boardColumn = '<boardColumnId>'
    else if (arg.name === 'orderedIds') payload.orderedIds = ['<id-1>', '<id-2>']
    else if (arg.name === 'tags') payload.tags = ['<tag>']
    else payload[arg.name] = `<${arg.name}>`
  }

  if (Object.keys(payload).length === 0) payload.input = '<payload>'
  return toJsonExample(payload)
}

function toDefaultExamples(spec: ProjectmanOperationSpec): string[] {
  const specific = toOperationSpecificExamples(spec)
  if (specific && specific.length > 0) return specific
  return [toDefaultExampleFromArgs(spec)]
}

function fromSpec(spec: ProjectmanOperationSpec): ProjectmanOperationContract {
  const summary = typeof spec.summary === 'string' ? spec.summary.trim() : ''
  const policy = spec.policy ?? toDefaultPolicy(spec)
  const examples = spec.examples && spec.examples.length > 0 ? [...spec.examples] : toDefaultExamples(spec)

  return {
    operationId: spec.operationId,
    toolId: spec.toolId,
    summary: summary || toSummary(spec.operationId),
    kind: spec.kind,
    sideEffect: spec.sideEffect ?? toSideEffect(spec.kind),
    serviceKey: spec.serviceKey,
    serviceEntity: spec.serviceEntity,
    methodName: spec.methodName,
    args: spec.args.map((arg) => ({ ...arg })),
    ...(spec.tags ? { tags: [...spec.tags] } : {}),
    ...(spec.inputSchema !== undefined ? { inputSchema: spec.inputSchema } : {}),
    ...(spec.outputSchema !== undefined ? { outputSchema: spec.outputSchema } : {}),
    ...(policy !== undefined ? { policy } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  }
}

export function listProjectmanOperationContracts(options?: { refresh?: boolean }): ProjectmanOperationContract[] {
  return listProjectmanOperationSpecs(options).map(fromSpec)
}

export function getProjectmanOperationContractByToolId(
  toolId: string,
  options?: { refresh?: boolean },
): ProjectmanOperationContract | null {
  const operations = listProjectmanOperationContracts(options)
  return operations.find((operation) => operation.toolId === toolId) ?? null
}

export function getProjectmanOperationContractById(
  operationId: string,
  options?: { refresh?: boolean },
): ProjectmanOperationContract | null {
  const normalized = normalizeProjectmanOperationId(operationId)
  const operations = listProjectmanOperationContracts(options)
  return operations.find((operation) => operation.operationId === normalized) ?? null
}
