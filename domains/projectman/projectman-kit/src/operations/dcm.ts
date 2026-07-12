import { buildOperationInputJsonSchema } from '@aopslab/xf-validation'

import type { ProjectmanOperationContract, ProjectmanOperationSideEffect } from './contract.js'
import type { ProjectmanTypedOperationId } from './io-types.js'
import type { ProjectmanOperationPolicy } from './types.js'
import { listProjectmanOperationContracts } from './contract.js'
import { getProjectmanContractSchema, resolveProjectmanSchemaRefName } from './schemas.js'
import { getProjectmanToolInputSchema } from './tool-input.js'

type JsonSchema = Record<string, unknown>

export type ProjectmanDomainCapabilityOperation = {
  operationId: string
  title?: string
  sideEffect?: ProjectmanOperationSideEffect
  tags?: string[]
  inputSchemaRef?: string
  outputSchemaRef?: string
}

export type ProjectmanDomainCapabilityOperationDocs = {
  summary?: string
  notes?: string[]
  examples?: string[]
  preconditions?: string[]
  postconditions?: string[]
  antiPatterns?: string[]
}

export type ProjectmanDomainCapabilityResource = {
  resourceId: string
  title: string
  kind?: string
}

export type ProjectmanDomainDiscoveryDocs = {
  summary?: string
  notes?: string[]
}

export type ProjectmanDomainCapabilityManifest = {
  manifestVersion: string
  domain: {
    id: string
    version: string
    displayName?: string
    description?: string
  }
  capabilities: {
    operations: ProjectmanDomainCapabilityOperation[]
    resources?: ProjectmanDomainCapabilityResource[]
  }
  contracts?: {
    schemas: Record<string, unknown>
  }
  policies?: {
    operations: Record<string, ProjectmanOperationPolicy>
  }
  docs?: {
    domain?: ProjectmanDomainDiscoveryDocs
    resources?: Record<string, ProjectmanDomainDiscoveryDocs>
    operations?: Record<string, ProjectmanDomainCapabilityOperationDocs>
  }
}

export type BuildProjectmanDomainCapabilityManifestOptions = {
  manifestVersion?: string
  domainVersion?: string
  includeDocs?: boolean
  refresh?: boolean
}

function toTags(operation: ProjectmanOperationContract): string[] {
  const tags = new Set<string>()
  for (const tag of operation.tags ?? []) {
    const normalized = String(tag ?? '').trim()
    if (!normalized) continue
    tags.add(normalized)
  }
  tags.add(`kind:${operation.kind}`)
  tags.add(`resource:${operation.serviceEntity}`)
  tags.add(`service:${operation.serviceKey}`)
  return [...tags]
}

