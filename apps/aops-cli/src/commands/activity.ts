import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  invokeHostedToolWithApiState,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  preferProjectNameBinding,
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
} from '../utils/project-context.js'
import {
  buildHostedSugarEnvelope,
  buildOperatorCookbook,
} from '../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import type { CliApiClientState } from '../utils/api.js'

type ActivitySourceKind = 'aops-cli' | 'desktop' | 'runner' | 'system'
type ActivityStatus = 'success' | 'error'

type ActivityContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
}

type ActivityListOptions = ActivityContextOptions & {
  sourceKind?: ActivitySourceKind
  sourceId?: string
  action?: string
  status?: ActivityStatus
  filterProjectId?: string
  limit?: string | number
  summary?: boolean
}

type ActivityGetOptions = ActivityContextOptions & {
  id?: string
  summary?: boolean
}

type ResolvedActivityContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
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

function toInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`${label} must be an integer.`)
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`)
  return parsed
}

function extractId(value: unknown): string | undefined {
  return normalizeNonEmpty(value)
}

function collectActivityArtifacts(result: unknown): Record<string, string> | undefined {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const activityItemId = extractId(root?.activityItemId) ?? extractId(root?.id)
  return activityItemId ? { activityItemId } : undefined
}

function jsonByteLength(value: unknown): number | undefined {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return undefined
  }
}

function summarizeText(value: unknown, maxLength = 240): string | undefined {
  const text = normalizeNonEmpty(value)
  if (!text) return undefined
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

function summarizeUnknown(value: unknown): Record<string, unknown> | undefined {
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

function summarizeRefs(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return summarizeUnknown(value)

  const types = Array.from(new Set(
    value
      .map((entry) => (isRecord(entry) ? normalizeNonEmpty(entry.type) : undefined))
      .filter((entry): entry is string => Boolean(entry)),
  )).sort()

  const preview = value.slice(0, 5).map((entry) => {
    if (!isRecord(entry)) return entry
    return compactPayload({
      type: normalizeNonEmpty(entry.type),
      id: normalizeNonEmpty(entry.id),
      label: summarizeText(entry.label, 80),
    })
  })

  return compactPayload({
    kind: 'array',
    length: value.length,
    types,
    preview,
    previewTruncated: value.length > preview.length ? true : undefined,
    bytes: jsonByteLength(value),
  })
}

function summarizeActivityRecord(value: unknown): unknown {
  if (!isRecord(value)) return value

  const summary = normalizeNonEmpty(value.summary)
  const summaryPreview = summarizeText(summary)

  return compactPayload({
    id: normalizeNonEmpty(value.id),
    scopeId: normalizeNonEmpty(value.scopeId),
    projectId: normalizeNonEmpty(value.projectId),
    sourceKind: normalizeNonEmpty(value.sourceKind),
    sourceId: normalizeNonEmpty(value.sourceId),
    action: normalizeNonEmpty(value.action),
    status: normalizeNonEmpty(value.status),
    summary: summaryPreview,
    summaryBytes: summary ? Buffer.byteLength(summary, 'utf8') : undefined,
    summaryTruncated: summary && summaryPreview !== summary ? true : undefined,
    refsSummary: summarizeRefs(value.refs),
    payloadSummary: summarizeUnknown(value.payload),
    metaSummary: summarizeUnknown(value.meta),
    createdAt: normalizeNonEmpty(value.createdAt),
    updatedAt: normalizeNonEmpty(value.updatedAt),
  })
}

function summarizeActivityListResult(result: unknown): unknown {
  if (Array.isArray(result)) return result.map(summarizeActivityRecord)

  if (isRecord(result) && Array.isArray(result.data)) {
    const data = result.data.map(summarizeActivityRecord)
    return {
      ...result,
      data,
      summary: {
        ...(isRecord(result.summary) ? result.summary : {}),
        mode: 'activity-list-summary',
        count: data.length,
        omitted: ['refs', 'payload', 'meta'],
        fullRecordHint: 'Use `aops-cli activity get --id <activity-id> --json` without --summary for full refs/payload/meta.',
      },
    }
  }

  return summarizeActivityRecord(result)
}

function summarizeActivityGetResult(result: unknown): unknown {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return {
      ...result,
      data: summarizeActivityRecord(result.data),
      summary: {
        ...(isRecord(result.summary) ? result.summary : {}),
        mode: 'activity-get-summary',
        omitted: ['refs', 'payload', 'meta'],
        fullRecordHint: 'Run without --summary for full refs/payload/meta.',
      },
    }
  }

  return summarizeActivityRecord(result)
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedActivityContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    ...preferProjectNameBinding(resolvedContext),
  }
}

async function hydrateProjectContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedActivityContext,
): Promise<ResolvedActivityContext> {
  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) return resolvedContext
  if (normalizeNonEmpty(options.scopeId)) return resolvedContext

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

async function resolveActivityContext(
  options: ActivityContextOptions,
  apiState: CliApiClientState,
): Promise<ResolvedActivityContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: false,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  return hydrateProjectContext(apiState, options, {
    ...resolved,
    scopeId,
  })
}

function buildResolvedContextRecord(context: ResolvedActivityContext): Record<string, unknown> {
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

function ensureActivityId(id: unknown, label = '--id'): string {
  const resolved = normalizeNonEmpty(id)
  if (!resolved) throw new Error(`Provide ${label}.`)
  return resolved
}

export async function runActivityList(options: ActivityListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveActivityContext(options, apiState)

    const input = {
      filter: compactPayload({
        scopeId: normalizeNonEmpty(resolvedContext.scopeId),
        scopeResolution: options.scopeResolution,
        projectId: normalizeNonEmpty(options.filterProjectId),
        sourceKind: normalizeNonEmpty(options.sourceKind),
        sourceId: normalizeNonEmpty(options.sourceId),
        action: normalizeNonEmpty(options.action),
        status: normalizeNonEmpty(options.status),
      }),
      options: compactPayload({
        limit: options.limit !== undefined ? toInteger(options.limit, '--limit') : undefined,
      }),
    }

    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.activity-item.list-activity-items',
      input,
    })
    const result = unwrapHostedToolResult(payload)
    const outputResult = options.summary ? summarizeActivityListResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'activity.list',
        toolId: 'agentspace.activity-item.list-activity-items',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Activity list loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runActivityGet(options: ActivityGetOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveActivityContext(options, apiState)
    const id = ensureActivityId(options.id)
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
      toolId: 'agentspace.activity-item.get-by-id',
      input,
    })
    const result = unwrapHostedToolResult(payload)
    const outputResult = options.summary ? summarizeActivityGetResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'activity.get',
        toolId: 'agentspace.activity-item.get-by-id',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        artifacts: collectActivityArtifacts(result),
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Activity item loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function applyActivityContextOptions(
  cmd: Command,
  params: {
    withScopeResolution?: boolean
  } = {},
): Command {
  applyCommonOptions(cmd)
  cmd.option('--project-id <id>', 'Project id used to resolve repo-bound activity ownership')
  cmd.option('--project-name <name>', 'Project name used to resolve repo-bound activity ownership')
  cmd.option('--scope-id <id>', 'Explicit scope id override for activity ownership')
  if (params.withScopeResolution) {
    cmd.option('--scope-resolution <mode>', 'Scope resolution policy: explicit or cascade')
  }
  return cmd
}

export function makeActivityCommand(): Command {
  const cmd = new Command('activity').description('Agentspace activity ledger read sugar over the hosted AOPS gateway')

  applyActivityContextOptions(
    cmd.command('list')
      .description('List activity ledger items')
      .option('--source-kind <kind>', 'Source kind filter: aops-cli, desktop, runner, system')
      .option('--source-id <id>', 'Source id filter')
      .option('--action <text>', 'Action filter')
      .option('--status <status>', 'Status filter: success or error')
      .option('--filter-project-id <id>', 'Activity projectId filter; separate from context --project-id')
      .option('--limit <n>', 'Optional item limit')
      .option('--summary', 'Print compact activity records and omit raw refs/payload/meta'),
    { withScopeResolution: true },
  ).action(async (options: ActivityListOptions) => {
    await runActivityList(options)
  })

  applyActivityContextOptions(
    cmd.command('get')
      .description('Get an activity ledger item by id')
      .requiredOption('--id <id>', 'Activity item id')
      .option('--summary', 'Omit raw refs/payload/meta and print compact size summaries'),
  ).action(async (options: ActivityGetOptions) => {
    await runActivityGet(options)
  })

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli activity list --summary --limit 20 --json',
        'aops-cli activity list --source-kind aops-cli --status success --summary --json',
        'aops-cli activity get --id <activity-id> --summary --json',
      ],
      guide: GUIDE_PATHS.agentspace,
      notes: [
        'Activity commands are read-only and do not require --apply.',
        'Use --summary for inventories because activity refs, payload, and meta can be large.',
        'Use `aops-cli agent tools --domain agentspace --q activity --summary --json` for raw hosted operations not covered by this sugar.',
      ],
    }),
  )

  return cmd
}
