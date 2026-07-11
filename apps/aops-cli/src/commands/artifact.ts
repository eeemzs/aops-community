import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  invokeHostedToolWithApiState,
  parseJsonInput,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
} from '../utils/project-context.js'
import {
  buildHostedSugarEnvelope,
  buildOperatorCookbook,
  ensureDestructiveWrite,
  ensureGuardedWrite,
  missingScopeIdMessage,
} from '../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import type { CliApiClientState } from '../utils/api.js'

type ArtifactType = 'file' | 'diff' | 'log' | 'report' | 'doc' | 'image' | 'dataset' | 'other'
type ArtifactRefType = 'task' | 'agent-run' | 'prompt-version' | 'skill-version' | 'resource' | 'other'

type ArtifactContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  projectId?: string
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
}

type GuardedWriteOptions = {
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type JsonSeedOptions = {
  input?: string
}

type ArtifactGetOptions = ArtifactContextOptions & {
  id?: string
  summary?: boolean
}

type ArtifactCreateOptions = ArtifactContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    artifactType?: ArtifactType
    storagePath?: string
    label?: string
    mimeType?: string
    sizeBytes?: string | number
    hash?: string
    meta?: string
  }

type ArtifactDeleteOptions = ArtifactContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type ArtifactLinkOptions = ArtifactContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    artifactId?: string
    refType?: ArtifactRefType
    refId?: string
  }

type ArtifactRefListOptions = ArtifactContextOptions & {
  refType?: ArtifactRefType
  refId?: string
  summary?: boolean
}

type ResolvedArtifactContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
  scopeId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unwrapResultData<T>(result: unknown): T | undefined {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return result.data as T
  }
  return result as T
}

function parseJsonSeed(input: unknown, label = '--input'): Record<string, unknown> {
  const normalized = normalizeNonEmpty(input)
  if (!normalized) return {}
  const parsed = parseJsonInput(normalized, label)
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object or @file.json object.`)
  return parsed
}

function parseUnknownJsonInput(input: unknown, label: string): unknown {
  const normalized = normalizeNonEmpty(input)
  if (!normalized) return undefined
  return parseJsonInput(normalized, label)
}

function resolveStringField(explicit: unknown, seed: Record<string, unknown>, key: string): string | undefined {
  return normalizeNonEmpty(explicit) ?? normalizeNonEmpty(seed[key])
}

function resolveUnknownField(explicit: unknown, seed: Record<string, unknown>, key: string, label: string): unknown {
  const explicitValue = parseUnknownJsonInput(explicit, label)
  if (explicitValue !== undefined) return explicitValue
  return seed[key]
}

function toInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`${label} must be an integer.`)
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`)
  return parsed
}

function resolveIntegerField(explicit: unknown, seed: Record<string, unknown>, key: string, label: string): number | undefined {
  if (explicit !== undefined && explicit !== null && explicit !== '') return toInteger(explicit, label)
  if (seed[key] !== undefined && seed[key] !== null && seed[key] !== '') return toInteger(seed[key], label)
  return undefined
}

function extractId(value: unknown): string | undefined {
  return normalizeNonEmpty(value)
}

function collectArtifactArtifacts(result: unknown): Record<string, string> | undefined {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const artifacts: Record<string, string> = {}
  const push = (key: string, value: unknown) => {
    const normalized = extractId(value)
    if (normalized) artifacts[key] = normalized
  }

  push('artifactId', root.artifactId)
  if (!artifacts.artifactId) push('artifactId', root.id)
  push('artifactLinkId', root.artifactLinkId)
  if (!artifacts.artifactLinkId && normalizeNonEmpty(root.artifactId)) push('artifactLinkId', root.id)

  return Object.keys(artifacts).length > 0 ? artifacts : undefined
}

function jsonByteLength(value: unknown): number | undefined {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return undefined
  }
}