function humanizeResource(resource: string): string {
  const label = resource
    .replace(/^projectman\./, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!label) return 'Resource'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function inferResourceKind(resourceId: string): string | undefined {
  if (resourceId.includes('template')) return 'template'
  if (resourceId.includes('link')) return 'relationship'
  return 'record'
}

function buildResourceSummary(resourceTitle: string, operationKinds: string[]): string {
  if (operationKinds.length === 0) {
    return `${resourceTitle} records used in project planning and delivery workflows.`
  }
  if (operationKinds.length === 1) {
    return `Supports ${operationKinds[0]} operations for ${resourceTitle.toLowerCase()} in project planning workflows.`
  }
  return `Supports ${operationKinds.slice(0, 5).join(', ')} operations for ${resourceTitle.toLowerCase()} in project planning workflows.`
}

function buildCapabilityResources(operations: ProjectmanOperationContract[]): ProjectmanDomainCapabilityResource[] {
  const seen = new Map<string, ProjectmanDomainCapabilityResource>()

  for (const operation of operations) {
    const resourceId = String(operation.serviceEntity ?? '').trim()
    if (!resourceId || seen.has(resourceId)) continue
    seen.set(resourceId, {
      resourceId,
      title: humanizeResource(resourceId),
      kind: inferResourceKind(resourceId),
    })
  }

  return [...seen.values()].sort((left, right) => left.title.localeCompare(right.title))
}

function buildResourceDocs(operations: ProjectmanOperationContract[]): Record<string, ProjectmanDomainDiscoveryDocs> {
  const operationKindsByResource = new Map<string, Set<string>>()

  for (const operation of operations) {
    const resourceId = String(operation.serviceEntity ?? '').trim()
    if (!resourceId) continue
    const existing = operationKindsByResource.get(resourceId) ?? new Set<string>()
    existing.add(operation.kind)
    operationKindsByResource.set(resourceId, existing)
  }

  return Object.fromEntries(
    [...operationKindsByResource.entries()]
      .sort(([left], [right]) => humanizeResource(left).localeCompare(humanizeResource(right)))
      .map(([resourceId, operationKinds]) => [
        resourceId,
        {
          summary: buildResourceSummary(humanizeResource(resourceId), [...operationKinds]),
        },
      ]),
  )
}

function buildOperationSpecificDocs(operationId: string): Partial<ProjectmanDomainCapabilityOperationDocs> {
  switch (operationId) {
    case 'kanban-column.list':
      return {
        notes: [
          'This surface lists raw kanban column records across the current scope.',
          'Each board should normally own its own column records; board specificity still lives in kanban-board-column links.',
        ],
        preconditions: [
          'Do not assume project filtering exists on raw kanban-column list operations.',
          'If you need project-specific structure, inspect kanban-board-column on the target board.',
        ],
        antiPatterns: [
          'Treating raw kanban-column records as if they were safe to share across multiple boards.',
        ],
      }
    case 'kanban-column.create':
      return {
        notes: [
          'Raw kanban-column.create writes a concrete column record; board-owned flows should give it a board-prefixed slug.',
          'If the goal is board bootstrap, prefer kanban-template.apply or board bootstrap flow over ad-hoc repeated column writes.',
        ],
        antiPatterns: [
          'Reusing one board column record across multiple boards.',
        ],
      }
    case 'kanban-board.create':
      return {
        notes: ['Follow-up sugar candidate: board bootstrap.'],
        preconditions: [
          'Resolve the active project scope before creating a new board.',
          'Reuse an existing board if it already matches the workstream.',
        ],
        postconditions: [
          'The board is ready for visible execution tracking.',
          'Substantive work can now open issue, kanban-task, and sprint records on top of this board.',
        ],
        antiPatterns: [
          'Creating a separate board for each task.',
        ],
      }
    case 'kanban-task.create':
      return {
        notes: [
          'Follow-up sugar candidate: slice start.',
          'boardColumn is required on the raw create surface.',
        ],
        preconditions: [
          'Choose the correct board and board column before creating the task.',
          'If the work is substantive, issue and sprint records should also exist.',
          'If the work is multi-step or likely to resume, prepare phase and microtask decomposition.',
        ],
        postconditions: [
          'The work item is visible on the board.',
          'Long or multi-step work should continue into phase and microtask records.',
        ],
        antiPatterns: [
          'Using one umbrella kanban task for a large multi-sprint delivery.',
          'Treating a kanban task as sufficient planning for substantive engineering work.',
        ],
      }
    case 'kanban-task.update':
      return {
        preconditions: [
          'Read the current task and sprint state before patching linked execution fields.',
          'If sprint linkage changes, keep the task-side sprint projection aligned with the current sprint document.',
        ],
        postconditions: [
          'Task metadata reflects the current execution slice.',
          'Sprint linkage remains coherent after the write.',
        ],
        antiPatterns: [
          'Patching sprint linkage while leaving the task or sprint snapshot stale.',
          'Manually treating task progress as truth instead of linked microtask completion.',
        ],
      }
    case 'kanban-task.move':
      return {
        preconditions: [
          'Resolve the target board column and clear invalid column-group state when changing columns.',
          'For active tracked work, target board movement should match actual execution state.',
        ],
        postconditions: [
          'Kanban visibility matches the execution state after the move.',
        ],
        antiPatterns: [
          'Leaving active work in Backlog or Todo after implementation already started.',
          'Moving a task to Done before linked microtasks are actually completed.',
        ],
      }
    case 'sprint.create':
      return {
        notes: ['Follow-up sugar candidate: slice start.'],
        preconditions: [
          'Inspect active sprints before creating a new execution window.',
          'Creating a sprint is the default for substantive engineering work unless sprintless work is intentional.',
        ],
        postconditions: [
          'A current execution window exists for linked tasks and microtasks.',
        ],
        antiPatterns: [
          'Opening parallel duplicate active sprints without an explicit reason.',
        ],
      }
    case 'sprint.update-plan':
      return {
        notes: [
          'When phases are included, this surface replaces the persisted phase and microtask tree with the supplied snapshot.',
          'Prefer sprint.add-microtask / sprint.update-microtask / sprint.delete-microtask for incremental checklist edits.',
          'Pass expectedUpdatedAt from the latest sprint snapshot to prevent stale overwrite conflicts.',
        ],
        preconditions: [
          'Read the current sprint snapshot before replacing nested phases or microtasks.',
          'Send the full intended phase tree; omitted child items are treated as removed.',
        ],
        postconditions: [
          'Sprint metadata and nested execution plan reflect the supplied snapshot.',
        ],
        antiPatterns: [
          'Using update-plan for one-line checklist edits when an incremental microtask operation exists.',
        ],
      }
    case 'sprint.add-microtask':
      return {
        notes: [
          'This is the preferred incremental surface for appending or inserting a sprint checklist item.',
          'Provide phaseId when you already know the exact phase record; otherwise phase name is acceptable.',
        ],
        preconditions: [
          'Resolve the target sprint and phase before writing.',
          'Use sprint.update-plan only when the whole nested plan truly changes as a document.',
        ],
        postconditions: [
          'A new microtask exists without replacing sibling microtasks or phases.',
        ],
        antiPatterns: [
          'Reading a sprint snapshot and rewriting the full plan just to add one checklist item.',
        ],
      }
    case 'sprint.update-microtask':
      return {
        notes: [
          'Use this surface for title, status, notes, or position changes on one existing microtask.',
        ],
        preconditions: [
          'Resolve the target microtask from the current sprint snapshot before patching.',
        ],
        postconditions: [
          'Sibling microtasks stay intact while the target microtask is patched or repositioned.',
        ],
        antiPatterns: [
          'Using full plan replacement to edit one microtask field.',
        ],
      }
    case 'sprint.delete-microtask':
      return {
        notes: [
          'Deleting a microtask compacts remaining positions inside the phase after removal.',
        ],
        preconditions: [
          'Confirm the target microtask belongs to the intended sprint before deleting it.',
        ],
        postconditions: [
          'The microtask is removed and the phase checklist remains positionally compact.',
        ],
        antiPatterns: [
          'Dropping the item from a replace-plan payload when an explicit delete surface exists.',
        ],
      }
    case 'implementation-plan.create':
      return {
        notes: [
          'Implementation plans are a facade over sprint execution documents; the plan id is the sprint id.',
          'This surface exists so agents can talk in mission/plan language without adding a second Projectman table.',
        ],
        preconditions: [
          'Resolve or create the kanban task that owns the implementation slice before creating the plan.',
        ],
        postconditions: [
          'A sprint-backed implementation plan exists with the same lifecycle and microtask semantics as sprint.create.',
        ],
        antiPatterns: [
          'Duplicating sprint plan state in an app-local implementation-plan store.',
        ],
      }
    case 'implementation-plan.update':
      return {
        notes: [
          'This is a sprint.update-plan facade; pass the latest expectedUpdatedAt when replacing nested phases.',
          'Prefer implementation-plan.add-microtask / update-microtask / delete-microtask for one-item edits.',
        ],
        preconditions: [
          'Read the current implementation-plan snapshot before replacing nested phases or microtasks.',
        ],
        postconditions: [
          'The underlying sprint plan remains the only persisted implementation-plan source of truth.',
        ],
        antiPatterns: [
          'Treating implementation-plan.update as a separate storage owner from sprint.update-plan.',
        ],
      }
    case 'implementation-plan.add-microtask':
    case 'implementation-plan.update-microtask':
    case 'implementation-plan.delete-microtask':
      return {
        notes: [
          'This operation is a mission/plan-language facade over the matching sprint microtask operation.',
          'Use the implementation plan id wherever the older sprint operation expects a sprint id.',
        ],
        preconditions: [
          'Resolve the implementation-plan snapshot and target phase or microtask before writing.',
        ],
        postconditions: [
          'The underlying sprint phases and microtasks remain the canonical execution checklist.',
        ],
        antiPatterns: [
          'Rewriting the full plan snapshot for a one-microtask edit.',
        ],
      }
    case 'sprint.update':
      return {
        notes: ['Follow-up sugar candidate: slice sync.', 'Follow-up sugar candidate: slice close.'],
        preconditions: [
          'Read linked tasks and current sprint state before changing lifecycle status.',
          'If completing the sprint, decide carry-forward items before closing the window.',
        ],
        postconditions: [
          'Completed sprint closeout should move fully completed tasks to Done.',
          'Incomplete tasks should be called out as carry-forward work.',
        ],
        antiPatterns: [
          'Completing a sprint without closeout sync and carry-forward review.',
        ],
      }
    case 'sprint-group.create':
      return {
        notes: [
          'The raw sprint-group.create surface is sprint-scoped; resolve sprint first when starting from only project context.',
        ],
        preconditions: [
          'Use sprint-group only for multi-step work inside a sprint.',
          'Create at least one microtask in the same execution window.',
          'Do not invent status semantics for sprint-group; it is a stateless execution bucket in this variant.',
        ],
        postconditions: [
          'The sprint-group is immediately backed by at least one actionable microtask.',
        ],
        antiPatterns: [
          'Creating an empty sprint-group.',
          'Treating sprint-group as if it had draft, active, or completed status fields.',
        ],
      }
    case 'microtask.create':
      return {
        notes: [
          'Follow-up sugar candidate: slice start.',
          'Higher-level projectman-product microtask flows auto-sync linked kanban visibility; raw hosted tool usage still needs explicit task sync when no flow is available.',
        ],
        preconditions: [
          'Use microtask for actionable execution slices, not vague prose planning.',
          'If the microtask links to a kanban task, be ready to sync kanban visibility from microtask status.',
        ],
        postconditions: [
          'Linked kanban-task progress can now be derived from microtask completion.',
        ],
        antiPatterns: [
          'Writing a giant microtask that still hides multiple implementation steps.',
        ],
      }
    case 'microtask.update':
      return {
        notes: [
          'Follow-up sugar candidate: slice sync.',
          'Higher-level projectman-product microtask flows auto-sync linked kanban visibility; raw hosted tool usage still needs explicit task sync when no flow is available.',
        ],
        preconditions: [
          'Update actual microtask status instead of manually inventing task progress.',
          'If a linked task exists, board visibility should be rechecked after the write.',
        ],
        postconditions: [
          'Linked task progress stays aligned with microtask completion.',
          'Started work can be reflected in Doing; fully completed linked work can be reflected in Done.',
        ],
        antiPatterns: [
          'Manually patching kanban task progress instead of updating microtask truth.',
          'Leaving linked work in Todo after microtask execution already started.',
        ],
      }
    case 'issue.create':
      return {
        preconditions: [
          'Create an issue only for a real blocker, risk, problem, or defect.',
          'Link the issue to sprint, task, or microtask context when possible.',
        ],
        postconditions: [
          'The blocker or risk is visible and traceable.',
        ],
        antiPatterns: [
          'Using issue as the only execution tracker for substantive work.',
        ],
      }
    case 'issue.update':
      return {
        preconditions: [
          'Read current blocker state before closing or resolving the issue.',
        ],
        postconditions: [
          'Resolved issues reflect current blocker truth.',
        ],
        antiPatterns: [
          'Leaving resolved blockers open after the execution path is already unblocked.',
        ],
      }
    case 'feedback.create':
      return {
        preconditions: [
          'Create feedback for improvement signals, tooling friction, UX gaps, and token waste that should survive the session.',
        ],
        postconditions: [
          'The improvement signal is stored as a durable follow-up item.',
        ],
        antiPatterns: [
          'Keeping recurring tooling or token-efficiency pain only in ephemeral chat text.',
        ],
      }
    case 'feedback.update':
      return {
        preconditions: [
          'Re-read the current feedback status before dismissing or implementing it.',
        ],
        postconditions: [
          'Feedback status matches current follow-up reality.',
        ],
        antiPatterns: [
          'Marking feedback implemented while the underlying friction still exists.',
        ],
      }
    case 'kanban-template.apply':
      return {
        notes: [
          'Use this one-shot bulk clone when the goal is board bootstrap with default columns.',
        ],
        preconditions: [
          'Resolve the target owner scope first and prefer template apply over repeated raw column CRUD when the workflow already exists as a template.',
        ],
        postconditions: [
          'Board, column, and board-column structure is created in one owner-scoped write sequence.',
        ],
        antiPatterns: [
          'Rebuilding the same Backlog, Todo, Doing, Done structure by hand when a reusable template already exists.',
        ],
      }
    default:
      return {}
  }
}

function toOperationDocs(operation: ProjectmanOperationContract): ProjectmanDomainCapabilityOperationDocs {
  const requiredArgs = operation.args.filter((arg) => !arg.optional).map((arg) => arg.name)
  const optionalArgs = operation.args.filter((arg) => arg.optional).map((arg) => arg.name)
  const notes: string[] = []

  if (requiredArgs.length > 0) notes.push(`required args: ${requiredArgs.join(', ')}`)
  if (optionalArgs.length > 0) notes.push(`optional args: ${optionalArgs.join(', ')}`)
  if (operation.policy?.scope === 'project') {
    notes.push('AOPS live invoke resolves owner scope through project or scope identifiers; send scope-aware input for scoped calls.')
  }
  const specific = buildOperationSpecificDocs(operation.operationId)

  return {
    summary: operation.summary,
    ...(notes.length > 0 || specific.notes?.length ? { notes: [...notes, ...(specific.notes ?? [])] } : {}),
    ...(operation.examples && operation.examples.length > 0 ? { examples: [...operation.examples] } : {}),
    ...(specific.preconditions?.length ? { preconditions: [...specific.preconditions] } : {}),
    ...(specific.postconditions?.length ? { postconditions: [...specific.postconditions] } : {}),
    ...(specific.antiPatterns?.length ? { antiPatterns: [...specific.antiPatterns] } : {}),
  }
}

function buildArgJsonSchema(argName: string): JsonSchema {
  switch (argName) {
    case 'orderedIds':
    case 'references':
    case 'scope':
    case 'validationPlan':
    case 'tags':
      return {
        type: 'array',
        items: { type: 'string', minLength: 1 },
      }
    case 'phases':
      return {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
        },
      }
    case 'json':
      return { type: 'boolean' }
    case 'position':
    case 'progress':
    case 'wipLimit':
      return { anyOf: [{ type: 'number' }, { type: 'null' }] }
    case 'startAt':
    case 'endAt':
    case 'openedAt':
    case 'closedAt':
    case 'recordedAt':
    case 'resolvedAt':
    case 'handledAt':
    case 'timelineAt':
    case 'sourceCreatedAt':
    case 'sourceUpdatedAt':
      return { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }
    case 'definition':
    case 'meta':
      return {
        type: 'object',
        additionalProperties: true,
      }
    default:
      return { type: 'string', minLength: 1 }
  }
}

