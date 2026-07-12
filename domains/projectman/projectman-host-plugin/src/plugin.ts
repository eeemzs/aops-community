import { buildOperationInputJsonSchema } from '@aopslab/xf-validation'

import type { DomainPlugin, DomainRequest, DomainRouteManifestEntry } from './types.js'
import {
  buildProjectmanHostRouteProjection,
  ensureProjectmanSqliteSchemaReady,
  getProjectmanKitEnvConfig,
  getProjectmanToolInputSchema,
  listProjectmanOperationSpecs,
  parseProjectmanToolInput,
  runProjectmanKitOperationByTypedId,
  type ProjectmanOperationInput,
  type ProjectmanOperationOutput,
  type ProjectmanTypedOperationId,
} from '@aopslab/domain-kit-projectman'

const DEFAULT_PROJECTMAN_PROJECT_ID = '123e4567-e89b-41d4-a000-000000000000'

type ProjectmanRunner = <TId extends ProjectmanTypedOperationId>(
  operationId: TId,
  input: ProjectmanOperationInput<TId>,
) => Promise<ProjectmanOperationOutput<TId>>

export type ProjectmanPluginOptions = {
  runner?: ProjectmanRunner
  defaultProjectId?: string
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function ensureProjectmanHostStorageReady(): void {
  const envConfig = getProjectmanKitEnvConfig()
  const repoUrls = new Set<string>([
    envConfig.kanbanBoardRepoUrl,
    envConfig.kanbanColumnRepoUrl,
    envConfig.kanbanBoardColumnRepoUrl,
    envConfig.kanbanTaskRepoUrl,
    envConfig.sprintRepoUrl,
    envConfig.sprintGroupRepoUrl,
    envConfig.microTaskItemRepoUrl,
    envConfig.issueItemRepoUrl,
    envConfig.feedbackItemRepoUrl,
    envConfig.reviewRequestRepoUrl,
    envConfig.historyRepoUrl,
    envConfig.sprintKanbanTaskRepoUrl,
    envConfig.kanbanTemplateRepoUrl,
    envConfig.projectmanEventRepoUrl,
  ])

  for (const repoUrl of repoUrls) {
    ensureProjectmanSqliteSchemaReady(repoUrl)
  }
}

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function isProjectmanTypedOperationId(
  operationId: string,
  operationArgsById: Map<ProjectmanTypedOperationId, ReadonlyArray<{ name: string; optional: boolean }>>,
): operationId is ProjectmanTypedOperationId {
  return operationArgsById.has(operationId as ProjectmanTypedOperationId)
}

function toTypedOperationInput<TId extends ProjectmanTypedOperationId>(
  operationId: TId,
  input: Record<string, unknown>,
): ProjectmanOperationInput<TId> {
  return parseProjectmanToolInput(operationId, input)
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return value
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}

function buildQueryPayload(query: URLSearchParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, rawValue] of query.entries()) {
    payload[key] = parseMaybeJson(rawValue)
  }
  return payload
}

function payloadFromBody(body: unknown): Record<string, unknown> {
  return toRecord(body)
}

function buildInputForOperation(
  _operationId: ProjectmanTypedOperationId,
  request: DomainRequest,
  params: Record<string, string>,
): Record<string, unknown> {
  const query = buildQueryPayload(request.query)
  const body = payloadFromBody(request.body)
  const payload: Record<string, unknown> = {
    ...query,
    ...body,
  }
  if (params.id && payload.id === undefined) payload.id = params.id
  return payload
}

function buildProjectmanRoutes(): DomainRouteManifestEntry[] {
  return buildProjectmanHostRouteProjection({ refresh: true }).map((route) => {
    const inputJsonSchema = buildOperationInputJsonSchema(
      getProjectmanToolInputSchema(route.operation as ProjectmanTypedOperationId),
    )
    return {
      id: route.id,
      method: route.method,
      pattern: route.pattern,
      operation: route.operation,
      summary: route.summary,
      ...(inputJsonSchema ? { inputJsonSchema } : {}),
      buildInput: (request, params) => buildInputForOperation(route.operation as ProjectmanTypedOperationId, request, params),
    }
  })
}

function resolveRunner(options: ProjectmanPluginOptions): ProjectmanRunner {
  const defaultRunner: ProjectmanRunner = <TId extends ProjectmanTypedOperationId>(
    operationId: TId,
    input: ProjectmanOperationInput<TId>,
  ) => runProjectmanKitOperationByTypedId(operationId, input)
  return options.runner ?? defaultRunner
}

export function createProjectmanPlugin(options: ProjectmanPluginOptions = {}): DomainPlugin {
  ensureProjectmanHostStorageReady()
  const routes = buildProjectmanRoutes()
  const operations = listProjectmanOperationSpecs({ refresh: true })
  const operationArgsById = new Map<ProjectmanTypedOperationId, ReadonlyArray<{ name: string; optional: boolean }>>(
    operations.map((operation) => [operation.operationId as ProjectmanTypedOperationId, operation.args]),
  )
  const runner = resolveRunner(options)
  const defaultProjectId =
    normalizeNonEmptyString(options.defaultProjectId)
    ?? normalizeNonEmptyString(process.env.PROJECTMAN_PROJECT_ID)
    ?? normalizeNonEmptyString(process.env.PROJECTMAN_SCOPE_ID)
    ?? DEFAULT_PROJECTMAN_PROJECT_ID

  return {
    contract: 'v1',
    domain: 'projectman',
    version: 'v1',
    capabilities: ['kanban', 'sprint', 'issue', 'feedback', 'review-request', 'event', 'manifest-driven-routing', 'dcm-first'],
    manifest: {
      domain: 'projectman',
      version: 'v1',
      routes,
      meta: {
        adapter: 'projectman-kit-operation-runner',
        runner: options.runner ? 'custom' : '@aopslab/domain-kit-projectman#runProjectmanKitOperationByTypedId',
        routeProjection: '@aopslab/domain-kit-projectman#buildProjectmanHostRouteProjection',
        operationCatalog: '@aopslab/domain-kit-projectman#listProjectmanOperationSpecs',
      },
    },
    health: async () => {
      return {
        ok: true,
        details: {
          runner: options.runner ? 'custom' : '@aopslab/domain-kit-projectman#runProjectmanKitOperationByTypedId',
          routes: routes.length,
          operations: operations.length,
        },
      }
    },
    execute: async ({ request, match }) => {
      const operationIdRaw = match.route.operation
      if (!isProjectmanTypedOperationId(operationIdRaw, operationArgsById)) {
        throw new Error(`unknown_projectman_operation:${operationIdRaw}`)
      }
      const operationId = operationIdRaw

      const inputBase = match.route.buildInput ? match.route.buildInput(request, match.params) : {}
      const scopeId =
        typeof request.context.scopeId === 'string' && request.context.scopeId.trim().length > 0
          ? request.context.scopeId
          : typeof request.context.projectId === 'string' && request.context.projectId.trim().length > 0
            ? request.context.projectId
            : defaultProjectId

      const input = {
        ...inputBase,
        scopeId,
      }

      const typedInput = toTypedOperationInput(operationId, input)
      return runner(operationId, typedInput)
    },
  }
}
