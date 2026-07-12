import { existsSync, lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'

export const AOPS_PG_BOOTSTRAP_OPERATIONS = ['push', 'generate', 'migrate'] as const

export type AopsPgBootstrapOperation = (typeof AOPS_PG_BOOTSTRAP_OPERATIONS)[number]

export type AopsPgBootstrapManifestTargetV1 = Readonly<{
  id: string
  adapterId: string
  resource: string
  operations: readonly AopsPgBootstrapOperation[]
}>

export type AopsPgBootstrapManifestV1 = Readonly<{
  schemaVersion: 1
  targets: readonly AopsPgBootstrapManifestTargetV1[]
}>

export type AopsPgBootstrapAdapterContext = Readonly<{
  target: AopsPgBootstrapManifestTargetV1
  operation: AopsPgBootstrapOperation
  resourcePath: string
  resourceRoot: string
  workspaceRoot: string
  repoUrl?: string
  logs: string[]
}>

export type AopsPgBootstrapAdapter = Readonly<{
  id: string
  run: (context: AopsPgBootstrapAdapterContext) => Promise<void>
}>

export type AopsPgBootstrapExecution = Readonly<{
  targetId: string
  operation: AopsPgBootstrapOperation
  resourcePath: string
  adapterId: string
}>

const operationSet = new Set<string>(AOPS_PG_BOOTSTRAP_OPERATIONS)

function assertExactKeys(label: string, value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || !actual.every((key, index) => key === wanted[index])) {
    throw new Error(`${label}_unknown_or_missing_fields:expected=${wanted.join(',')}:actual=${actual.join(',')}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateResource(value: unknown, targetId: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`aops_pg_bootstrap_manifest_resource_invalid:${targetId}`)
  }
  if (value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new Error(`aops_pg_bootstrap_manifest_resource_escape:${targetId}:${value}`)
  }
  const normalized = path.posix.normalize(value)
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`aops_pg_bootstrap_manifest_resource_escape:${targetId}:${value}`)
  }
  return value
}

export function validateAopsPgBootstrapManifest(manifest: unknown): asserts manifest is AopsPgBootstrapManifestV1 {
  if (!isRecord(manifest)) {
    throw new Error('aops_pg_bootstrap_manifest_not_object')
  }
  assertExactKeys('aops_pg_bootstrap_manifest', manifest, ['schemaVersion', 'targets'])
  if (manifest.schemaVersion !== 1) {
    throw new Error(`aops_pg_bootstrap_manifest_schema_unsupported:${String(manifest.schemaVersion)}`)
  }
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) {
    throw new Error('aops_pg_bootstrap_manifest_targets_empty')
  }

  const targetIds = new Set<string>()
  for (const rawTarget of manifest.targets) {
    if (!isRecord(rawTarget)) {
      throw new Error('aops_pg_bootstrap_manifest_target_not_object')
    }
    assertExactKeys('aops_pg_bootstrap_manifest_target', rawTarget, ['id', 'adapterId', 'resource', 'operations'])
    const id = rawTarget.id
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new Error(`aops_pg_bootstrap_manifest_target_id_invalid:${String(id)}`)
    }
    if (targetIds.has(id)) {
      throw new Error(`aops_pg_bootstrap_manifest_target_duplicate:${id}`)
    }
    targetIds.add(id)
    if (typeof rawTarget.adapterId !== 'string' || !/^[a-z][a-z0-9-]*$/.test(rawTarget.adapterId)) {
      throw new Error(`aops_pg_bootstrap_manifest_adapter_id_invalid:${id}:${String(rawTarget.adapterId)}`)
    }
    validateResource(rawTarget.resource, id)
    if (!Array.isArray(rawTarget.operations) || rawTarget.operations.length === 0) {
      throw new Error(`aops_pg_bootstrap_manifest_operations_empty:${id}`)
    }
    const operations = new Set<string>()
    for (const operation of rawTarget.operations) {
      if (typeof operation !== 'string' || !operationSet.has(operation)) {
        throw new Error(`aops_pg_bootstrap_manifest_operation_unknown:${id}:${String(operation)}`)
      }
      if (operations.has(operation)) {
        throw new Error(`aops_pg_bootstrap_manifest_operation_duplicate:${id}:${operation}`)
      }
      operations.add(operation)
    }
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function resolveAopsPgBootstrapResource(resourceRoot: string, resource: string): string {
  validateResource(resource, 'resource')
  const root = path.resolve(resourceRoot)
  if (!existsSync(root)) {
    throw new Error(`aops_pg_bootstrap_resource_root_missing:${root}`)
  }
  const rootStats = lstatSync(root)
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`aops_pg_bootstrap_resource_root_unsafe:${root}`)
  }
  const realRoot = realpathSync(root)
  const candidate = path.resolve(root, ...resource.split('/'))
  if (!isWithin(root, candidate)) {
    throw new Error(`aops_pg_bootstrap_resource_escape:${resource}`)
  }

  let cursor = root
  for (const segment of resource.split('/')) {
    cursor = path.join(cursor, segment)
    if (!existsSync(cursor)) {
      throw new Error(`aops_pg_bootstrap_resource_missing:${cursor}`)
    }
    const stats = lstatSync(cursor)
    if (stats.isSymbolicLink()) {
      throw new Error(`aops_pg_bootstrap_resource_reparse_refused:${cursor}`)
    }
    const realCursor = realpathSync(cursor)
    if (!isWithin(realRoot, realCursor)) {
      throw new Error(`aops_pg_bootstrap_resource_real_escape:${cursor}:${realCursor}`)
    }
  }
  return candidate
}

export async function runAopsPgBootstrapManifest(params: {
  manifest: AopsPgBootstrapManifestV1
  adapters: readonly AopsPgBootstrapAdapter[]
  operation: AopsPgBootstrapOperation
  targetIds: readonly string[]
  resourceRoot: string
  workspaceRoot?: string
  repoUrl?: string
  logs?: string[]
}): Promise<AopsPgBootstrapExecution[]> {
  validateAopsPgBootstrapManifest(params.manifest)
  if (!operationSet.has(params.operation)) {
    throw new Error(`aops_pg_bootstrap_operation_unknown:${String(params.operation)}`)
  }
  if (!Array.isArray(params.targetIds) || params.targetIds.length === 0) {
    throw new Error('aops_pg_bootstrap_target_selection_empty')
  }

  const targets = new Map(params.manifest.targets.map((target) => [target.id, target]))
  const manifestAdapterIds = new Set(params.manifest.targets.map((target) => target.adapterId))
  const adapters = new Map<string, AopsPgBootstrapAdapter>()
  for (const adapter of params.adapters) {
    if (!adapter || typeof adapter.id !== 'string' || typeof adapter.run !== 'function') {
      throw new Error('aops_pg_bootstrap_adapter_invalid')
    }
    if (!manifestAdapterIds.has(adapter.id)) {
      throw new Error(`aops_pg_bootstrap_adapter_unknown:${adapter.id}`)
    }
    if (adapters.has(adapter.id)) {
      throw new Error(`aops_pg_bootstrap_adapter_duplicate:${adapter.id}`)
    }
    adapters.set(adapter.id, adapter)
  }

  const selected = new Set<string>()
  const logs = params.logs ?? []
  const workspaceRoot = path.resolve(params.workspaceRoot ?? params.resourceRoot)
  const preflight: Array<{
    target: AopsPgBootstrapManifestTargetV1
    adapter: AopsPgBootstrapAdapter
    resourcePath: string
  }> = []
  for (const targetId of params.targetIds) {
    if (selected.has(targetId)) {
      throw new Error(`aops_pg_bootstrap_target_selection_duplicate:${targetId}`)
    }
    selected.add(targetId)
    const target = targets.get(targetId)
    if (!target) {
      throw new Error(`aops_pg_bootstrap_target_unknown:${targetId}`)
    }
    if (!target.operations.includes(params.operation)) {
      throw new Error(`aops_pg_bootstrap_operation_not_allowed:${targetId}:${params.operation}`)
    }
    const adapter = adapters.get(target.adapterId)
    if (!adapter) {
      throw new Error(`aops_pg_bootstrap_adapter_missing:${targetId}:${target.adapterId}`)
    }
    const resourcePath = resolveAopsPgBootstrapResource(params.resourceRoot, target.resource)
    preflight.push({ target, adapter, resourcePath })
  }

  const executions: AopsPgBootstrapExecution[] = []
  for (const { target, adapter, resourcePath } of preflight) {
    await adapter.run({
      target,
      operation: params.operation,
      resourcePath,
      resourceRoot: path.resolve(params.resourceRoot),
      workspaceRoot,
      repoUrl: params.repoUrl,
      logs,
    })
    executions.push({
      targetId: target.id,
      operation: params.operation,
      resourcePath,
      adapterId: adapter.id,
    })
  }
  return executions
}

function freezeManifest(manifest: AopsPgBootstrapManifestV1): AopsPgBootstrapManifestV1 {
  for (const target of manifest.targets) {
    Object.freeze(target.operations)
    Object.freeze(target)
  }
  Object.freeze(manifest.targets)
  return Object.freeze(manifest)
}

export const AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1 = freezeManifest({
  schemaVersion: 1,
  targets: [
    {
      id: 'aops',
      adapterId: 'workspace-drizzle',
      resource: 'apps/aops-server/drizzle.aops.config.ts',
      operations: ['push', 'generate', 'migrate'],
    },
    {
      id: 'auth',
      adapterId: 'authv2',
      resource: 'apps/aops-server/drizzle.authv2.config.ts',
      operations: ['push'],
    },
  ],
})

export const AOPS_COMMUNITY_PG_BOOTSTRAP_MANIFEST_V1 = freezeManifest({
  schemaVersion: 1,
  targets: [
    {
      id: 'agentspace',
      adapterId: 'sql-migrations',
      resource: 'drizzle-out/agentspace-community',
      operations: ['migrate'],
    },
  ],
})