function buildInputSchemaForOperation(operation: ProjectmanOperationContract): JsonSchema {
  try {
    const toolInputSchema = getProjectmanToolInputSchema(operation.operationId as ProjectmanTypedOperationId)
    const jsonSchema = buildOperationInputJsonSchema(toolInputSchema)
    if (jsonSchema && typeof jsonSchema === 'object' && !Array.isArray(jsonSchema)) {
      const { $schema: _schemaDialect, ...schemaWithoutDialect } = jsonSchema
      return {
        ...schemaWithoutDialect,
        // Keep DCM invoke pre-validation permissive for aliases/future context keys;
        // the domain route still parses and validates with the strict tool-input Zod.
        additionalProperties: true,
      }
    }
  } catch {
    // Fall back to the lightweight arg map for non-tooling operations.
  }

  const properties = Object.fromEntries(
    operation.args.map((arg) => [arg.name, buildArgJsonSchema(arg.name)]),
  )
  const required = operation.args.filter((arg) => arg.optional !== true).map((arg) => arg.name)

  return {
    type: 'object',
    additionalProperties: true,
    ...(required.length > 0 ? { required } : {}),
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
  }
}

function toCapabilityOperation(operation: ProjectmanOperationContract): ProjectmanDomainCapabilityOperation {
  const inputSchemaRef = resolveProjectmanSchemaRefName(operation.inputSchema)
  const outputSchemaRef = resolveProjectmanSchemaRefName(operation.outputSchema)

  return {
    operationId: operation.operationId,
    title: operation.summary,
    sideEffect: operation.sideEffect,
    tags: toTags(operation),
    ...(inputSchemaRef ? { inputSchemaRef } : {}),
    ...(outputSchemaRef ? { outputSchemaRef } : {}),
  }
}