function summarizeText(value: unknown, maxLength = 180): string | undefined {
  const text = normalizeNonEmpty(value)
  if (!text) return undefined
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

function summarizeMeta(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  if (isRecord(value)) {
    const keys = Object.keys(value).sort()
    return compactPayload({
      kind: 'object',
      keyCount: keys.length,
      keys,
      bytes: jsonByteLength(value),
    })
  }
  if (Array.isArray(value)) {
    return compactPayload({
      kind: 'array',
      length: value.length,
      bytes: jsonByteLength(value),
    })
  }
  return compactPayload({
    kind: value === null ? 'null' : typeof value,
    bytes: jsonByteLength(value),
    preview: summarizeText(value, 80),
  })
}

function summarizeArtifactRecord(value: unknown): unknown {
  if (!isRecord(value)) return value

  return compactPayload({
    id: normalizeNonEmpty(value.id),
    scopeId: normalizeNonEmpty(value.scopeId),
    artifactType: normalizeNonEmpty(value.artifactType),
    label: summarizeText(value.label),
    storagePath: normalizeNonEmpty(value.storagePath),
    mimeType: normalizeNonEmpty(value.mimeType),
    sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : undefined,
    hash: normalizeNonEmpty(value.hash),
    metaSummary: summarizeMeta(value.meta),
    createdAt: normalizeNonEmpty(value.createdAt),
    updatedAt: normalizeNonEmpty(value.updatedAt),
  })
}

function summarizeArtifactGetResult(result: unknown): unknown {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return {
      ...result,
      data: summarizeArtifactRecord(result.data),
      summary: {
        ...(isRecord(result.summary) ? result.summary : {}),
        mode: 'artifact-get-summary',
        omitted: ['meta'],
        fullRecordHint: 'Use `aops-cli artifact get --id <artifact-id> --json` without --summary for full metadata.',
      },
    }
  }

  return summarizeArtifactRecord(result)
}

function summarizeArtifactRefListResult(result: unknown): unknown {
  if (Array.isArray(result)) return result.map(summarizeArtifactRecord)

  if (isRecord(result) && Array.isArray(result.data)) {
    const data = result.data.map(summarizeArtifactRecord)
    return {
      ...result,
      data,
      summary: {
        ...(isRecord(result.summary) ? result.summary : {}),
        mode: 'artifact-ref-list-summary',
        count: data.length,
        omitted: ['meta'],
        fullRecordHint: 'Use `aops-cli artifact get --id <artifact-id> --json` for full metadata.',
      },
    }
  }

  return summarizeArtifactGetResult(result)
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedArtifactContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId),
    projectName: normalizeNonEmpty(options.projectName) ?? normalizeNonEmpty(resolvedContext.projectName),
  }
}

async function hydrateProjectContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedArtifactContext,
): Promise<ResolvedArtifactContext> {
  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) return resolvedContext
  if (normalizeNonEmpty(resolvedContext.scopeId) === projectId && normalizeNonEmpty(resolvedContext.projectName)) {
    return resolvedContext
  }

  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: 'agentspace.project.get-by-id',
    input: { id: projectId },
  })
  const result = unwrapHostedToolResult(payload)
  const project = unwrapResultData<Record<string, unknown>>(result)
  if (!isRecord(project)) return resolvedContext

  const scopeId = resolveOwnerScopeIdFromProjectRecord(project, resolvedContext.scopeId)
  const projectName = normalizeNonEmpty(project.name) ?? resolvedContext.projectName

  return {
    ...resolvedContext,
    scopeId,
    projectName,
  }
}

async function resolveArtifactContext(
  options: ArtifactContextOptions,
  apiState: CliApiClientState,
): Promise<ResolvedArtifactContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: false,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  return hydrateProjectContext(apiState, options, {
    ...resolved,
    scopeId,
  })
}

function buildResolvedContextRecord(context: ResolvedArtifactContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
  })
}

const buildEnvelope = buildHostedSugarEnvelope

function ensureArtifactId(id: unknown, label = '--id'): string {
  const resolved = normalizeNonEmpty(id)
  if (!resolved) throw new Error(`Provide ${label}.`)
  return resolved
}

function requireScopeId(context: ResolvedArtifactContext, seed: Record<string, unknown>): string {
  const scopeId = normalizeNonEmpty(context.scopeId) ?? normalizeNonEmpty(seed.scopeId)
  if (!scopeId) {
    throw new Error(missingScopeIdMessage('Artifact create'))
  }
  return scopeId
}

function requireProjectId(context: ResolvedArtifactContext, seed: Record<string, unknown>): string {
  const projectId =
    normalizeNonEmpty(context.projectId) ??
    normalizeNonEmpty(seed.projectId)
  if (!projectId) {
    throw new Error('Artifact link requires repo-bound project context or --project-id / input.projectId.')
  }
  return projectId
}