export function buildProjectmanDomainCapabilityManifest(
  options: BuildProjectmanDomainCapabilityManifestOptions = {},
): ProjectmanDomainCapabilityManifest {
  const operations = listProjectmanOperationContracts({ refresh: options.refresh })

  const manifest: ProjectmanDomainCapabilityManifest = {
    manifestVersion: options.manifestVersion ?? '1.0.0',
    domain: {
      id: 'projectman',
      version: options.domainVersion ?? '0.0.0',
      displayName: 'Projectman',
      description: 'Project planning and delivery tooling for boards, tasks, sprints, templates, and project-level workflows.',
    },
    capabilities: {
      operations: operations.map(toCapabilityOperation),
      resources: buildCapabilityResources(operations),
    },
  }

  if (options.includeDocs !== false) {
    manifest.docs = {
      domain: {
        summary: 'Plan, organize, and track project delivery work across boards, columns, tasks, sprints, and reusable workflow templates.',
        notes: [
          'Most live AOPS invoke calls are owner-scoped and should include project or scope identifiers.',
          'Follow-up sugar candidates currently identified: board bootstrap, slice start, slice sync, slice close.',
        ],
      },
      resources: buildResourceDocs(operations),
      operations: Object.fromEntries(
        operations.map((operation) => [operation.operationId, toOperationDocs(operation)]),
      ),
    }
  }

  const operationPolicies: Record<string, ProjectmanOperationPolicy> = {}
  for (const operation of operations) {
    if (!operation.policy) continue
    operationPolicies[operation.operationId] = operation.policy
  }
  if (Object.keys(operationPolicies).length > 0) {
    manifest.policies = { operations: operationPolicies }
  }

  const schemaRefs = new Set<string>()
  for (const operation of manifest.capabilities.operations) {
    if (operation.inputSchemaRef) schemaRefs.add(operation.inputSchemaRef)
    if (operation.outputSchemaRef) schemaRefs.add(operation.outputSchemaRef)
  }

  if (schemaRefs.size > 0) {
    const inputSchemasByRef = new Map<string, JsonSchema>()
    for (const operation of operations) {
      const inputSchemaRef = resolveProjectmanSchemaRefName(operation.inputSchema)
      if (!inputSchemaRef) continue
      inputSchemasByRef.set(inputSchemaRef, buildInputSchemaForOperation(operation))
    }

    const schemas: Record<string, unknown> = {}
    for (const ref of schemaRefs) {
      const schema = inputSchemasByRef.get(ref) ?? getProjectmanContractSchema(ref)
      if (!schema) continue
      schemas[ref] = schema
    }
    if (Object.keys(schemas).length > 0) {
      manifest.contracts = { schemas }
    }
  }

  return manifest
}