async function invokeArtifactTool(
  apiState: CliApiClientState,
  options: ArtifactContextOptions & GuardedWriteOptions,
  resolvedContext: ResolvedArtifactContext,
  params: {
    command: string
    toolId: string
    input: Record<string, unknown>
    successText: string
  },
): Promise<void> {
  ensureGuardedWrite(options, 'This command mutates hosted artifact state.')
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: params.toolId,
    input: params.input,
    preview: options.preview,
    apply: options.apply,
    confirm: options.confirm,
    idempotencyKey: options.idempotencyKey,
  })
  const result = unwrapHostedToolResult(payload)

  if (options.json) {
    console.log(JSON.stringify(buildEnvelope({
      command: params.command,
      toolId: params.toolId,
      resolvedContext: buildResolvedContextRecord(resolvedContext),
      input: params.input,
      artifacts: collectArtifactArtifacts(result),
      result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(result, null, 2))
}

export async function runArtifactGet(options: ArtifactGetOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveArtifactContext(options, apiState)
    const id = ensureArtifactId(options.id)
    const input = { id }
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.artifact.get-artifact',
      input,
    })
    const result = unwrapHostedToolResult(payload)
    const outputResult = options.summary ? summarizeArtifactGetResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'artifact.get',
        toolId: 'agentspace.artifact.get-artifact',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        artifacts: collectArtifactArtifacts(result),
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Artifact loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runArtifactCreate(options: ArtifactCreateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveArtifactContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const artifactType = resolveStringField(options.artifactType, seed, 'artifactType')
    const storagePath = resolveStringField(options.storagePath, seed, 'storagePath')
    if (!artifactType) throw new Error('Artifact create requires --artifact-type or input.artifactType.')
    if (!storagePath) throw new Error('Artifact create requires --storage-path or input.storagePath.')
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed),
        artifactType,
        storagePath,
        label: resolveStringField(options.label, seed, 'label'),
        mimeType: resolveStringField(options.mimeType, seed, 'mimeType'),
        sizeBytes: resolveIntegerField(options.sizeBytes, seed, 'sizeBytes', '--size-bytes'),
        hash: resolveStringField(options.hash, seed, 'hash'),
        meta: resolveUnknownField(options.meta, seed, 'meta', '--meta'),
      }),
    }

    await invokeArtifactTool(apiState, options, resolvedContext, {
      command: 'artifact.create',
      toolId: 'agentspace.artifact.store-artifact',
      input,
      successText: 'Artifact created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runArtifactDelete(options: ArtifactDeleteOptions = {}): Promise<void> {
  try {
    ensureDestructiveWrite(options, 'This command deletes hosted artifacts.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveArtifactContext(options, apiState)
    const id = ensureArtifactId(options.id)
    const input = { id }
    await invokeArtifactTool(apiState, options, resolvedContext, {
      command: 'artifact.delete',
      toolId: 'agentspace.artifact.remove-artifact',
      input,
      successText: 'Artifact deleted.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runArtifactLink(options: ArtifactLinkOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveArtifactContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const artifactId = resolveStringField(options.artifactId, seed, 'artifactId')
    const refType = resolveStringField(options.refType, seed, 'refType')
    const refId = resolveStringField(options.refId, seed, 'refId')
    if (!artifactId) throw new Error('Artifact link requires --artifact-id or input.artifactId.')
    if (!refType) throw new Error('Artifact link requires --ref-type or input.refType.')
    if (!refId) throw new Error('Artifact link requires --ref-id or input.refId.')
    const input = {
      data: compactPayload({
        projectId: requireProjectId({
          ...resolvedContext,
          projectId: normalizeNonEmpty(options.projectId) ?? resolvedContext.projectId,
        }, seed),
        artifactId,
        refType,
        refId,
        createdBy: resolveStringField(undefined, seed, 'createdBy'),
      }),
    }

    await invokeArtifactTool(apiState, options, resolvedContext, {
      command: 'artifact.link',
      toolId: 'agentspace.artifact.link-artifact',
      input,
      successText: 'Artifact linked.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runArtifactRefList(options: ArtifactRefListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveArtifactContext(options, apiState)
    const refType = ensureArtifactId(options.refType, '--ref-type')
    const refId = ensureArtifactId(options.refId, '--ref-id')
    const input = compactPayload({
      refType,
      refId,
      scopeId: normalizeNonEmpty(options.scopeId) ?? normalizeNonEmpty(resolvedContext.scopeId),
      scopeResolution: options.scopeResolution,
    })
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.artifact.list-artifacts-by-ref',
      input,
    })
    const result = unwrapHostedToolResult(payload)
    const outputResult = options.summary ? summarizeArtifactRefListResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'artifact.ref.list',
        toolId: 'agentspace.artifact.list-artifacts-by-ref',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Artifact ref list loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function applyArtifactContextOptions(
  cmd: Command,
  params: {
    withScopeResolution?: boolean
  } = {},
): Command {
  applyCommonOptions(cmd)
  cmd.option('--project-id <id>', 'Project id used to resolve repo-bound artifact ownership or linking')
  cmd.option('--project-name <name>', 'Project name used to resolve repo-bound artifact ownership')
  cmd.option('--scope-id <id>', 'Explicit scope id override for artifact ownership')
  if (params.withScopeResolution) {
    cmd.option('--scope-resolution <mode>', 'Scope resolution policy: explicit or cascade')
  }
  return cmd
}

function applyWriteGuards(cmd: Command, params: { destructive?: boolean } = {}): Command {
  cmd.option('--preview', 'Return a validated preflight summary without executing the tool')
  cmd.option('--apply', 'Execute the hosted write operation')
  if (params.destructive) {
    cmd.option('--confirm', 'Required with --apply for destructive deletes')
  }
  cmd.option('--idempotency-key <key>', 'Optional idempotency key for hosted writes')
  return cmd
}

function applyJsonSeedOption(cmd: Command): Command {
  cmd.option('--input <jsonOrFile>', 'Optional JSON object seed or @file.json')
  return cmd
}

export function makeArtifactCommand(): Command {
  const cmd = new Command('artifact').description('Agentspace artifact sugar commands over the hosted AOPS gateway')

  applyArtifactContextOptions(
    cmd.command('get')
      .description('Get an artifact by id')
      .requiredOption('--id <id>', 'Artifact id')
      .option('--summary', 'Omit raw artifact meta and print metadata size summary'),
  ).action(async (options: ArtifactGetOptions) => {
    await runArtifactGet(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyArtifactContextOptions(
    cmd.command('create')
      .description('Create a scope-owned artifact shell')
      .requiredOption('--artifact-type <type>', 'Artifact type')
      .requiredOption('--storage-path <path>', 'Artifact storage path')
      .option('--label <text>', 'Artifact label')
      .option('--mime-type <text>', 'Artifact mime type')
      .option('--size-bytes <n>', 'Artifact byte size')
      .option('--hash <text>', 'Artifact hash')
      .option('--meta <jsonOrFile>', 'JSON meta object/array/value or @file.json'),
  ))).action(async (options: ArtifactCreateOptions) => {
    await runArtifactCreate(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyArtifactContextOptions(
    cmd.command('link')
      .description('Link an artifact to a project-scoped ref')
      .requiredOption('--artifact-id <id>', 'Artifact id')
      .requiredOption('--ref-type <type>', 'Ref type')
      .requiredOption('--ref-id <id>', 'Ref id'),
  ))).action(async (options: ArtifactLinkOptions) => {
    await runArtifactLink(options)
  })

  const ref = cmd.command('ref').description('Artifact ref lookup commands')
  applyArtifactContextOptions(
    ref.command('list')
      .description('List artifacts linked to a ref')
      .requiredOption('--ref-type <type>', 'Ref type')
      .requiredOption('--ref-id <id>', 'Ref id')
      .option('--summary', 'Print compact artifact records and omit raw meta payloads'),
    { withScopeResolution: true },
  ).action(async (options: ArtifactRefListOptions) => {
    await runArtifactRefList(options)
  })

  applyWriteGuards(applyArtifactContextOptions(
    cmd.command('delete')
      .description('Delete an artifact')
      .requiredOption('--id <id>', 'Artifact id'),
  ), { destructive: true }).action(async (options: ArtifactDeleteOptions) => {
    await runArtifactDelete(options)
  })

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli artifact create --artifact-type file --storage-path s3://bucket/report.json --apply --json',
        'aops-cli artifact link --artifact-id <artifact-id> --ref-type resource --ref-id <resource-id> --apply --json',
        'aops-cli artifact ref list --ref-type resource --ref-id <resource-id> --summary --json',
        'aops-cli artifact get --id <artifact-id> --summary --json',
        'aops-cli artifact delete --id <artifact-id> --apply --confirm --json',
      ],
      guide: GUIDE_PATHS.agentspace,
      notes: ['Artifact get/ref list are curated read surfaces and do not require --apply; use --summary unless you need full meta.'],
    }),
  )

  return cmd
}
