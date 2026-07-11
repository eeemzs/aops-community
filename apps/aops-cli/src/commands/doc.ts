import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'
import { logError, logInfo, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  appendCliDurableActivityLogBestEffort,
  buildAgentContextHeaders,
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
  ensureDestructiveWrite,
  ensureGuardedWrite,
} from '../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import { probeCliRuntimeMode, type CliApiClientState } from '../utils/api.js'
import { parseFrontmatterDocument } from '../utils/memory-workspace.js'

type DocContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  scopeId?: string
}

type JsonObjectInputOptions = {
  input?: string
}

type GuardedWriteOptions = {
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type DocListOptions = DocContextOptions & {
  status?: string
  slug?: string
  title?: string
  groupId?: string
  groupUid?: string
  limit?: string | number
}

type DocGroupListOptions = DocContextOptions & {
  title?: string
  groupUid?: string
  parentGroupId?: string
  parentGroupUid?: string
  limit?: string | number
}

type DocGroupGetOptions = DocContextOptions & {
  id?: string
}

type DocGroupCreateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
	    title?: string
	    groupUid?: string
	    parentGroupId?: string
	    parentGroupUid?: string
	  }

type DocGroupUpdateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    id?: string
    title?: string
	    groupUid?: string
	    parentGroupId?: string
	    parentGroupUid?: string
	  }

type DocGroupDeleteOptions = DocContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type DocGetOptions = DocContextOptions & {
  id?: string
}

type DocCreateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    title?: string
    documentUid?: string
    slug?: string
    summary?: string
    description?: string
    status?: 'draft' | 'published' | 'archived'
    visibility?: 'public' | 'private' | 'internal'
    groupId?: string
    groupUid?: string
    tag?: string[]
  }

type DocUpdateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    id?: string
    title?: string
    slug?: string
    summary?: string
    description?: string
    status?: 'draft' | 'published' | 'archived'
    visibility?: 'public' | 'private' | 'internal'
    groupId?: string
    groupUid?: string
    tag?: string[]
  }

type DocVersionCreateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    documentId?: string
    version?: string | number
    label?: string
    title?: string
    summary?: string
    releaseNotes?: string
    status?: 'draft' | 'published' | 'archived'
    initMode?: 'clean' | 'clone_all' | 'clone_selected'
    sourceVersionId?: string
    sourceSectionLinkId?: string[]
  }

type DocVersionUpdateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    id?: string
    status?: 'draft' | 'published' | 'archived'
    title?: string
    summary?: string
    releaseNotes?: string
    label?: string
  }

type DocSetCurrentVersionOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    documentId?: string
    versionId?: string
    publish?: boolean | string
    publishNow?: boolean
    publishedAt?: string
    expectedPreviousVersionId?: string
  }

type DocSectionCreateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    title?: string
    sectionUid?: string
    slug?: string
    documentVersionId?: string
    parentLinkId?: string
    titleOverride?: string
    numbering?: string
    position?: string | number
  }

type DocSectionUpdateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    id?: string
    title?: string
    slug?: string
  }

type DocSectionCopyOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    sourceSectionId?: string
    targetDocumentVersionId?: string
    parentLinkId?: string
    position?: string | number
    rename?: string
    reusePages?: boolean
    clonePages?: boolean
  }

type DocSectionUnlinkOptions = DocContextOptions &
  GuardedWriteOptions & {
    linkId?: string
  }

type DocPageCreateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    title?: string
    pageUid?: string
    documentVersionId?: string
    sectionId?: string
    parentLinkId?: string
    format?: 'md' | 'mdx'
    content?: string
  }

type DocPageUpdateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    id?: string
    title?: string
  }

type DocPageCopyOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    sourcePageId?: string
    sourcePageVersionId?: string
    targetSectionId?: string
    position?: string | number
    rename?: string
    reusePage?: boolean
    clonePage?: boolean
  }

type DocPageMoveOptions = DocContextOptions &
  GuardedWriteOptions & {
    linkId?: string
    targetSectionId?: string
    position?: string | number
  }

type DocPageUnlinkOptions = DocContextOptions &
  GuardedWriteOptions & {
    linkId?: string
  }

type DocPageDraftSaveOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    pageVersionId?: string
    documentLinkId?: string
    pageId?: string
    title?: string
    format?: 'md' | 'mdx'
    content?: string
    status?: 'draft' | 'published' | 'archived'
  }

type DocLinkSectionOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    documentVersionId?: string
    sectionId?: string
    parentLinkId?: string
    position?: string | number
    titleOverride?: string
    numbering?: string
  }

type DocLinkPageOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    sectionId?: string
    pageVersionId?: string
    pageId?: string
    position?: string | number
    titleOverride?: string
    numbering?: string
  }

type DocOrderSectionsOptions = DocContextOptions &
  GuardedWriteOptions & {
    documentVersionId?: string
    update?: string[]
    input?: string
  }

type DocOrderPagesOptions = DocContextOptions &
  GuardedWriteOptions & {
    sectionId?: string
    update?: string[]
    input?: string
  }

type DocVersionReadOptions = DocContextOptions & {
  documentVersionId?: string
  id?: string
  locale?: string
  fallbackLocale?: string
}

type DocVersionListOptions = DocContextOptions & {
  documentId?: string
  status?: string
  title?: string
  limit?: string | number
}

type DocSectionListOptions = DocContextOptions & {
  title?: string
  slug?: string
  kind?: string
  sectionUid?: string
  limit?: string | number
}

type DocSectionGetOptions = DocContextOptions & {
  id?: string
}

type DocPageListOptions = DocContextOptions & {
  title?: string
  kind?: string
  pageUid?: string
  limit?: string | number
}

type DocPageGetOptions = DocContextOptions & {
  id?: string
}

type DocPageVersionListOptions = DocContextOptions & {
  pageId?: string
  status?: string
  title?: string
  format?: string
  limit?: string | number
}

type DocPageVersionGetOptions = DocContextOptions & {
  id?: string
}

type DocPageVersionUpdateOptions = DocContextOptions &
  JsonObjectInputOptions &
  GuardedWriteOptions & {
    id?: string
    status?: string
  }

type DocOutlineGetOptions = DocContextOptions & {
  documentVersionId?: string
  id?: string
  titlesOnly?: boolean
  depth?: string | number
}

type DocOutlineBuildOptions = {
  titlesOnly?: boolean
  depth?: number
}

type LitePageVersion = {
  id?: string
  pageId?: string
  version?: unknown
  title?: unknown
  format?: unknown
  status?: unknown
}

type EnsureMode = 'none' | 'index' | 'summary'

type DocSearchOptions = DocVersionReadOptions & {
  q?: string
  limit?: string | number
  retrievalStrategy?: 'lexical' | 'hybrid' | 'semantic'
  ensure?: EnsureMode
  local?: boolean
  remote?: boolean
  mirrorDir?: string
}

type DocScopeSearchOptions = DocContextOptions & {
  q?: string
  limit?: string | number
  retrievalStrategy?: 'lexical' | 'hybrid' | 'semantic'
  local?: boolean
  remote?: boolean
  mirrorDir?: string
}

type DocAnswerOptions = DocSearchOptions
type DocScopeAnswerOptions = DocScopeSearchOptions

type DocSourceOptions = DocVersionReadOptions & {
  sectionId?: string
  pageVersionId?: string
  pageNumber?: string | number
}

type DocPublishOptions = DocSourceOptions & {
  target?: 'markdown' | 'html'
  out?: string
}

type DocMirrorPullOptions = DocContextOptions &
  GuardedWriteOptions & {
    groupUid?: string
    documentSlug?: string[]
    status?: string
    limit?: string | number
    outDir?: string
    target?: 'markdown' | 'html'
  }

type DocMirrorPushOptions = DocContextOptions &
  GuardedWriteOptions & {
	    sourceDir?: string
	    groupTitle?: string
	    groupUid?: string
	    documentStatus?: 'draft' | 'published' | 'archived'
	    versionStatus?: 'draft' | 'published' | 'archived'
	    visibility?: 'public' | 'private' | 'internal'
    index?: boolean
    summary?: boolean
  }

type DocImportMarkdownOptions = DocContextOptions &
  GuardedWriteOptions & {
    fromMarkdown?: boolean
    source?: string
    baseline?: string
    guardTarget?: string[]
    documentVersionId?: string
    existingGraphPolicy?: 'error' | 'append' | 'replace'
    appendExistingGraph?: boolean
    replaceExistingGraph?: boolean
    dryRun?: boolean
    slugStrategy?: 'hash-suffix-on-collision' | 'kebab-from-title'
    bodyAssignment?: 'leaf-page-content'
    headingToPagePolicy?: 'h4-and-below'
    synthesizeOverviewPages?: boolean
  }

type ResolvedDocContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
  scopeId?: string
}

const DEFAULT_DOC_BUILD_TIMEOUT_MS = 120_000

type MarkdownSourceFile = {
  absolutePath: string
  relativePath: string
  filename: string
  slug: string
  title: string
  content: string
  sourceHash: string
  bodyBytes?: number
  documentUid?: string
  groupUid?: string
  mirrorScopeId?: string
}

type MarkdownPageChunk = {
  title: string
  content: string
}

type ParsedHeadingGraphNode = {
  kind: 'section' | 'page'
  title: string
  depth?: number
  slug?: string
  bodyMarkdown?: string
  children?: ParsedHeadingGraphNode[]
}

type MutableParsedHeadingGraphNode = ParsedHeadingGraphNode & {
  children: MutableParsedHeadingGraphNode[]
  bodyLines: string[]
}

type MarkdownBaselineGuardEntry = {
  key: string
  path: string
  title: string
  normalizedPath: string
  normalizedTitle: string
  kind: 'section' | 'page'
  depth?: number
  bodyBytes: number
  bodyHash: string
}

type MarkdownBaselineGuardDelta = {
  type: 'missing' | 'added' | 'changed' | 'truncated'
  path: string
  title: string
  kind: 'section' | 'page'
  depth?: number
  baselineBodyBytes?: number
  sourceBodyBytes?: number
  byteDelta?: number
  allowed: boolean
}

type MarkdownBaselineGuardReport = {
  baselinePath: string
  sourcePath: string
  status: 'ok' | 'blocked'
  guardTargets: string[]
  counts: Record<string, number>
  deltaCount: number
  blockingDeltaCount: number
  deltas: MarkdownBaselineGuardDelta[]
}

type DocMirrorPushPlanItem = MarkdownSourceFile & {
  action: 'create-document' | 'create-version' | 'up-to-date'
  documentId?: string
  documentVersionId?: string
  nextVersion?: number
}

const DOC_MIRROR_CONTRACT = 'doc-mirror-v2'

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function normalizeSlugFilter(value: unknown): string | undefined {
  const normalized = normalizeNonEmpty(value)
  return normalized ? pathSegmentSlug(normalized, 'document').toLowerCase() : undefined
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

function unwrapListItems(result: unknown): Record<string, unknown>[] {
  const data = unwrapResultData<unknown>(result)
  if (Array.isArray(data)) {
    return data.filter((entry): entry is Record<string, unknown> => isRecord(entry))
  }
  if (isRecord(data) && Array.isArray(data.items)) {
    return data.items.filter((entry): entry is Record<string, unknown> => isRecord(entry))
  }
  if (Array.isArray(result)) {
    return result.filter((entry): entry is Record<string, unknown> => isRecord(entry))
  }
  return []
}

function readJsonObjectInput(input: unknown, label = '--input'): Record<string, unknown> {
  const normalized = normalizeNonEmpty(input)
  if (!normalized) return {}
  const parsed = readJsonInputFile(normalized)
  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object or @file.json object.`)
  }
  return parsed
}

function resolveStringField(explicit: unknown, seed: Record<string, unknown>, key: string): string | undefined {
  return normalizeNonEmpty(explicit) ?? normalizeNonEmpty(seed[key])
}

function resolveIntegerField(
  explicit: unknown,
  seed: Record<string, unknown>,
  key: string,
  label: string,
): number | undefined {
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    return toInteger(explicit, label)
  }
  if (seed[key] !== undefined && seed[key] !== null && seed[key] !== '') {
    return toInteger(seed[key], label)
  }
  return undefined
}

function resolveStringArrayField(explicit: unknown, seed: Record<string, unknown>, key: string): string[] | undefined {
  const explicitValues = toStringArray(explicit)
  if (explicitValues.length > 0) return explicitValues
  const seededValues = toStringArray(seed[key])
  return seededValues.length > 0 ? seededValues : undefined
}

function resolveTextField(explicit: unknown, seed: Record<string, unknown>, key: string): string | undefined {
  const explicitValue = readTextInput(explicit)
  if (explicitValue !== undefined) return explicitValue
  const seeded = seed[key]
  return typeof seeded === 'string' ? seeded : undefined
}

function validatePageVersionStatus(value: unknown): string {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (normalized === 'draft' || normalized === 'review' || normalized === 'published' || normalized === 'archived') {
    return normalized
  }
  throw new Error('Page version status must be draft, review, published, or archived.')
}

function extractId(value: unknown): string | undefined {
  return normalizeNonEmpty(value)
}

function collectDocArtifacts(result: unknown): Record<string, string> | undefined {
  const artifacts: Record<string, string> = {}
  const push = (key: string, value: unknown) => {
    const normalized = extractId(value)
    if (normalized) artifacts[key] = normalized
  }

  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const save = unwrapResultData<Record<string, unknown>>((root as Record<string, unknown>)?.save)
  const link = unwrapResultData<Record<string, unknown>>((root as Record<string, unknown>)?.link)
  const create = unwrapResultData<Record<string, unknown>>((root as Record<string, unknown>)?.create)
  const pageUpdate = unwrapResultData<Record<string, unknown>>((root as Record<string, unknown>)?.pageUpdate)
  const draftSave = unwrapResultData<Record<string, unknown>>((root as Record<string, unknown>)?.draftSave)

  push('documentId', root?.documentId)
  push('documentId', (root?.document as Record<string, unknown>)?.id)
  push('documentId', root?.focusDocumentId)
  push('documentId', save?.documentId)
  push('documentId', save?.focusDocumentId)
  push('documentId', (save?.document as Record<string, unknown>)?.id)

  push('documentVersionId', root?.documentVersionId)
  push('documentVersionId', root?.focusDocumentVersionId)
  push('documentVersionId', (root?.documentVersion as Record<string, unknown>)?.id)
  push('documentVersionId', create?.documentVersionId)
  push('documentVersionId', create?.focusDocumentVersionId)
  push('documentVersionId', (create?.documentVersion as Record<string, unknown>)?.id)

  push('sectionId', root?.sectionId)
  push('sectionId', root?.focusSectionId)
  push('sectionId', (root?.section as Record<string, unknown>)?.id)
  push('sectionId', save?.sectionId)
  push('sectionId', save?.focusSectionId)
  push('sectionId', (save?.section as Record<string, unknown>)?.id)
  push('sectionId', link?.sectionId)
  push('sectionId', (link?.section as Record<string, unknown>)?.id)

  push('pageId', root?.pageId)
  push('pageId', root?.focusPageId)
  push('pageId', (root?.page as Record<string, unknown>)?.id)
  push('pageId', create?.pageId)
  push('pageId', (create?.page as Record<string, unknown>)?.id)
  push('pageId', pageUpdate?.pageId)
  push('pageId', pageUpdate?.focusPageId)
  push('pageId', (pageUpdate?.page as Record<string, unknown>)?.id)

  push('pageVersionId', root?.pageVersionId)
  push('pageVersionId', (root?.pageVersion as Record<string, unknown>)?.id)
  push('pageVersionId', create?.pageVersionId)
  push('pageVersionId', (create?.pageVersion as Record<string, unknown>)?.id)
  push('pageVersionId', draftSave?.pageVersionId)
  push('pageVersionId', (draftSave?.pageVersion as Record<string, unknown>)?.id)

  const rootLinks = Array.isArray(root?.documentSectionLinks) ? root.documentSectionLinks : []
  const createLinks = Array.isArray(create?.documentSectionLinks) ? create.documentSectionLinks : []
  const linkLinks = Array.isArray(link?.documentSectionLinks) ? link.documentSectionLinks : []
  const sectionPageLinks = Array.isArray(root?.sectionPageLinks) ? root.sectionPageLinks : []

  push('documentSectionLinkId', root?.linkId)
  push('documentSectionLinkId', (root?.link as Record<string, unknown>)?.id)
  push('documentSectionLinkId', link?.linkId)
  push('documentSectionLinkId', (link?.link as Record<string, unknown>)?.id)
  push('documentSectionLinkId', (rootLinks[0] as Record<string, unknown>)?.id)
  push('documentSectionLinkId', (createLinks[0] as Record<string, unknown>)?.id)
  push('documentSectionLinkId', (linkLinks[0] as Record<string, unknown>)?.id)

  push('sectionPageLinkId', root?.sectionPageLinkId)
  push('sectionPageLinkId', (root?.link as Record<string, unknown>)?.id)
  push('sectionPageLinkId', (sectionPageLinks[0] as Record<string, unknown>)?.id)

  return Object.keys(artifacts).length > 0 ? artifacts : undefined
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedDocContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    ...preferProjectNameBinding(resolvedContext),
    scopeId: resolvedContext.scopeId,
    projectId: resolvedContext.projectId,
  }
}

function withoutGuardedWriteRuntimeOptions<T extends DocContextOptions>(options: T): DocContextOptions {
  const sanitized = { ...options } as Record<string, unknown>
  delete sanitized.preview
  delete sanitized.apply
  delete sanitized.confirm
  delete sanitized.idempotencyKey
  return sanitized as DocContextOptions
}

async function hydrateProjectContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedDocContext,
  params: { forceHostedScope?: boolean } = {},
): Promise<ResolvedDocContext> {
  if (normalizeNonEmpty(options.scopeId)) {
    return resolvedContext
  }
  if (
    !params.forceHostedScope &&
    normalizeNonEmpty(resolvedContext.scopeId) &&
    normalizeNonEmpty(resolvedContext.projectName)
  ) {
    return resolvedContext
  }
  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) return resolvedContext

  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: 'agentspace.project.get-by-id',
    input: { id: projectId },
  })
  const result = unwrapHostedToolResult(payload)
  const project = unwrapResultData<Record<string, unknown>>(result)
  if (!isRecord(project)) return resolvedContext

  const scopeId = resolveOwnerScopeIdFromProjectRecord(project, resolvedContext.scopeId ?? projectId)
  const projectName = normalizeNonEmpty(project.name) ?? resolvedContext.projectName

  return {
    ...resolvedContext,
    scopeId,
    projectName,
  }
}

async function resolveDocContext(
  options: DocContextOptions,
  apiState: CliApiClientState,
  params: { forceHostedScope?: boolean } = {},
): Promise<ResolvedDocContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: true,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  const hydrated = await hydrateProjectContext(apiState, options, {
    ...resolved,
    scopeId,
  }, params)
  if (!normalizeNonEmpty(hydrated.scopeId)) {
    throw new Error('Docman command requires --scope-id or repo-bound project context.')
  }
  return hydrated
}

function buildResolvedContextRecord(context: ResolvedDocContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
    projectSlug: context.projectSlug,
  })
}

function buildEnvelope(params: {
  command: string
  surface: string
  resolvedContext: Record<string, unknown>
  input: Record<string, unknown>
  result: unknown
  artifacts?: Record<string, string>
}): Record<string, unknown> {
  return compactPayload({
    command: params.command,
    surface: params.surface,
    resolvedContext: params.resolvedContext,
    input: params.input,
    result: params.result,
    artifacts: params.artifacts,
  })
}

function collectDocGroupArtifacts(result: unknown): Record<string, string> | undefined {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const groupId =
    normalizeNonEmpty(root.groupId) ??
    normalizeNonEmpty(root.id) ??
    normalizeNonEmpty((root.group as Record<string, unknown> | undefined)?.id)
  const groupUid =
    normalizeNonEmpty(root.groupUid) ??
    normalizeNonEmpty((root.group as Record<string, unknown> | undefined)?.groupUid)

  const artifacts = compactPayload({
    groupId,
    groupUid,
  }) as Record<string, string> | undefined
  return artifacts && Object.keys(artifacts).length > 0 ? artifacts : undefined
}

function readJsonInputFile(input: string): unknown {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('@')) {
    return JSON.parse(readFileSync(trimmed.slice(1).trim(), 'utf8'))
  }
  return JSON.parse(trimmed)
}

function readTextInput(value: unknown): string | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  if (normalized.startsWith('@')) {
    return readFileSync(normalized.slice(1).trim(), 'utf8')
  }
  return String(value)
}

async function writeMaterializedDocOutput(out: unknown, result: unknown): Promise<string | undefined> {
  const outputPath = normalizeNonEmpty(out)
  if (!outputPath) return undefined

  const payload = unwrapResultData<Record<string, unknown>>(result)
  const content = payload?.content
  if (typeof content !== 'string') {
    throw new Error('Publish result did not include textual content to write.')
  }

  const absolutePath = path.resolve(outputPath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, 'utf8')
  return absolutePath
}

function materializedContent(result: unknown): string {
  const payload = unwrapResultData<Record<string, unknown>>(result)
  const content = payload?.content
  if (typeof content !== 'string') {
    throw new Error('Publish result did not include textual content.')
  }
  return content
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function pathSegmentSlug(value: unknown, fallback: string): string {
  const normalized = normalizeNonEmpty(value) ?? fallback
  const safe = normalized
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  return safe || fallback
}

function extractMarkdownTitle(content: string, fallback: string): string {
  const titleLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line))
  return titleLine?.replace(/^#\s+/, '').trim() || fallback
}

function markdownTitleFromFilename(filename: string): string {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

async function readRootMarkdownSources(sourceDirInput: unknown): Promise<MarkdownSourceFile[]> {
  const sourceDir = path.resolve(normalizeNonEmpty(sourceDirInput) ?? 'docs')
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const files: MarkdownSourceFile[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.md')) continue
    const absolutePath = path.join(sourceDir, entry.name)
    const content = readFileSync(absolutePath, 'utf8')
    const title = extractMarkdownTitle(content, markdownTitleFromFilename(entry.name))
    const slug = pathSegmentSlug(path.basename(entry.name, path.extname(entry.name)), slugify(title) || 'document')
    files.push({
      absolutePath,
      relativePath: entry.name,
      filename: entry.name,
      slug,
      title,
      content,
      sourceHash: sha256Hex(content),
    })
  }

  return files.sort((left, right) => left.filename.localeCompare(right.filename))
}

function splitMarkdownIntoPages(content: string, documentTitle: string): MarkdownPageChunk[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const chunks: MarkdownPageChunk[] = []
  let currentTitle = 'Overview'
  let currentLines: string[] = []

  const flush = () => {
    const pageContent = currentLines.join('\n').trim()
    if (!pageContent) return
    chunks.push({
      title: currentTitle,
      content: `${pageContent}\n`,
    })
  }

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) {
      flush()
      currentTitle = heading[1]?.replace(/#+\s*$/, '').trim() || 'Section'
      currentLines = [line]
      continue
    }
    currentLines.push(line)
  }
  flush()

  if (chunks.length > 0) return chunks
  return [{ title: documentTitle, content: normalized.endsWith('\n') ? normalized : `${normalized}\n` }]
}

function readMarkdownImportSource(sourceInput: unknown): { content: string; sourcePath: string } {
  const source = normalizeNonEmpty(sourceInput)
  if (!source) {
    throw new Error('Markdown import requires --source <path|->.')
  }
  if (source === '-') {
    return {
      content: readFileSync(0, 'utf8'),
      sourcePath: 'stdin',
    }
  }

  const filePath = source.startsWith('@') ? source.slice(1).trim() : source
  if (!filePath) {
    throw new Error('Markdown import source path is empty.')
  }
  const absolutePath = path.resolve(filePath)
  return {
    content: readFileSync(absolutePath, 'utf8'),
    sourcePath: path.relative(process.cwd(), absolutePath) || absolutePath,
  }
}

function readMarkdownBaselineSource(baselineInput: unknown): { content: string; sourcePath: string } | undefined {
  const baseline = normalizeNonEmpty(baselineInput)
  if (!baseline) return undefined
  if (baseline === '-') {
    throw new Error('Markdown import --baseline must be a file path; stdin is reserved for --source.')
  }
  return readMarkdownImportSource(baseline)
}

function normalizeMarkdownHeadingTitle(rawTitle: string): string {
  return rawTitle.replace(/\s+#+\s*$/, '').trim()
}

function createMutableHeadingNode(
  kind: 'section' | 'page',
  title: string,
  depth: number,
): MutableParsedHeadingGraphNode {
  return {
    kind,
    title,
    depth,
    ...(kind === 'section' ? { slug: slugify(title) || undefined } : {}),
    children: [],
    bodyLines: [],
  }
}

function toParsedHeadingNode(node: MutableParsedHeadingGraphNode): ParsedHeadingGraphNode {
  const bodyMarkdown = node.bodyLines.join('\n').trim()
  const children = node.children.map(toParsedHeadingNode)
  return compactPayload({
    kind: node.kind,
    title: node.title,
    depth: node.depth,
    slug: node.slug,
    bodyMarkdown: bodyMarkdown ? `${bodyMarkdown}\n` : undefined,
    children: children.length > 0 ? children : undefined,
  }) as ParsedHeadingGraphNode
}

function parseMarkdownHeadingGraph(content: string): ParsedHeadingGraphNode[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const roots: MutableParsedHeadingGraphNode[] = []
  const sectionStack: Array<{ level: number; node: MutableParsedHeadingGraphNode }> = []
  let activeNode: MutableParsedHeadingGraphNode | undefined
  let fenceMarker: string | undefined

  for (const [lineIndex, line] of lines.entries()) {
    const trimmed = line.trim()
    const fence = /^(```+|~~~+)/.exec(trimmed)
    if (fence) {
      if (fenceMarker && trimmed.startsWith(fenceMarker)) {
        fenceMarker = undefined
      } else if (!fenceMarker) {
        fenceMarker = fence[1]!.slice(0, 3)
      }
      activeNode?.bodyLines.push(line)
      continue
    }

    if (!fenceMarker) {
      const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
      if (heading) {
        const level = heading[1]!.length
        const title = normalizeMarkdownHeadingTitle(heading[2] ?? '')
        if (!title) {
          activeNode = undefined
          continue
        }
        if (level === 1) {
          sectionStack.length = 0
          activeNode = undefined
          continue
        }
        if (level === 2 || level === 3) {
          const node = createMutableHeadingNode('section', title, level)
          while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1]!.level >= level) {
            sectionStack.pop()
          }
          const parent = sectionStack[sectionStack.length - 1]?.node
          if (parent) {
            parent.children.push(node)
          } else {
            roots.push(node)
          }
          sectionStack.push({ level, node })
          activeNode = node
          continue
        }

        const parent = sectionStack[sectionStack.length - 1]?.node
        if (!parent) {
          throw new Error(
            `Markdown heading "${title}" on line ${lineIndex + 1} needs an H2/H3 section before H4+ page headings.`,
          )
        }
        const node = createMutableHeadingNode('page', title, level)
        parent.children.push(node)
        activeNode = node
        continue
      }
    }

    activeNode?.bodyLines.push(line)
  }

  const nodes = roots.map(toParsedHeadingNode)
  if (nodes.length === 0) {
    throw new Error('Markdown import did not find any H2/H3 section headings.')
  }
  return nodes
}

function countParsedHeadingNodes(nodes: ParsedHeadingGraphNode[], kind?: 'section' | 'page'): number {
  let count = 0
  for (const node of nodes) {
    if (!kind || node.kind === kind) {
      count += 1
    }
    count += countParsedHeadingNodes(node.children ?? [], kind)
  }
  return count
}

function normalizeBaselineGuardText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function flattenParsedHeadingGraphForGuard(
  nodes: ParsedHeadingGraphNode[],
  parentPath: string[] = [],
): MarkdownBaselineGuardEntry[] {
  const entries: MarkdownBaselineGuardEntry[] = []
  for (const node of nodes) {
    const title = node.title.trim()
    const pathParts = [...parentPath, title]
    const pathKey = pathParts.join(' > ')
    const body = node.bodyMarkdown ?? ''
    entries.push({
      key: normalizeBaselineGuardText(pathKey),
      path: pathKey,
      title,
      normalizedPath: normalizeBaselineGuardText(pathKey),
      normalizedTitle: normalizeBaselineGuardText(title),
      kind: node.kind,
      depth: node.depth,
      bodyBytes: Buffer.byteLength(body, 'utf8'),
      bodyHash: sha256Hex(body),
    })
    entries.push(...flattenParsedHeadingGraphForGuard(node.children ?? [], pathParts))
  }
  return entries
}

function indexBaselineGuardEntries(entries: MarkdownBaselineGuardEntry[]): Map<string, MarkdownBaselineGuardEntry> {
  const map = new Map<string, MarkdownBaselineGuardEntry>()
  for (const entry of entries) {
    if (!map.has(entry.key)) map.set(entry.key, entry)
  }
  return map
}

function matchesBaselineGuardTarget(entry: MarkdownBaselineGuardEntry, guardTargets: string[]): boolean {
  if (guardTargets.length === 0) return false
  return guardTargets.some((target) =>
    entry.normalizedPath === target ||
    entry.normalizedPath.endsWith(` > ${target}`) ||
    entry.normalizedTitle === target ||
    entry.normalizedPath.includes(target),
  )
}

function buildMarkdownBaselineGuardReport(params: {
  baselinePath: string
  baselineNodes: ParsedHeadingGraphNode[]
  sourcePath: string
  sourceNodes: ParsedHeadingGraphNode[]
  guardTargets?: string[]
}): MarkdownBaselineGuardReport {
  const guardTargets = (params.guardTargets ?? []).map(normalizeBaselineGuardText).filter(Boolean)
  const baselineEntries = flattenParsedHeadingGraphForGuard(params.baselineNodes)
  const sourceEntries = flattenParsedHeadingGraphForGuard(params.sourceNodes)
  const baselineByKey = indexBaselineGuardEntries(baselineEntries)
  const sourceByKey = indexBaselineGuardEntries(sourceEntries)
  const deltas: MarkdownBaselineGuardDelta[] = []

  const pushDelta = (
    type: MarkdownBaselineGuardDelta['type'],
    entry: MarkdownBaselineGuardEntry,
    fields: Partial<MarkdownBaselineGuardDelta> = {},
  ) => {
    deltas.push(compactPayload({
      type,
      path: entry.path,
      title: entry.title,
      kind: entry.kind,
      depth: entry.depth,
      allowed: matchesBaselineGuardTarget(entry, guardTargets),
      ...fields,
    }) as MarkdownBaselineGuardDelta)
  }

  for (const [key, baselineEntry] of baselineByKey.entries()) {
    const sourceEntry = sourceByKey.get(key)
    if (!sourceEntry) {
      pushDelta('missing', baselineEntry, {
        baselineBodyBytes: baselineEntry.bodyBytes,
      })
      continue
    }
    if (
      baselineEntry.kind !== sourceEntry.kind ||
      baselineEntry.depth !== sourceEntry.depth ||
      baselineEntry.bodyHash !== sourceEntry.bodyHash
    ) {
      pushDelta(sourceEntry.bodyBytes < baselineEntry.bodyBytes ? 'truncated' : 'changed', baselineEntry, {
        baselineBodyBytes: baselineEntry.bodyBytes,
        sourceBodyBytes: sourceEntry.bodyBytes,
        byteDelta: sourceEntry.bodyBytes - baselineEntry.bodyBytes,
      })
    }
  }

  for (const [key, sourceEntry] of sourceByKey.entries()) {
    if (baselineByKey.has(key)) continue
    pushDelta('added', sourceEntry, {
      sourceBodyBytes: sourceEntry.bodyBytes,
    })
  }

  const blockingDeltas = deltas.filter((delta) => !delta.allowed)
  return {
    baselinePath: params.baselinePath,
    sourcePath: params.sourcePath,
    status: blockingDeltas.length > 0 ? 'blocked' : 'ok',
    guardTargets: params.guardTargets ?? [],
    counts: {
      baselineSections: countParsedHeadingNodes(params.baselineNodes, 'section'),
      baselinePages: countParsedHeadingNodes(params.baselineNodes, 'page'),
      sourceSections: countParsedHeadingNodes(params.sourceNodes, 'section'),
      sourcePages: countParsedHeadingNodes(params.sourceNodes, 'page'),
    },
    deltaCount: deltas.length,
    blockingDeltaCount: blockingDeltas.length,
    deltas,
  }
}

function frontmatterValue(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  return JSON.stringify(String(value))
}

function renderFrontmatter(fields: Record<string, unknown>): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue
    lines.push(`${key}: ${frontmatterValue(value)}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function toInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`)
  }
  return Math.trunc(parsed)
}

function appendQuery(path: string, query: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue
        params.append(key, String(item))
      }
      continue
    }
    params.append(key, String(value))
  }
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function buildUid(prefix: 'DOC' | 'SEC' | 'PAG', title: string): string {
  const slug = slugify(title).replace(/-/g, '_').toUpperCase()
  const tail = slug || Date.now().toString(36).toUpperCase()
  return `${prefix}-${tail}`
}

type DocAuditFieldMode = 'create' | 'update'

async function resolveDocAuditFields(
  apiState: CliApiClientState,
  options: DocContextOptions,
  seed: Record<string, unknown>,
  mode: DocAuditFieldMode,
): Promise<Record<string, string>> {
  const seededCreatedBy = normalizeNonEmpty(seed.createdBy)
  const seededUpdatedBy = normalizeNonEmpty(seed.updatedBy)
  let inferredActor = seededUpdatedBy ?? seededCreatedBy

  if (!inferredActor && !normalizeNonEmpty(apiState.getAccessToken())) {
    const runtime = await probeCliRuntimeMode(apiState, { timeoutMs: options.timeoutMs })
    const principalUserId = normalizeNonEmpty(runtime.principalUserId)
    if (principalUserId) {
      inferredActor = `user:${principalUserId}`
    }
  }

  const fallbackActor = inferredActor ?? 'agent:aops-cli'
  if (mode === 'create') {
    return {
      createdBy: seededCreatedBy ?? fallbackActor,
      updatedBy: seededUpdatedBy ?? seededCreatedBy ?? fallbackActor,
    }
  }

  return {
    updatedBy: seededUpdatedBy ?? seededCreatedBy ?? fallbackActor,
  }
}

async function callDocmanFlow(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  body: Record<string, unknown>,
): Promise<unknown> {
  const headers = await buildAgentContextHeaders(buildGatewayOptions(options, resolvedContext))
  const requestBody = compactPayload({
    ...body,
    scopeId: resolvedContext.scopeId,
  })
  try {
    const payload = await apiState.client.fetchJson<Record<string, unknown>>('/api/aops/docman/flows', {
      method: 'POST',
      headers,
      body: requestBody,
      timeoutMs: options.timeoutMs,
    })
    if (body.apply === true || body.confirm === true) {
      await appendCliDurableActivityLogBestEffort({
        apiState,
        options: buildGatewayOptions(options, resolvedContext),
        sourceId: `doc.flow.${normalizeNonEmpty(body.action) ?? 'unknown'}`,
        action: normalizeNonEmpty(body.action) ?? 'flow',
        status: 'success',
        summary: `Doc flow ${normalizeNonEmpty(body.action)?.replace(/[-_]+/g, ' ') ?? 'completed'} completed`,
        payload: {
          request: requestBody,
          response: payload,
        },
      })
    }
    return payload
  } catch (error) {
    if (body.apply === true || body.confirm === true) {
      await appendCliDurableActivityLogBestEffort({
        apiState,
        options: buildGatewayOptions(options, resolvedContext),
        sourceId: `doc.flow.${normalizeNonEmpty(body.action) ?? 'unknown'}`,
        action: normalizeNonEmpty(body.action) ?? 'flow',
        status: 'error',
        summary: `Doc flow ${normalizeNonEmpty(body.action)?.replace(/[-_]+/g, ' ') ?? 'failed'} failed`,
        payload: {
          request: requestBody,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
    throw error
  }
}

async function callDocmanVersionRoute(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  params: {
    documentVersionId: string
    suffix: 'index' | 'summaries' | 'search' | 'answer-pack' | 'compose-fetch' | 'materialize'
    method: 'GET' | 'POST'
    query?: Record<string, unknown>
    body?: Record<string, unknown>
  },
): Promise<unknown> {
  const headers = await buildAgentContextHeaders(buildGatewayOptions(options, resolvedContext))
  let path = `/api/docman/document-versions/${encodeURIComponent(params.documentVersionId)}/${params.suffix}`
  if (params.query) path = appendQuery(path, params.query)
  return apiState.client.fetchJson(path, {
    method: params.method,
    headers,
    body: params.method === 'GET' ? undefined : params.body,
    timeoutMs: resolveDocmanVersionRouteTimeoutMs(options, params.suffix),
  })
}

function resolveDocmanVersionRouteTimeoutMs(
  options: { timeoutMs?: number },
  suffix: 'index' | 'summaries' | 'search' | 'answer-pack' | 'compose-fetch' | 'materialize',
): number | undefined {
  if (typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    return options.timeoutMs
  }
  if (suffix === 'index' || suffix === 'summaries') return DEFAULT_DOC_BUILD_TIMEOUT_MS
  return options.timeoutMs
}

async function callDocmanScopeRoute(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  params: {
    scopeId: string
    suffix: 'documents/search'
    method: 'GET'
    query?: Record<string, unknown>
  },
): Promise<unknown> {
  const headers = await buildAgentContextHeaders(buildGatewayOptions(options, resolvedContext))
  let routePath = `/api/docman/scopes/${encodeURIComponent(params.scopeId)}/${params.suffix}`
  if (params.query) routePath = appendQuery(routePath, params.query)
  return apiState.client.fetchJson(routePath, {
    method: params.method,
    headers,
    timeoutMs: options.timeoutMs,
  })
}

async function invokeDocHostedTool(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  toolId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const readOptions = withoutGuardedWriteRuntimeOptions(options)
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(readOptions, resolvedContext),
    toolId,
    input,
  })
  return unwrapHostedToolResult(payload)
}

async function invokeDocCrudMutationTool(
  apiState: CliApiClientState,
  options: DocContextOptions & GuardedWriteOptions,
  resolvedContext: ResolvedDocContext,
  params: {
    command: string
    toolId: string
    input: Record<string, unknown>
    successText: string
    destructive?: boolean
    artifacts?: (result: unknown) => Record<string, string> | undefined
  },
): Promise<void> {
  if (params.destructive) {
    ensureDestructiveWrite(options, 'This command deletes Docman state.')
  } else {
    ensureGuardedWrite(options, 'This command mutates Docman state.')
  }

  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: params.toolId,
    input: params.input,
    preview: options.preview,
    apply: options.apply,
    confirm: options.confirm,
    idempotencyKey: options.idempotencyKey,
  })
  const result = unwrapHostedToolResult(payload)

  if (options.json) {
    console.log(JSON.stringify(buildHostedSugarEnvelope({
      command: params.command,
      toolId: params.toolId,
      resolvedContext: buildResolvedContextRecord(resolvedContext),
      input: params.input,
      artifacts: params.artifacts?.(result),
      result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(result, null, 2))
}

async function invokeDocCrudList(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  toolId: string,
  filter: Record<string, unknown>,
  listOptions?: Record<string, unknown>,
): Promise<unknown> {
  const input = compactPayload({
    filter: compactPayload({
      scopeId: resolvedContext.scopeId,
      scopeResolution: 'cascade',
      ...filter,
    }),
    options: listOptions ? compactPayload(listOptions) : undefined,
  })
  return invokeDocHostedTool(apiState, options, resolvedContext, toolId, input)
}

async function invokeDocCrudGet(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  toolId: string,
  id: string,
): Promise<unknown> {
  return invokeDocHostedTool(apiState, options, resolvedContext, toolId, { id })
}

async function invokeDocCrudMutationRaw(
  apiState: CliApiClientState,
  options: DocContextOptions & GuardedWriteOptions,
  resolvedContext: ResolvedDocContext,
  toolId: string,
  input: Record<string, unknown>,
  runtimeOptions: { idempotencyKey?: string } = {},
): Promise<unknown> {
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId,
    input,
    preview: options.preview,
    apply: options.apply,
    confirm: options.confirm,
    idempotencyKey: normalizeNonEmpty(runtimeOptions.idempotencyKey) ?? options.idempotencyKey,
  })
  return unwrapHostedToolResult(payload)
}

async function listDocGroups(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  filter: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const result = await invokeDocCrudList(
    apiState,
    options,
    resolvedContext,
    'docman.document-group.list',
    filter,
    { limit: 500 },
  )
  return unwrapListItems(result)
}

async function findDocGroupByUid(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  groupUid: string,
): Promise<Record<string, unknown> | undefined> {
  const groups = await listDocGroups(apiState, options, resolvedContext, { groupUid })
  const normalizedUid = groupUid.toLowerCase()
  return groups.find((group) => normalizeNonEmpty(group.groupUid)?.toLowerCase() === normalizedUid) ?? groups[0]
}

async function resolveDocumentGroupBinding(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  params: { groupId?: string; groupUid?: string; skipLookup?: boolean },
): Promise<{ groupId?: string; groupUid?: string }> {
  const groupId = normalizeNonEmpty(params.groupId)
  const groupUid = normalizeNonEmpty(params.groupUid)
  if (!groupUid || groupId || params.skipLookup) {
    return compactPayload({ groupId, groupUid }) as { groupId?: string; groupUid?: string }
  }

  const group = await findDocGroupByUid(apiState, options, resolvedContext, groupUid)
  return compactPayload({
    groupId: recordId(group, 'groupId'),
    groupUid: normalizeNonEmpty(group?.groupUid) ?? groupUid,
  }) as { groupId?: string; groupUid?: string }
}

async function listDocuments(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  filter: Record<string, unknown> = {},
  listOptions: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const result = await invokeDocCrudList(
    apiState,
    options,
    resolvedContext,
    'docman.document.list',
    filter,
    listOptions,
  )
  return unwrapListItems(result)
}

async function findDocumentBySlug(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  params: { slug: string; groupUid?: string; groupId?: string },
): Promise<Record<string, unknown> | undefined> {
  const docs = await listDocuments(
    apiState,
    options,
    resolvedContext,
    compactPayload({
      slug: params.slug,
      groupUid: params.groupUid,
      groupId: params.groupId,
    }),
    { limit: 10 },
  )
  return docs.find((doc) => normalizeNonEmpty(doc.slug) === params.slug) ?? docs[0]
}

async function listDocumentVersions(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  documentId: string,
): Promise<Record<string, unknown>[]> {
  const result = await invokeDocCrudList(
    apiState,
    options,
    resolvedContext,
    'docman.document-version.list',
    { documentId },
    { limit: 100 },
  )
  return unwrapListItems(result)
}

function recordId(record: Record<string, unknown> | undefined, fallbackKey?: string): string | undefined {
  if (!record) return undefined
  return (
    normalizeNonEmpty(record.id) ??
    normalizeNonEmpty(fallbackKey ? record[fallbackKey] : undefined) ??
    normalizeNonEmpty(record.documentId) ??
    normalizeNonEmpty(record.documentVersionId)
  )
}

function unwrapCrudData(result: unknown): Record<string, unknown> {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  if (isRecord(root.data)) return root.data
  if (isRecord(root.response) && isRecord(root.response.data)) return root.response.data
  return root
}

function recordVersion(record: Record<string, unknown>): number {
  const parsed = Number(record.version)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function selectLatestDocumentVersion(versions: Record<string, unknown>[]): Record<string, unknown> | undefined {
  // Prefer the row marked isCurrent=true (the canonical "current" version flipped
  // by docman.document-version.set-current). Fall back to highest numeric version
  // only when no current row exists — this preserves backward compatibility for
  // documents that pre-date the set-current invariant.
  const candidates = versions.filter((version) => recordId(version, 'documentVersionId'))
  const currentVersion = candidates.find((version) => version.isCurrent === true)
  if (currentVersion) return currentVersion
  return candidates
    .slice()
    .sort((left, right) => recordVersion(right) - recordVersion(left))[0]
}

function findVersionBySourceHash(
  versions: Record<string, unknown>[],
  sourceHash: string,
): Record<string, unknown> | undefined {
  const shortHash = sourceHash.slice(0, 12)
  const label = `repo-doc:${shortHash}`
  return versions.find((version) => {
    const versionLabel = normalizeNonEmpty(version.label)
    const releaseNotes = normalizeNonEmpty(version.releaseNotes)
    return (
      (versionLabel === label &&
        releaseNotes?.includes('repoMirrorComplete=true') &&
        releaseNotes.includes(`repoMirrorContract=${DOC_MIRROR_CONTRACT}`)) ||
      (releaseNotes?.includes(`sourceHash=${sourceHash}`) &&
        releaseNotes.includes('repoMirrorComplete=true') &&
        releaseNotes.includes(`repoMirrorContract=${DOC_MIRROR_CONTRACT}`))
    )
  })
}

function buildMirrorUid(prefix: 'DOC' | 'SEC' | 'PAG', seed: string, hash: string, suffix?: string | number): string {
  const normalizedSeed = pathSegmentSlug(seed, prefix.toLowerCase()).replace(/-/g, '_').toUpperCase()
  const parts = [prefix, hash.slice(0, 10).toUpperCase(), normalizedSeed.slice(0, 36), suffix]
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== '')
    .map(String)
  return parts.join('-')
}

function buildMirrorMutationIdempotencyKey(
  options: DocMirrorPushOptions,
  toolId: string,
  parts: Array<string | number | undefined>,
): string | undefined {
  const rootKey = normalizeNonEmpty(options.idempotencyKey)
  if (!rootKey) return undefined
  const seed = JSON.stringify([
    'doc.mirror.push',
    rootKey,
    toolId,
    ...parts.map((part) => part === undefined ? '' : String(part)),
  ])
  return `${toolId}:${sha256Hex(seed).slice(0, 16)}`
}

function nextDocumentVersionNumber(versions: Record<string, unknown>[]): number {
  const max = versions.reduce((currentMax, version) => Math.max(currentMax, recordVersion(version)), 0)
  return max + 1
}

function normalizeEnsureMode(value: unknown): EnsureMode {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized || normalized === 'none') return 'none'
  if (normalized === 'index' || normalized === 'summary') return normalized
  throw new Error('Invalid --ensure. Expected one of: none, index, summary.')
}

function normalizePreReadEnsureMode(value: unknown): EnsureMode {
  return normalizeEnsureMode(value ?? 'summary')
}

function requireDocumentVersionId(options: { documentVersionId?: unknown; id?: unknown }): string {
  const documentVersionId = normalizeNonEmpty(options.documentVersionId)
  const id = normalizeNonEmpty(options.id)
  if (documentVersionId && id && documentVersionId !== id) {
    throw new Error('Conflicting values for --document-version-id and --id.')
  }
  const resolved = documentVersionId ?? id
  if (!resolved) {
    throw new Error('Document version id is required.')
  }
  return resolved
}

async function maybeEnsureRetrievalState(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  params: {
    ensure: EnsureMode
    documentVersionId: string
    locale?: string
    fallbackLocale?: string
  },
): Promise<void> {
  if (params.ensure === 'none') return
  if (params.ensure === 'index') {
    await callDocmanVersionRoute(apiState, options, resolvedContext, {
      documentVersionId: params.documentVersionId,
      suffix: 'index',
      method: 'POST',
      body: compactPayload({
        locale: normalizeNonEmpty(params.locale),
        fallbackLocale: normalizeNonEmpty(params.fallbackLocale),
      }),
    })
    return
  }
  await callDocmanVersionRoute(apiState, options, resolvedContext, {
    documentVersionId: params.documentVersionId,
    suffix: 'summaries',
    method: 'POST',
    body: compactPayload({
      locale: normalizeNonEmpty(params.locale),
      fallbackLocale: normalizeNonEmpty(params.fallbackLocale),
    }),
  })
}

function formatPageRangeLabel(start: unknown, end: unknown): string {
  const startPage = toInteger(start, 'pageNumberStart')
  const endPage = toInteger(end, 'pageNumberEnd')
  if (startPage && endPage && startPage !== endPage) return `pp.${startPage}-${endPage}`
  if (startPage) return `p.${startPage}`
  return ''
}

function renderDocScopeSearchResult(result: unknown): void {
  const payload = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : undefined)
  const hits = Array.isArray(payload?.hits) ? payload.hits : []
  const provenance = isRecord(payload?.provenance) ? payload?.provenance : {}
  const buildReport = isRecord(payload?.buildReport) ? payload?.buildReport : {}
  const failures = Array.isArray(buildReport.failures) ? buildReport.failures : []

  logSuccess('Scope-wide document search completed.')
  logInfo(
    `Documents: searched ${String(provenance.searchedDocumentCount ?? 0)}/${String(provenance.totalDocumentCount ?? 0)}, auto-built ${String(provenance.autoBuiltDocumentCount ?? 0)}, failed ${String(provenance.failedDocumentCount ?? 0)}`,
  )

  if (hits.length === 0) {
    console.log('No hits found.')
  } else {
    hits.forEach((entry, index) => {
      const hit = isRecord(entry) ? entry : {}
      const documentTitle = normalizeNonEmpty(hit.documentTitle) ?? 'Untitled document'
      const documentVersionTitle = normalizeNonEmpty(hit.documentVersionTitle)
      const breadcrumb = normalizeNonEmpty(hit.breadcrumb) ?? normalizeNonEmpty(hit.title) ?? 'Untitled hit'
      const pageRange = formatPageRangeLabel(hit.pageNumberStart, hit.pageNumberEnd)
      const score = Number.isFinite(Number(hit.score)) ? Number(hit.score).toFixed(2) : '0.00'
      const excerpt = typeof hit.excerpt === 'string' ? hit.excerpt.trim() : ''
      const metaParts = [documentVersionTitle, pageRange, `score ${score}`].filter(Boolean)

      console.log(`${index + 1}. ${documentTitle}`)
      console.log(`   ${breadcrumb}`)
      if (metaParts.length > 0) {
        console.log(`   ${metaParts.join(' | ')}`)
      }
      if (excerpt) {
        console.log(`   ${excerpt}`)
      }
    })
  }

  if (failures.length > 0) {
    logInfo('Build/search failures:')
    failures.forEach((entry) => {
      const failure = isRecord(entry) ? entry : {}
      const title = normalizeNonEmpty(failure.documentTitle) ?? normalizeNonEmpty(failure.documentId) ?? 'unknown-document'
      const stage = normalizeNonEmpty(failure.stage) ?? 'unknown-stage'
      const message = normalizeNonEmpty(failure.message) ?? 'Unknown failure.'
      console.log(`- ${title} [${stage}]: ${message}`)
    })
  }
}

function parseUpdateList(updateValues: string[] | undefined, input: string | undefined): Record<string, unknown>[] {
  const parsedFromFile = input ? readJsonInputFile(input) : undefined
  if (parsedFromFile !== undefined && updateValues && updateValues.length > 0) {
    throw new Error('Provide either --update or --input, not both.')
  }
  if (Array.isArray(parsedFromFile)) {
    return parsedFromFile.filter((entry): entry is Record<string, unknown> => isRecord(entry))
  }
  if (parsedFromFile !== undefined) {
    throw new Error('Order input must be a JSON array of updates.')
  }
  return toStringArray(updateValues).map((entry) => {
    const parsed = readJsonInputFile(entry)
    if (!isRecord(parsed)) throw new Error('Each --update entry must be a JSON object.')
    return parsed
  })
}

function sortNumericRecords(items: Record<string, unknown>[], field: string): Record<string, unknown>[] {
  return items
    .slice()
    .sort((left, right) => (Number(left[field]) || 0) - (Number(right[field]) || 0))
}

async function buildDocOutline(
  apiState: CliApiClientState,
  options: DocContextOptions,
  resolvedContext: ResolvedDocContext,
  documentVersionId: string,
  outlineOptions: DocOutlineBuildOptions = {},
): Promise<Record<string, unknown>> {
  const titlesOnly = outlineOptions.titlesOnly === true
  const maxDepth = outlineOptions.depth
  const documentVersion = unwrapResultData<Record<string, unknown>>(
    await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.document-version.get', documentVersionId),
  ) ?? {}
  const documentId = normalizeNonEmpty(documentVersion.documentId)
  if (!documentId) {
    throw new Error('Document version exists but documentId could not be resolved.')
  }

  const document = unwrapResultData<Record<string, unknown>>(
    await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.document.get', documentId),
  ) ?? {}

  const documentLinksResult = await invokeDocCrudList(
    apiState,
    options,
    resolvedContext,
    'docman.document-section-link.list',
    { documentVersionId },
  )
  const documentLinks = sortNumericRecords(unwrapListItems(documentLinksResult), 'position')

  const sectionIds = new Set<string>()
  const pageVersionIds = new Set<string>()
  for (const link of documentLinks) {
    const kind = normalizeNonEmpty(link.kind)
    if (kind === 'section') {
      const sectionId = normalizeNonEmpty(link.sectionId)
      if (sectionId) sectionIds.add(sectionId)
    }
    if (kind === 'page') {
      const pageVersionId = normalizeNonEmpty(link.pageVersionId)
      if (pageVersionId) pageVersionIds.add(pageVersionId)
    }
  }

  const sections = new Map<string, Record<string, unknown>>()
  for (const sectionId of sectionIds) {
    const section = unwrapResultData<Record<string, unknown>>(
      await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.section.get', sectionId),
    )
    if (section) sections.set(sectionId, section)
  }

  const sectionPageLinksBySectionId = new Map<string, Record<string, unknown>[]>()
  for (const sectionId of sectionIds) {
    const sectionPageLinksResult = await invokeDocCrudList(
      apiState,
      options,
      resolvedContext,
      'docman.section-page-link.list',
      { sectionId },
    )
    const links = sortNumericRecords(unwrapListItems(sectionPageLinksResult), 'position')
    sectionPageLinksBySectionId.set(sectionId, links)
    for (const link of links) {
      const pageVersionId = normalizeNonEmpty(link.pageVersionId)
      if (pageVersionId) pageVersionIds.add(pageVersionId)
    }
  }

  const pageVersions = new Map<string, Record<string, unknown>>()
  for (const pageVersionId of pageVersionIds) {
    const pageVersion = unwrapResultData<Record<string, unknown>>(
      await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.page-version.get', pageVersionId),
    )
    if (pageVersion) pageVersions.set(pageVersionId, pageVersion)
  }

  const childLinksByParentId = new Map<string, Record<string, unknown>[]>()
  const rootLinks: Record<string, unknown>[] = []
  for (const link of documentLinks) {
    const parentLinkId = normalizeNonEmpty(link.parentLinkId)
    if (!parentLinkId) {
      rootLinks.push(link)
      continue
    }
    const bucket = childLinksByParentId.get(parentLinkId) ?? []
    bucket.push(link)
    childLinksByParentId.set(parentLinkId, bucket)
  }

  const toLitePageVersion = (pageVersion: Record<string, unknown>): Record<string, unknown> => {
    const lite: LitePageVersion = {
      id: normalizeNonEmpty(pageVersion.id),
      pageId: normalizeNonEmpty(pageVersion.pageId),
      version: pageVersion.version,
      title: pageVersion.title,
      format: pageVersion.format,
      status: pageVersion.status,
    }
    return compactPayload(lite)
  }

  const projectPageVersion = (
    pageVersion: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined => {
    if (!pageVersion) return undefined
    return titlesOnly ? toLitePageVersion(pageVersion) : pageVersion
  }

  const buildPageNode = (link: Record<string, unknown>) => {
    const pageVersionId = normalizeNonEmpty(link.pageVersionId)
    return compactPayload({
      kind: 'page',
      link,
      pageVersionId,
      pageVersion: projectPageVersion(pageVersionId ? pageVersions.get(pageVersionId) : undefined),
    })
  }

  const buildSectionNode = (link: Record<string, unknown>, depth = 0): Record<string, unknown> => {
    const linkId = normalizeNonEmpty(link.id) ?? ''
    const sectionId = normalizeNonEmpty(link.sectionId)
    const childLinks = sortNumericRecords(childLinksByParentId.get(linkId) ?? [], 'position')
    const sectionPageLinks = sortNumericRecords(sectionPageLinksBySectionId.get(sectionId ?? '') ?? [], 'position')
    const recurseSections = maxDepth === undefined || depth < maxDepth

    return compactPayload({
      kind: 'section',
      link,
      sectionId,
      section: sectionId ? sections.get(sectionId) : undefined,
      pages: childLinks.filter((entry) => normalizeNonEmpty(entry.kind) === 'page').map(buildPageNode),
      sections: recurseSections
        ? childLinks
            .filter((entry) => normalizeNonEmpty(entry.kind) === 'section')
            .map((entry) => buildSectionNode(entry, depth + 1))
        : [],
      sectionPages: sectionPageLinks.map((sectionPageLink) => {
        const sectionPageVersionId = normalizeNonEmpty(sectionPageLink.pageVersionId)
        return compactPayload({
          link: sectionPageLink,
          pageVersionId: sectionPageVersionId,
          pageVersion: projectPageVersion(sectionPageVersionId ? pageVersions.get(sectionPageVersionId) : undefined),
        })
      }),
    })
  }

  return {
    documentVersionId,
    documentVersion,
    document,
    sections: rootLinks
      .filter((link) => normalizeNonEmpty(link.kind) === 'section')
      .map((link) => buildSectionNode(link, 0)),
    rootPages: rootLinks.filter((link) => normalizeNonEmpty(link.kind) === 'page').map(buildPageNode),
  }
}

async function emitDocResult(params: {
  options: { json?: boolean }
  command: string
  surface: string
  resolvedContext: ResolvedDocContext
  input: Record<string, unknown>
  result: unknown
  successText: string
  artifacts?: Record<string, string>
}): Promise<void> {
  if (params.options.json) {
    console.log(
      JSON.stringify(
        buildEnvelope({
          command: params.command,
          surface: params.surface,
          resolvedContext: buildResolvedContextRecord(params.resolvedContext),
          input: params.input,
          result: params.result,
          artifacts: params.artifacts,
        }),
        null,
        2,
      ),
    )
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(params.result, null, 2))
}

async function guardDocWrite(params: {
  options: { apply?: boolean; preview?: boolean; json?: boolean }
  command: string
  surface: string
  resolvedContext: ResolvedDocContext
  input: Record<string, unknown>
}): Promise<boolean> {
  if (params.options.apply) return false
  if (params.options.preview) {
    await emitDocResult({
      options: params.options,
      command: params.command,
      surface: params.surface,
      resolvedContext: params.resolvedContext,
      input: params.input,
      result: {
        preview: true,
        applyRequired: true,
        message: 'Validated input. Re-run with --apply to execute the Docman write.',
      },
      successText: 'Docman write preview ready.',
    })
    return true
  }
  throw new Error('This command mutates Docman state. Re-run with --apply or use --preview.')
}

async function guardMirrorFileWrite(params: {
  options: { apply?: boolean; preview?: boolean; json?: boolean }
  command: string
  surface: string
  resolvedContext: ResolvedDocContext
  input: Record<string, unknown>
}): Promise<boolean> {
  if (params.options.apply) return false
  if (params.options.preview) {
    await emitDocResult({
      options: params.options,
      command: params.command,
      surface: params.surface,
      resolvedContext: params.resolvedContext,
      input: params.input,
      result: {
        preview: true,
        applyRequired: true,
        message: 'Validated mirror write plan. Re-run with --apply to write repo-local mirror files.',
      },
      successText: 'Docman mirror preview ready.',
    })
    return true
  }
  throw new Error('This command writes repo-local Docman mirror files. Re-run with --apply or use --preview.')
}

async function ensureMirrorDocGroup(params: {
  apiState: CliApiClientState
  options: DocMirrorPushOptions
  resolvedContext: ResolvedDocContext
  groupUid: string
  groupTitle: string
  existingGroup?: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  if (params.existingGroup) return params.existingGroup
  const auditFields = await resolveDocAuditFields(params.apiState, params.options, {}, 'create')
  const input = {
    data: compactPayload({
      title: params.groupTitle,
      groupUid: params.groupUid,
      ...auditFields,
    }),
  }
  const result = await invokeDocCrudMutationRaw(
    params.apiState,
    params.options,
    params.resolvedContext,
    'docman.document-group.create',
    input,
    {
      idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.document-group.create', [
        params.groupUid,
      ]),
    },
  )
  const data = unwrapResultData<Record<string, unknown>>(result) ?? {}
  const artifacts = collectDocGroupArtifacts(result) ?? {}
  return compactPayload({
    ...data,
    id: normalizeNonEmpty(data.id) ?? artifacts.groupId,
    title: normalizeNonEmpty(data.title) ?? params.groupTitle,
    groupUid: normalizeNonEmpty(data.groupUid) ?? artifacts.groupUid ?? params.groupUid,
  }) as Record<string, unknown>
}

async function createMirrorDocument(params: {
  apiState: CliApiClientState
  options: DocMirrorPushOptions
  resolvedContext: ResolvedDocContext
  source: MarkdownSourceFile
  groupUid: string
  groupId?: string
}): Promise<Record<string, unknown>> {
  const auditFields = await resolveDocAuditFields(params.apiState, params.options, {}, 'create')
  const input = {
    data: compactPayload({
      documentUid: buildMirrorUid('DOC', params.source.title, params.source.sourceHash),
      slug: params.source.slug,
      title: params.source.title,
      summary: `Mirror source: ${params.source.relativePath}`,
      description: `Imported from repo markdown file ${params.source.relativePath}.`,
      status: normalizeNonEmpty(params.options.documentStatus) ?? 'published',
      visibility: normalizeNonEmpty(params.options.visibility) ?? 'internal',
      groupId: params.groupId,
      groupUid: params.groupUid,
      tags: ['repo-doc', 'architecture'],
      ...auditFields,
    }),
  }
  const result = await invokeDocCrudMutationRaw(
    params.apiState,
    params.options,
    params.resolvedContext,
    'docman.document.create',
    input,
    {
      idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.document.create', [
        params.groupUid,
        params.source.relativePath,
        params.source.sourceHash,
      ]),
    },
  )
  const data = unwrapCrudData(result)
  const documentId =
    normalizeNonEmpty(data.id) ??
    normalizeNonEmpty(data.documentId) ??
    normalizeNonEmpty((data.document as Record<string, unknown> | undefined)?.id) ??
    collectDocArtifacts(result)?.documentId
  if (!documentId) throw new Error(`Document was created for ${params.source.relativePath} but id could not be resolved.`)
  return compactPayload({
    ...data,
    id: documentId,
    slug: params.source.slug,
    title: params.source.title,
    groupId: params.groupId,
    groupUid: params.groupUid,
  }) as Record<string, unknown>
}

async function createMirrorDocumentVersion(params: {
  apiState: CliApiClientState
  options: DocMirrorPushOptions
  resolvedContext: ResolvedDocContext
  source: MarkdownSourceFile
  documentId: string
  version: number
}): Promise<Record<string, unknown>> {
  const auditFields = await resolveDocAuditFields(params.apiState, params.options, {}, 'create')
  const input = {
    data: compactPayload({
      documentId: params.documentId,
      version: params.version,
      label: `repo-doc:pending:${params.source.sourceHash.slice(0, 12)}`,
      title: `${params.source.title} v${params.version}`,
      summary: `Imported from ${params.source.relativePath}.`,
      releaseNotes: `repoMirrorSource=${params.source.relativePath}; sourceHash=${params.source.sourceHash}; repoMirrorContract=${DOC_MIRROR_CONTRACT}; repoMirrorComplete=false`,
      status: normalizeNonEmpty(params.options.versionStatus) ?? 'published',
      ...auditFields,
    }),
  }
  const result = await invokeDocCrudMutationRaw(
    params.apiState,
    params.options,
    params.resolvedContext,
    'docman.document-version.create',
    input,
    {
      idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.document-version.create', [
        params.source.relativePath,
        params.source.sourceHash,
        params.documentId,
        params.version,
      ]),
    },
  )
  const data = unwrapCrudData(result)
  const documentVersionId =
    normalizeNonEmpty(data.id) ??
    normalizeNonEmpty(data.documentVersionId) ??
    normalizeNonEmpty((data.documentVersion as Record<string, unknown> | undefined)?.id) ??
    collectDocArtifacts(result)?.documentVersionId
  if (!documentVersionId) {
    throw new Error(`Document version was created for ${params.source.relativePath} but id could not be resolved.`)
  }
  return compactPayload({
    ...data,
    id: documentVersionId,
    documentVersionId,
    documentId: params.documentId,
    version: params.version,
    label: `repo-doc:${params.source.sourceHash.slice(0, 12)}`,
  }) as Record<string, unknown>
}

async function markMirrorDocumentVersionComplete(params: {
  apiState: CliApiClientState
  options: DocMirrorPushOptions
  resolvedContext: ResolvedDocContext
  source: MarkdownSourceFile
  documentVersionId: string
}): Promise<void> {
  const auditFields = await resolveDocAuditFields(params.apiState, params.options, {}, 'update')
  await invokeDocCrudMutationRaw(
    params.apiState,
    params.options,
    params.resolvedContext,
    'docman.document-version.update',
    {
      id: params.documentVersionId,
      patch: compactPayload({
        label: `repo-doc:${params.source.sourceHash.slice(0, 12)}`,
        releaseNotes: `repoMirrorSource=${params.source.relativePath}; sourceHash=${params.source.sourceHash}; repoMirrorContract=${DOC_MIRROR_CONTRACT}; repoMirrorComplete=true`,
        ...auditFields,
      }),
    },
    {
      idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.document-version.update', [
        params.source.relativePath,
        params.source.sourceHash,
        params.documentVersionId,
        'complete',
      ]),
    },
  )
}

async function createMirrorSectionAndPages(params: {
  apiState: CliApiClientState
  options: DocMirrorPushOptions
  resolvedContext: ResolvedDocContext
  source: MarkdownSourceFile
  documentVersionId: string
}): Promise<{ sectionId: string; pageVersionIds: string[] }> {
  const createAuditFields = await resolveDocAuditFields(params.apiState, params.options, {}, 'create')
  const sectionResult = await invokeDocCrudMutationRaw(
    params.apiState,
    params.options,
    params.resolvedContext,
    'docman.section.create',
    {
    data: compactPayload({
      sectionUid: buildMirrorUid(
        'SEC',
        `${params.source.title} Content`,
        params.source.sourceHash,
        params.documentVersionId.slice(0, 8),
      ),
      title: 'Content',
      slug: `${params.source.slug}-content`,
      kind: 'container',
      ...createAuditFields,
    }),
    },
    {
      idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.section.create', [
        params.source.relativePath,
        params.source.sourceHash,
        params.documentVersionId,
        'content',
      ]),
    },
  )
  const sectionData = unwrapCrudData(sectionResult)
  const sectionId =
    normalizeNonEmpty(sectionData.id) ??
    normalizeNonEmpty(sectionData.sectionId) ??
    normalizeNonEmpty(sectionData.focusSectionId) ??
    normalizeNonEmpty((sectionData.section as Record<string, unknown> | undefined)?.id)
  if (!sectionId) throw new Error(`Section was created for ${params.source.relativePath} but id could not be resolved.`)

  const sectionLinkResult = await invokeDocCrudMutationRaw(
    params.apiState,
    params.options,
    params.resolvedContext,
    'docman.document-section-link.create',
    {
      data: compactPayload({
        documentVersionId: params.documentVersionId,
        kind: 'section',
        sectionId,
        position: 1,
        depth: 0,
        ...createAuditFields,
      }),
    },
    {
      idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.document-section-link.create', [
        params.source.relativePath,
        params.source.sourceHash,
        params.documentVersionId,
        'section',
      ]),
    },
  )
  const sectionLinkData = unwrapCrudData(sectionLinkResult)
  const sectionLinkId =
    normalizeNonEmpty(sectionLinkData.id) ??
    normalizeNonEmpty(sectionLinkData.documentSectionLinkId) ??
    normalizeNonEmpty((sectionLinkData.link as Record<string, unknown> | undefined)?.id)
  if (!sectionLinkId) {
    throw new Error(`Section link was created for ${params.source.relativePath} but id could not be resolved.`)
  }

  const pageVersionIds: string[] = []
  const chunks = splitMarkdownIntoPages(params.source.content, params.source.title)
  for (const [index, chunk] of chunks.entries()) {
    const pageResult = await invokeDocCrudMutationRaw(
      params.apiState,
      params.options,
      params.resolvedContext,
      'docman.page.create',
      {
        data: compactPayload({
          pageUid: buildMirrorUid(
            'PAG',
            `${params.source.title} ${chunk.title}`,
            params.source.sourceHash,
            `${params.documentVersionId.slice(0, 8)}-${index + 1}`,
          ),
          title: chunk.title,
          kind: 'content',
          ...createAuditFields,
        }),
      },
      {
        idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.page.create', [
          params.source.relativePath,
          params.source.sourceHash,
          params.documentVersionId,
          index + 1,
          chunk.title,
        ]),
      },
    )
    const pageData = unwrapCrudData(pageResult)
    const pageId =
      normalizeNonEmpty(pageData.id) ??
      normalizeNonEmpty(pageData.pageId) ??
      normalizeNonEmpty((pageData.page as Record<string, unknown> | undefined)?.id)
    if (!pageId) {
      throw new Error(`Page was created for ${params.source.relativePath} but page id could not be resolved.`)
    }
    const pageVersionResult = await invokeDocCrudMutationRaw(
      params.apiState,
      params.options,
      params.resolvedContext,
      'docman.page-version.create',
      {
        data: compactPayload({
          pageId,
          version: 1,
          title: chunk.title,
          format: 'md',
          content: chunk.content,
          status: 'draft',
          ...createAuditFields,
        }),
      },
      {
        idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.page-version.create', [
          params.source.relativePath,
          params.source.sourceHash,
          params.documentVersionId,
          pageId,
          index + 1,
        ]),
      },
    )
    const pageVersionData = unwrapCrudData(pageVersionResult)
    const pageVersionId =
      normalizeNonEmpty(pageVersionData.id) ??
      normalizeNonEmpty(pageVersionData.pageVersionId) ??
      normalizeNonEmpty((pageVersionData.pageVersion as Record<string, unknown> | undefined)?.id)
    if (!pageId || !pageVersionId) {
      throw new Error(`Page was created for ${params.source.relativePath} but page/pageVersion id could not be resolved.`)
    }

    await invokeDocCrudMutationRaw(
      params.apiState,
      params.options,
      params.resolvedContext,
      'docman.document-section-link.create',
      {
        data: compactPayload({
          documentVersionId: params.documentVersionId,
          kind: 'page',
          pageVersionId,
          parentLinkId: sectionLinkId,
          position: index + 1,
          depth: 1,
          ...createAuditFields,
        }),
      },
      {
        idempotencyKey: buildMirrorMutationIdempotencyKey(params.options, 'docman.document-section-link.create', [
          params.source.relativePath,
          params.source.sourceHash,
          params.documentVersionId,
          'page',
          index + 1,
        ]),
      },
    )
    pageVersionIds.push(pageVersionId)
  }

  return { sectionId, pageVersionIds }
}

async function ensureMirrorRetrievalState(params: {
  apiState: CliApiClientState
  options: DocMirrorPushOptions
  resolvedContext: ResolvedDocContext
  documentVersionId: string
}): Promise<void> {
  if (params.options.index !== false) {
    await callDocmanVersionRoute(params.apiState, params.options, params.resolvedContext, {
      documentVersionId: params.documentVersionId,
      suffix: 'index',
      method: 'POST',
      body: { documentVersionId: params.documentVersionId },
    })
  }
  if (params.options.summary !== false) {
    await callDocmanVersionRoute(params.apiState, params.options, params.resolvedContext, {
      documentVersionId: params.documentVersionId,
      suffix: 'summaries',
      method: 'POST',
      body: { documentVersionId: params.documentVersionId },
    })
  }
}

function buildGroupPath(
  document: Record<string, unknown>,
  groupsById: Map<string, Record<string, unknown>>,
  groupsByUid: Map<string, Record<string, unknown>>,
): string {
  const groupId = normalizeNonEmpty(document.groupId)
  const groupUid = normalizeNonEmpty(document.groupUid)
  const group = (groupId ? groupsById.get(groupId) : undefined) ?? (groupUid ? groupsByUid.get(groupUid) : undefined)
  if (!group) return pathSegmentSlug(groupUid, 'ungrouped')

  const segments: string[] = []
  const seen = new Set<string>()
  let cursor: Record<string, unknown> | undefined = group
  while (cursor) {
    const id = normalizeNonEmpty(cursor.id) ?? normalizeNonEmpty(cursor.groupUid)
    if (id && seen.has(id)) break
    if (id) seen.add(id)
    segments.unshift(pathSegmentSlug(normalizeNonEmpty(cursor.groupUid) ?? normalizeNonEmpty(cursor.title), 'group'))
    const parentId = normalizeNonEmpty(cursor.parentGroupId)
    const parentUid = normalizeNonEmpty(cursor.parentGroupUid)
    cursor = (parentId ? groupsById.get(parentId) : undefined) ?? (parentUid ? groupsByUid.get(parentUid) : undefined)
  }
  return path.join(...(segments.length > 0 ? segments : ['ungrouped']))
}

async function writeDocMirrorFile(params: {
  outputRoot: string
  groupPath: string
  document: Record<string, unknown>
  documentVersion: Record<string, unknown>
  resolvedContext: ResolvedDocContext
  target: string
  content: string
}): Promise<string> {
  const documentSlug =
    normalizeNonEmpty(params.document.slug) ??
    pathSegmentSlug(normalizeNonEmpty(params.document.title), normalizeNonEmpty(params.document.id) ?? 'document')
  const filePath = path.join(params.outputRoot, params.groupPath, `${pathSegmentSlug(documentSlug, 'document')}.md`)
  const frontmatter = renderFrontmatter({
    schemaVersion: 1,
    entityType: 'docman.document-mirror',
    readOnly: true,
    source: 'docman',
    projectId: params.resolvedContext.projectId,
    projectName: params.resolvedContext.projectName,
    projectSlug: params.resolvedContext.projectSlug,
    scopeId: params.resolvedContext.scopeId,
    groupId: params.document.groupId,
    groupUid: params.document.groupUid,
    documentId: recordId(params.document, 'documentId'),
    documentVersionId: recordId(params.documentVersion, 'documentVersionId'),
    documentVersion: params.documentVersion.version,
    documentSlug,
    title: params.document.title,
    target: params.target,
    pulledAt: new Date().toISOString(),
  })
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(
    filePath,
    `${frontmatter}<!-- READ-ONLY MIRROR: update Docman/source docs, then run aops-cli doc mirror pull. -->\n\n${params.content}`,
    'utf8',
  )
  return filePath
}

async function writeDocMirrorIndex(params: {
  outputRoot: string
  resolvedContext: ResolvedDocContext
  entries: Array<Record<string, unknown>>
}): Promise<string> {
  const indexPath = path.join(params.outputRoot, 'index.md')
  const frontmatter = renderFrontmatter({
    schemaVersion: 1,
    entityType: 'docman.document-mirror-index',
    readOnly: true,
    source: 'docman',
    projectId: params.resolvedContext.projectId,
    projectName: params.resolvedContext.projectName,
    projectSlug: params.resolvedContext.projectSlug,
    scopeId: params.resolvedContext.scopeId,
    pulledAt: new Date().toISOString(),
  })
  const lines = [
    frontmatter,
    '# Docman Mirror Index',
    '',
    'This directory is a read-only mirror of hosted Docman documents. Edit canonical Docman/source docs, then run `aops-cli doc mirror pull --apply`.',
    '',
    ...params.entries.map((entry) => {
      const title = normalizeNonEmpty(entry.title) ?? 'Untitled'
      const mirrorPath = normalizeNonEmpty(entry.mirrorPath) ?? ''
      const version = normalizeNonEmpty(entry.documentVersion) ?? ''
      return `- ${title}${version ? ` (v${version})` : ''}: ${mirrorPath}`
    }),
    '',
  ]
  await mkdir(params.outputRoot, { recursive: true })
  await writeFile(indexPath, lines.join('\n'), 'utf8')
  return indexPath
}

async function listDocMirrorIndexEntries(outputRoot: string): Promise<Array<Record<string, unknown>>> {
  const files = await listLocalMirrorMarkdownFiles(outputRoot)
  const docs = await readLocalMirrorDocumentsFromFiles(outputRoot, files)
  return docs.map((doc) => ({
    title: doc.title,
    mirrorPath: doc.relativePath,
    documentVersion: doc.documentVersion,
  }))
}

type LocalMirrorDocument = {
  filePath: string
  relativePath: string
  frontmatter: Record<string, unknown>
  body: string
  title: string
  documentId?: string
  documentVersionId?: string
  documentVersion?: string | number
  documentSlug?: string
}

type LocalMirrorIndexFileRef = {
  path: string
  size: number
  mtimeMs: number
}

type LocalMirrorDocumentIndex = {
  documents: LocalMirrorDocument[]
  indexPath: string
  indexStatus: 'fresh' | 'created' | 'rebuilt' | 'write-failed'
  sourceFileCount: number
}

type LocalDocResultPayload = {
  resolvedContext: ResolvedDocContext
  input: Record<string, unknown>
  result: Record<string, unknown>
}

function localMirrorLimit(value: unknown): number {
  const parsed = toInteger(value, '--limit')
  return parsed && parsed > 0 ? parsed : 10
}

function resolveDocMirrorRoot(context: ResolvedDocContext, mirrorDir?: string): string {
  const requested = normalizeNonEmpty(mirrorDir) ?? path.join('.aops', 'docman')
  return path.isAbsolute(requested) ? requested : path.resolve(context.repoRoot, requested)
}

function resolveLocalMirrorIndexPath(root: string): string {
  return path.join(root, '.cache', 'local-mirror-index.json')
}

async function listLocalMirrorMarkdownFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.')) return listLocalMirrorMarkdownFiles(fullPath)
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'index.md') return [fullPath]
      return []
    }))
    return nested.flat().sort()
  } catch {
    return []
  }
}

async function collectLocalMirrorFileRefs(root: string, files: string[]): Promise<LocalMirrorIndexFileRef[]> {
  const refs: LocalMirrorIndexFileRef[] = []
  for (const filePath of files) {
    const info = await stat(filePath)
    refs.push({
      path: path.relative(root, filePath).split(path.sep).join('/'),
      size: info.size,
      mtimeMs: Math.trunc(info.mtimeMs),
    })
  }
  return refs
}

function sameLocalMirrorFileRefs(left: LocalMirrorIndexFileRef[], right: LocalMirrorIndexFileRef[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const leftRef = left[index]
    const rightRef = right[index]
    if (!leftRef || !rightRef) return false
    if (leftRef.path !== rightRef.path || leftRef.size !== rightRef.size || leftRef.mtimeMs !== rightRef.mtimeMs) {
      return false
    }
  }
  return true
}

function hydrateLocalMirrorIndexedDocument(root: string, value: unknown): LocalMirrorDocument | undefined {
  if (!isRecord(value)) return undefined
  const relativePath = normalizeNonEmpty(value.relativePath)
  const title = normalizeNonEmpty(value.title)
  const body = typeof value.body === 'string' ? value.body : undefined
  if (!relativePath || !title || body === undefined) return undefined
  return {
    filePath: path.join(root, relativePath),
    relativePath,
    frontmatter: isRecord(value.frontmatter) ? value.frontmatter : {},
    body,
    title,
    documentId: normalizeNonEmpty(value.documentId),
    documentVersionId: normalizeNonEmpty(value.documentVersionId),
    documentVersion: typeof value.documentVersion === 'string' || typeof value.documentVersion === 'number'
      ? value.documentVersion
      : undefined,
    documentSlug: normalizeNonEmpty(value.documentSlug),
  }
}

async function readFreshLocalMirrorIndex(
  root: string,
  indexPath: string,
  files: LocalMirrorIndexFileRef[],
): Promise<LocalMirrorDocumentIndex | undefined> {
  try {
    const cached = JSON.parse(await readFile(indexPath, 'utf8'))
    if (!isRecord(cached)) return undefined
    if (cached.entityType !== 'docman.local-mirror-index' || cached.schemaVersion !== 1) return undefined
    const cachedFiles = Array.isArray(cached.files)
      ? cached.files.filter((entry): entry is LocalMirrorIndexFileRef => {
          if (!isRecord(entry)) return false
          return typeof entry.path === 'string' && typeof entry.size === 'number' && typeof entry.mtimeMs === 'number'
        })
      : []
    if (!sameLocalMirrorFileRefs(cachedFiles, files)) return undefined
    const documents = Array.isArray(cached.documents)
      ? cached.documents.map((entry) => hydrateLocalMirrorIndexedDocument(root, entry)).filter((entry): entry is LocalMirrorDocument => Boolean(entry))
      : []
    return {
      documents,
      indexPath,
      indexStatus: 'fresh',
      sourceFileCount: files.length,
    }
  } catch {
    return undefined
  }
}

async function readLocalMirrorDocumentsFromFiles(root: string, files: string[]): Promise<LocalMirrorDocument[]> {
  const docs: LocalMirrorDocument[] = []
  for (const filePath of files) {
    const parsed = parseFrontmatterDocument(await readFile(filePath, 'utf8'))
    if (normalizeNonEmpty(parsed.frontmatter.entityType) !== 'docman.document-mirror') continue
    const title = normalizeNonEmpty(parsed.frontmatter.title) ?? path.basename(filePath, '.md')
    docs.push({
      filePath,
      relativePath: path.relative(root, filePath).split(path.sep).join('/'),
      frontmatter: parsed.frontmatter,
      body: stripLocalMirrorBody(parsed.body),
      title,
      documentId: normalizeNonEmpty(parsed.frontmatter.documentId),
      documentVersionId: normalizeNonEmpty(parsed.frontmatter.documentVersionId),
      documentVersion: parsed.frontmatter.documentVersion as string | number | undefined,
      documentSlug: normalizeNonEmpty(parsed.frontmatter.documentSlug),
    })
  }
  return docs
}

async function writeLocalMirrorDocumentIndex(params: {
  root: string
  indexPath: string
  files: LocalMirrorIndexFileRef[]
  documents: LocalMirrorDocument[]
}): Promise<boolean> {
  const payload = {
    schemaVersion: 1,
    entityType: 'docman.local-mirror-index',
    generatedAt: new Date().toISOString(),
    mirrorRoot: params.root,
    files: params.files,
    documents: params.documents.map((doc) => ({
      relativePath: doc.relativePath,
      frontmatter: doc.frontmatter,
      body: doc.body,
      title: doc.title,
      documentId: doc.documentId,
      documentVersionId: doc.documentVersionId,
      documentVersion: doc.documentVersion,
      documentSlug: doc.documentSlug,
    })),
  }
  try {
    await mkdir(path.dirname(params.indexPath), { recursive: true })
    await writeFile(params.indexPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}

async function readLocalMirrorDocuments(root: string): Promise<LocalMirrorDocumentIndex> {
  const indexPath = resolveLocalMirrorIndexPath(root)
  const files = await listLocalMirrorMarkdownFiles(root)
  const fileRefs = await collectLocalMirrorFileRefs(root, files)
  let hadIndex = true
  try {
    await stat(indexPath)
  } catch {
    hadIndex = false
  }
  const cached = await readFreshLocalMirrorIndex(root, indexPath, fileRefs)
  if (cached) return cached

  const documents = await readLocalMirrorDocumentsFromFiles(root, files)
  const wrote = await writeLocalMirrorDocumentIndex({ root, indexPath, files: fileRefs, documents })
  return {
    documents,
    indexPath,
    indexStatus: wrote ? (hadIndex ? 'rebuilt' : 'created') : 'write-failed',
    sourceFileCount: files.length,
  }
}

function stripLocalMirrorBody(body: string): string {
  return body
    .replace(/^<!--\s*READ-ONLY MIRROR:[\s\S]*?-->\s*/i, '')
    .replace(/\n_Release Notes:_ [^\n]*\n/gi, '\n')
    .trim()
}

function queryTokens(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().split(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/i).map((part) => part.trim()).filter(Boolean)))
}

function occurrenceCount(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index >= 0) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

function localMirrorScore(doc: LocalMirrorDocument, tokens: string[]): number {
  const title = doc.title.toLowerCase()
  const body = doc.body.toLowerCase()
  return tokens.reduce((score, token) => score + occurrenceCount(title, token) * 8 + occurrenceCount(body, token), 0)
}

function localMirrorExcerpt(body: string, tokens: string[]): string {
  const normalized = body.toLowerCase()
  const firstIndex = tokens.reduce((best, token) => {
    const index = normalized.indexOf(token)
    if (index < 0) return best
    return best < 0 ? index : Math.min(best, index)
  }, -1)
  const start = Math.max(0, (firstIndex < 0 ? 0 : firstIndex) - 90)
  const end = Math.min(body.length, (firstIndex < 0 ? 220 : firstIndex + 220))
  const excerpt = body.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '...' : ''}${excerpt}${end < body.length ? '...' : ''}`
}

function buildLocalMirrorSearchResult(params: {
  context: ResolvedDocContext
  mirrorRoot: string
  documents: LocalMirrorDocument[]
  indexPath?: string
  indexStatus?: string
  sourceFileCount?: number
  q: string
  limit?: string | number
  documentVersionId?: string
}): Record<string, unknown> {
  const tokens = queryTokens(params.q)
  const candidates = normalizeNonEmpty(params.documentVersionId)
    ? params.documents.filter((doc) => doc.documentVersionId === params.documentVersionId)
    : params.documents
  const scored = candidates
    .map((doc) => ({ doc, score: localMirrorScore(doc, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, localMirrorLimit(params.limit))
  const hits = scored.map(({ doc, score }) => compactPayload({
    itemKind: 'document',
    anchor: `local-mirror:${doc.relativePath}`,
    depth: 0,
    title: doc.title,
    breadcrumb: doc.title,
    documentId: doc.documentId,
    documentTitle: doc.title,
    documentSlug: doc.documentSlug,
    documentVersionId: doc.documentVersionId,
    documentVersionTitle: doc.documentVersion ? `${doc.title} v${String(doc.documentVersion)}` : doc.title,
    documentVersionNumber: doc.documentVersion,
    score,
    excerpt: localMirrorExcerpt(doc.body, tokens),
    matchedBy: ['localMirror'],
    mirrorPath: doc.relativePath,
  }))
  return {
    ok: true,
    scopeId: params.context.scopeId,
    q: params.q,
    hits,
    provenance: {
      strategy: 'local-mirror-search-v1',
      retrievalStrategy: 'local-mirror',
      source: 'repo-local-docman-mirror',
      mirrorRoot: params.mirrorRoot,
      indexPath: params.indexPath,
      indexStatus: params.indexStatus,
      sourceFileCount: params.sourceFileCount,
      totalDocumentCount: params.documents.length,
      searchedDocumentCount: candidates.length,
      autoBuiltDocumentCount: 0,
      failedDocumentCount: 0,
    },
    buildReport: {
      autoBuiltDocumentVersionIds: [],
      failures: [],
    },
  }
}

async function resolveLocalDocContext(options: DocContextOptions): Promise<ResolvedDocContext> {
  const resolved = await resolveProjectBindingContext(options, { requireProject: true })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  if (!scopeId) throw new Error('Docman local mirror fallback requires --scope-id or repo-bound project context.')
  return { ...resolved, scopeId }
}

function assertDocReadMode(options: { local?: boolean; remote?: boolean }): void {
  if (options.local === true && options.remote === true) {
    throw new Error('Use either --local or --remote, not both.')
  }
}

function localMirrorHits(result: unknown): Record<string, unknown>[] {
  const payload = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : undefined)
  return Array.isArray(payload?.hits) ? payload.hits.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : []
}

function localMirrorCitationCount(result: unknown): number {
  const payload = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : undefined)
  return Array.isArray(payload?.citations) ? payload.citations.length : 0
}

function localMirrorDocumentCount(result: unknown): number {
  const payload = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : undefined)
  const provenance = isRecord(payload?.provenance) ? payload.provenance : undefined
  const searchProvenance = isRecord(provenance?.searchProvenance) ? provenance.searchProvenance : undefined
  const direct = typeof provenance?.totalDocumentCount === 'number' ? provenance.totalDocumentCount : undefined
  const nested = typeof searchProvenance?.totalDocumentCount === 'number' ? searchProvenance.totalDocumentCount : undefined
  return direct ?? nested ?? 0
}

function formatScopeAnswerLine(hit: Record<string, unknown>, index: number): string {
  const documentTitle = normalizeNonEmpty(hit.documentTitle) ?? normalizeNonEmpty(hit.title) ?? 'Document'
  const breadcrumb = normalizeNonEmpty(hit.breadcrumb) ?? normalizeNonEmpty(hit.title)
  const excerpt = normalizeNonEmpty(hit.excerpt) ?? ''
  return `${index + 1}. ${documentTitle}${breadcrumb ? ` / ${breadcrumb}` : ''}: ${excerpt}`
}

function buildScopeAnswerResult(params: {
  searchResult: unknown
  scopeId?: string
  q: string
  answerSource: string
  strategy: string
  retrievalStrategy: string
  source: string
  mirrorRoot?: string
}): Record<string, unknown> {
  const searchPayload =
    unwrapResultData<Record<string, unknown>>(params.searchResult) ??
    (isRecord(params.searchResult) ? params.searchResult : {})
  const hits = localMirrorHits(searchPayload)
  const answer = hits.length > 0
    ? hits.map(formatScopeAnswerLine).join('\n')
    : 'No matching scope citations were found.'
  const searchProvenance = isRecord(searchPayload.provenance) ? searchPayload.provenance : undefined
  const buildReport = isRecord(searchPayload.buildReport) ? searchPayload.buildReport : undefined

  return compactPayload({
    ok: true,
    scopeId: normalizeNonEmpty(searchPayload.scopeId) ?? params.scopeId,
    q: normalizeNonEmpty(searchPayload.q) ?? params.q,
    built: false,
    answer,
    answerSource: params.answerSource,
    citations: hits,
    provenance: compactPayload({
      strategy: params.strategy,
      retrievalStrategy: params.retrievalStrategy,
      source: params.source,
      mirrorRoot: params.mirrorRoot,
      citationCount: hits.length,
      searchProvenance,
    }),
    buildReport,
  })
}

async function buildLocalDocScopeSearchPayload(options: DocScopeSearchOptions, q: string): Promise<LocalDocResultPayload> {
  const resolvedContext = await resolveLocalDocContext(options)
  const mirrorRoot = resolveDocMirrorRoot(resolvedContext, options.mirrorDir)
  const mirrorIndex = await readLocalMirrorDocuments(mirrorRoot)
  const input = compactPayload({
    scopeId: resolvedContext.scopeId,
    q,
    limit: toInteger(options.limit, '--limit'),
    retrievalStrategy: 'local-mirror',
    mirrorRoot,
    indexPath: mirrorIndex.indexPath,
    indexStatus: mirrorIndex.indexStatus,
    local: true,
  })
  const result = buildLocalMirrorSearchResult({
    context: resolvedContext,
    mirrorRoot,
    documents: mirrorIndex.documents,
    indexPath: mirrorIndex.indexPath,
    indexStatus: mirrorIndex.indexStatus,
    sourceFileCount: mirrorIndex.sourceFileCount,
    q,
    limit: options.limit,
  })
  return { resolvedContext, input, result }
}

async function runLocalDocScopeSearch(options: DocScopeSearchOptions, q: string): Promise<void> {
  const { resolvedContext, input, result } = await buildLocalDocScopeSearchPayload(options, q)
  if (options.json) {
    await emitDocResult({
      options,
      command: 'doc.scope.search',
      surface: 'repo-local-docman-mirror',
      resolvedContext,
      input,
      result,
      successText: 'Local Docman mirror search completed.',
    })
    return
  }
  renderDocScopeSearchResult(result)
}

async function buildLocalDocScopeAnswerPayload(options: DocScopeAnswerOptions, q: string): Promise<LocalDocResultPayload> {
  const searchPayload = await buildLocalDocScopeSearchPayload(options, q)
  const mirrorRoot = normalizeNonEmpty(searchPayload.input.mirrorRoot)
  const input = compactPayload({
    scopeId: searchPayload.resolvedContext.scopeId,
    q,
    limit: toInteger(options.limit, '--limit'),
    retrievalStrategy: 'local-mirror',
    mirrorRoot,
    indexPath: normalizeNonEmpty(searchPayload.input.indexPath),
    indexStatus: normalizeNonEmpty(searchPayload.input.indexStatus),
    local: true,
  })
  const result = buildScopeAnswerResult({
    searchResult: searchPayload.result,
    scopeId: searchPayload.resolvedContext.scopeId,
    q,
    answerSource: 'local-mirror',
    strategy: 'local-mirror-scope-answer-pack-v1',
    retrievalStrategy: 'local-mirror',
    source: 'repo-local-docman-mirror',
    mirrorRoot,
  })
  return { resolvedContext: searchPayload.resolvedContext, input, result }
}

async function runLocalDocScopeAnswer(options: DocScopeAnswerOptions, q: string): Promise<void> {
  const { resolvedContext, input, result } = await buildLocalDocScopeAnswerPayload(options, q)
  await emitDocResult({
    options,
    command: 'doc.scope.answer',
    surface: 'repo-local-docman-mirror',
    resolvedContext,
    input,
    result,
    successText: 'Local Docman mirror scope answer pack loaded.',
  })
}

async function buildLocalDocSearchPayload(
  options: DocSearchOptions,
  documentVersionId: string,
  q: string,
): Promise<LocalDocResultPayload> {
  const resolvedContext = await resolveLocalDocContext(options)
  const mirrorRoot = resolveDocMirrorRoot(resolvedContext, options.mirrorDir)
  const mirrorIndex = await readLocalMirrorDocuments(mirrorRoot)
  const input = compactPayload({
    documentVersionId,
    q,
    limit: toInteger(options.limit, '--limit'),
    retrievalStrategy: 'local-mirror',
    ensure: 'local-mirror',
    mirrorRoot,
    indexPath: mirrorIndex.indexPath,
    indexStatus: mirrorIndex.indexStatus,
    local: true,
  })
  const result = buildLocalMirrorSearchResult({
    context: resolvedContext,
    mirrorRoot,
    documents: mirrorIndex.documents,
    indexPath: mirrorIndex.indexPath,
    indexStatus: mirrorIndex.indexStatus,
    sourceFileCount: mirrorIndex.sourceFileCount,
    q,
    limit: options.limit,
    documentVersionId,
  })
  return { resolvedContext, input, result }
}

async function runLocalDocSearch(options: DocSearchOptions, documentVersionId: string, q: string): Promise<void> {
  const { resolvedContext, input, result } = await buildLocalDocSearchPayload(options, documentVersionId, q)
  await emitDocResult({
    options,
    command: 'doc.search',
    surface: 'repo-local-docman-mirror',
    resolvedContext,
    input,
    result,
    successText: 'Local Docman mirror search completed.',
  })
}

async function buildLocalDocAnswerPayload(
  options: DocAnswerOptions,
  documentVersionId: string,
  q: string,
): Promise<LocalDocResultPayload> {
  const resolvedContext = await resolveLocalDocContext(options)
  const mirrorRoot = resolveDocMirrorRoot(resolvedContext, options.mirrorDir)
  const mirrorIndex = await readLocalMirrorDocuments(mirrorRoot)
  const searchResult = buildLocalMirrorSearchResult({
    context: resolvedContext,
    mirrorRoot,
    documents: mirrorIndex.documents,
    indexPath: mirrorIndex.indexPath,
    indexStatus: mirrorIndex.indexStatus,
    sourceFileCount: mirrorIndex.sourceFileCount,
    q,
    limit: options.limit,
    documentVersionId,
  })
  const hits = Array.isArray(searchResult.hits) ? searchResult.hits.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : []
  const answer = hits.length > 0
    ? hits.map((hit, index) => `${index + 1}. ${normalizeNonEmpty(hit.documentTitle) ?? 'Local mirror'}: ${normalizeNonEmpty(hit.excerpt) ?? ''}`).join('\n')
    : 'No matching local mirror citations were found.'
  const input = compactPayload({
    documentVersionId,
    q,
    limit: toInteger(options.limit, '--limit'),
    retrievalStrategy: 'local-mirror',
    ensure: 'local-mirror',
    mirrorRoot,
    indexPath: mirrorIndex.indexPath,
    indexStatus: mirrorIndex.indexStatus,
    local: true,
  })
  const result = {
    ok: true,
    documentVersionId,
    q,
    built: false,
    answer,
    answerSource: 'local-mirror',
    citations: hits,
    provenance: {
      strategy: 'local-mirror-answer-pack-v1',
      retrievalStrategy: 'local-mirror',
      source: 'repo-local-docman-mirror',
      mirrorRoot,
      indexPath: mirrorIndex.indexPath,
      indexStatus: mirrorIndex.indexStatus,
      citationCount: hits.length,
    },
  }
  return { resolvedContext, input, result }
}

async function runLocalDocAnswer(options: DocAnswerOptions, documentVersionId: string, q: string): Promise<void> {
  const { resolvedContext, input, result } = await buildLocalDocAnswerPayload(options, documentVersionId, q)
  await emitDocResult({
    options,
    command: 'doc.answer',
    surface: 'repo-local-docman-mirror',
    resolvedContext,
    input,
    result,
    successText: 'Local Docman mirror answer pack loaded.',
  })
}

function normalizeDocImportExistingGraphPolicy(options: DocImportMarkdownOptions): 'error' | 'append' | 'replace' {
  if (options.appendExistingGraph && options.replaceExistingGraph) {
    throw new Error('Use only one of --append-existing-graph or --replace-existing-graph.')
  }
  if (options.appendExistingGraph) return 'append'
  if (options.replaceExistingGraph) return 'replace'
  const explicit = normalizeNonEmpty(options.existingGraphPolicy)
  if (!explicit) return 'error'
  if (explicit === 'error' || explicit === 'append' || explicit === 'replace') return explicit
  throw new Error('Invalid --existing-graph-policy. Expected one of: error, append, replace.')
}

function normalizeDocImportSlugStrategy(options: DocImportMarkdownOptions): 'hash-suffix-on-collision' | 'kebab-from-title' {
  const explicit = normalizeNonEmpty(options.slugStrategy)
  if (!explicit) return 'hash-suffix-on-collision'
  if (explicit === 'hash-suffix-on-collision' || explicit === 'kebab-from-title') return explicit
  throw new Error('Invalid --slug-strategy. Expected one of: hash-suffix-on-collision, kebab-from-title.')
}

export async function runDocImportMarkdown(options: DocImportMarkdownOptions = {}): Promise<void> {
  try {
    if (options.fromMarkdown !== true) {
      throw new Error('Doc import currently requires --from-markdown.')
    }

    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState, { forceHostedScope: true })
    const documentVersionId = requireDocumentVersionId({ documentVersionId: options.documentVersionId })
    const source = readMarkdownImportSource(options.source)
    const nodes = parseMarkdownHeadingGraph(source.content)
    const baseline = readMarkdownBaselineSource(options.baseline)
    const baselineGuard = baseline
      ? buildMarkdownBaselineGuardReport({
          baselinePath: baseline.sourcePath,
          baselineNodes: parseMarkdownHeadingGraph(baseline.content),
          sourcePath: source.sourcePath,
          sourceNodes: nodes,
          guardTargets: options.guardTarget ?? [],
        })
      : undefined
    const dryRun = options.dryRun === true || options.preview === true || options.apply !== true
    const auditFields = await resolveDocAuditFields(apiState, options, {}, 'create')
    const importOptions = compactPayload({
      dryRun,
      existingGraphPolicy: normalizeDocImportExistingGraphPolicy(options),
      slugStrategy: normalizeDocImportSlugStrategy(options),
      bodyAssignment: normalizeNonEmpty(options.bodyAssignment) ?? 'leaf-page-content',
      headingToPagePolicy: normalizeNonEmpty(options.headingToPagePolicy) ?? 'h4-and-below',
      synthesizeOverviewPages: options.synthesizeOverviewPages === true ? true : undefined,
    })

    if (importOptions.bodyAssignment !== 'leaf-page-content') {
      throw new Error('Invalid --body-assignment. Only leaf-page-content is supported in this MVP.')
    }
    if (importOptions.headingToPagePolicy !== 'h4-and-below') {
      throw new Error('Invalid --heading-to-page-policy. Only h4-and-below is supported in this MVP.')
    }

    const input = compactPayload({
      documentVersionId,
      scopeId: resolvedContext.scopeId,
      parsedGraph: {
        sourceHash: sha256Hex(source.content),
        sourcePath: source.sourcePath,
        nodes,
      },
      options: importOptions,
      ...auditFields,
    })
    if (baselineGuard?.status === 'blocked' && !dryRun && options.confirm !== true) {
      throw new Error(
        `Doc import baseline guard blocked ${baselineGuard.blockingDeltaCount} unrelated markdown deltas. ` +
        'Run the command with --dry-run --json to inspect result.baselineGuard, add --guard-target for the intended heading, or use --confirm only after reviewing the full-import delta.',
      )
    }
    const toolId = 'docman.document-version.import-headings'
    const invokeInput = compactPayload({
      pathParams: { id: documentVersionId },
      body: input,
    }) as Record<string, unknown>
    const result = dryRun
      ? await invokeDocHostedTool(apiState, options, resolvedContext, toolId, invokeInput)
      : await (async () => {
          ensureGuardedWrite(options, 'This command imports a Docman section/page graph.')
          return invokeDocCrudMutationRaw(apiState, options, resolvedContext, toolId, invokeInput)
        })()

    await emitDocResult({
      options,
      command: 'doc.import',
      surface: toolId,
      resolvedContext,
      input: baselineGuard ? compactPayload({ ...input, baselineGuard }) as Record<string, unknown> : input,
      result: baselineGuard ? { import: result, baselineGuard } : result,
      artifacts: compactPayload({
        documentVersionId,
        sectionCount: String(countParsedHeadingNodes(nodes, 'section')),
        sourceHash: sha256Hex(source.content).slice(0, 12),
        baselineGuardStatus: baselineGuard?.status,
        baselineBlockingDeltas: baselineGuard ? String(baselineGuard.blockingDeltaCount) : undefined,
      }) as Record<string, string>,
      successText: dryRun ? 'Docman heading import dry-run completed.' : 'Docman heading import completed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocMirrorPush(options: DocMirrorPushOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState, { forceHostedScope: true })
    const groupUid = normalizeNonEmpty(options.groupUid) ?? 'architecture'
    const groupTitle = normalizeNonEmpty(options.groupTitle) ?? 'Architecture'
    const sources = await readRootMarkdownSources(options.sourceDir)
    if (sources.length === 0) {
      throw new Error(`No root markdown files found in ${path.resolve(normalizeNonEmpty(options.sourceDir) ?? 'docs')}.`)
    }

    const existingGroup = await findDocGroupByUid(apiState, options, resolvedContext, groupUid)
    const groupId = recordId(existingGroup, 'groupId')
    const plan: DocMirrorPushPlanItem[] = []
    for (const source of sources) {
      const existingDocument = await findDocumentBySlug(apiState, options, resolvedContext, {
        slug: source.slug,
        groupUid,
        groupId,
      })
      const documentId = recordId(existingDocument, 'documentId')
      const versions = documentId ? await listDocumentVersions(apiState, options, resolvedContext, documentId) : []
      const matchingVersion = findVersionBySourceHash(versions, source.sourceHash)
      const matchingVersionId = recordId(matchingVersion, 'documentVersionId')
      plan.push({
        ...source,
        action: matchingVersionId ? 'up-to-date' : documentId ? 'create-version' : 'create-document',
        documentId,
        documentVersionId: matchingVersionId,
        nextVersion: matchingVersionId ? recordVersion(matchingVersion ?? {}) : nextDocumentVersionNumber(versions),
      })
    }

    const input = compactPayload({
      sourceDir: path.resolve(normalizeNonEmpty(options.sourceDir) ?? 'docs'),
      groupUid,
      groupTitle,
      documentStatus: normalizeNonEmpty(options.documentStatus) ?? 'published',
      versionStatus: normalizeNonEmpty(options.versionStatus) ?? 'published',
      visibility: normalizeNonEmpty(options.visibility) ?? 'internal',
      buildIndex: options.index !== false,
      buildSummary: options.summary !== false,
      files: plan.map((item) => ({
        relativePath: item.relativePath,
        title: item.title,
        slug: item.slug,
        sourceHash: item.sourceHash,
        action: item.action,
        documentId: item.documentId,
        documentVersionId: item.documentVersionId,
        nextVersion: item.nextVersion,
      })),
    })
    if (await guardDocWrite({
      options,
      command: 'doc.mirror.push',
      surface: 'docman repo-root markdown import',
      resolvedContext,
      input,
    })) return

    const group = await ensureMirrorDocGroup({
      apiState,
      options,
      resolvedContext,
      groupUid,
      groupTitle,
      existingGroup,
    })
    const ensuredGroupId = recordId(group, 'groupId')

    const results: Record<string, unknown>[] = []
    for (const item of plan) {
      let documentId = item.documentId
      let documentVersionId = item.documentVersionId
      let action = item.action

      if (!documentId) {
        const document = await createMirrorDocument({
          apiState,
          options,
          resolvedContext,
          source: item,
          groupUid,
          groupId: ensuredGroupId,
        })
        documentId = recordId(document, 'documentId')
      }

      if (!documentId) {
        throw new Error(`Document id could not be resolved for ${item.relativePath}.`)
      }

      if (!documentVersionId) {
        const versions = await listDocumentVersions(apiState, options, resolvedContext, documentId)
        const matchingVersion = findVersionBySourceHash(versions, item.sourceHash)
        documentVersionId = recordId(matchingVersion, 'documentVersionId')
        if (documentVersionId) {
          action = 'up-to-date'
        } else {
          const version = item.nextVersion && item.nextVersion > 0 ? item.nextVersion : nextDocumentVersionNumber(versions)
          const documentVersion = await createMirrorDocumentVersion({
            apiState,
            options,
            resolvedContext,
            source: item,
            documentId,
            version,
          })
          documentVersionId = recordId(documentVersion, 'documentVersionId')
          await createMirrorSectionAndPages({
            apiState,
            options,
            resolvedContext,
            source: item,
            documentVersionId: documentVersionId!,
          })
          await markMirrorDocumentVersionComplete({
            apiState,
            options,
            resolvedContext,
            source: item,
            documentVersionId: documentVersionId!,
          })
          action = item.action === 'create-document' ? 'create-document' : 'create-version'
        }
      }

      if (!documentVersionId) {
        throw new Error(`Document version id could not be resolved for ${item.relativePath}.`)
      }

      await ensureMirrorRetrievalState({
        apiState,
        options,
        resolvedContext,
        documentVersionId,
      })
      results.push({
        relativePath: item.relativePath,
        title: item.title,
        slug: item.slug,
        sourceHash: item.sourceHash,
        action,
        documentId,
        documentVersionId,
      })
    }

    await emitDocResult({
      options,
      command: 'doc.mirror.push',
      surface: 'docman repo-root markdown import',
      resolvedContext,
      input,
      result: {
        groupId: ensuredGroupId,
        groupUid,
        importedCount: results.filter((entry) => entry.action !== 'up-to-date').length,
        upToDateCount: results.filter((entry) => entry.action === 'up-to-date').length,
        documents: results,
      },
      artifacts: {
        groupId: ensuredGroupId ?? '',
        groupUid,
        documentCount: String(results.length),
      },
      successText: 'Docman mirror push completed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocMirrorPull(options: DocMirrorPullOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState, { forceHostedScope: true })
    const target = normalizeNonEmpty(options.target) ?? 'markdown'
    if (target !== 'markdown' && target !== 'html') {
      throw new Error('Target must be markdown or html.')
    }

    const outputRoot = path.resolve(normalizeNonEmpty(options.outDir) ?? path.join('.aops', 'docman'))
    const groupUid = normalizeNonEmpty(options.groupUid)
    const groups = await listDocGroups(apiState, options, resolvedContext)
    const groupsById = new Map<string, Record<string, unknown>>()
    const groupsByUid = new Map<string, Record<string, unknown>>()
    for (const group of groups) {
      const id = normalizeNonEmpty(group.id)
      const uid = normalizeNonEmpty(group.groupUid)
      if (id) groupsById.set(id, group)
      if (uid) groupsByUid.set(uid, group)
    }

    const documentSlugFilters = new Set(
      (options.documentSlug ?? [])
        .map((entry) => normalizeSlugFilter(entry))
        .filter((entry): entry is string => Boolean(entry)),
    )
    const allDocuments = await listDocuments(
      apiState,
      options,
      resolvedContext,
      compactPayload({
        groupUid,
        status: normalizeNonEmpty(options.status),
      }),
      compactPayload({
        limit: toInteger(options.limit, '--limit'),
      }),
    )
    const documents = documentSlugFilters.size > 0
      ? allDocuments.filter((document) => {
          const documentSlug = normalizeSlugFilter(document.slug)
          const fallbackSlug = normalizeSlugFilter(document.title)
          return Boolean(
            (documentSlug && documentSlugFilters.has(documentSlug)) ||
            (fallbackSlug && documentSlugFilters.has(fallbackSlug)),
          )
        })
      : allDocuments
    if (documentSlugFilters.size > 0 && documents.length === 0) {
      throw new Error(`No Docman documents matched --document-slug ${[...documentSlugFilters].join(', ')}.`)
    }
    const plans: Record<string, unknown>[] = []
    for (const document of documents) {
      const documentId = recordId(document, 'documentId')
      if (!documentId) {
        plans.push({ title: document.title, skipped: true, reason: 'missing-document-id' })
        continue
      }
      const versions = await listDocumentVersions(apiState, options, resolvedContext, documentId)
      const latest = selectLatestDocumentVersion(versions)
      const documentVersionId = recordId(latest, 'documentVersionId')
      if (!latest || !documentVersionId) {
        plans.push({ documentId, title: document.title, skipped: true, reason: 'missing-document-version' })
        continue
      }
      const groupPath = buildGroupPath(document, groupsById, groupsByUid)
      const documentSlug =
        normalizeNonEmpty(document.slug) ??
        pathSegmentSlug(normalizeNonEmpty(document.title), normalizeNonEmpty(documentId) ?? 'document')
      plans.push({
        documentId,
        documentVersionId,
        documentVersion: latest.version,
        title: document.title,
        slug: documentSlug,
        groupPath,
        mirrorPath: path.join(groupPath, `${pathSegmentSlug(documentSlug, 'document')}.md`),
      })
    }

    const input = compactPayload({
      groupUid,
      documentSlug: [...documentSlugFilters],
      status: normalizeNonEmpty(options.status),
      limit: toInteger(options.limit, '--limit'),
      outDir: outputRoot,
      target,
      documents: plans,
    })
    if (await guardMirrorFileWrite({
      options,
      command: 'doc.mirror.pull',
      surface: 'docman materialize -> .aops/docman',
      resolvedContext,
      input,
    })) return

    const written: Record<string, unknown>[] = []
    for (const plan of plans) {
      const documentId = normalizeNonEmpty(plan.documentId)
      const documentVersionId = normalizeNonEmpty(plan.documentVersionId)
      if (!documentId || !documentVersionId) {
        written.push(plan)
        continue
      }
      const document = documents.find((entry) => recordId(entry, 'documentId') === documentId) ?? {}
      const latest = { id: documentVersionId, version: plan.documentVersion }
      const materialized = await callDocmanVersionRoute(apiState, options, resolvedContext, {
        documentVersionId,
        suffix: 'materialize',
        method: 'POST',
        body: compactPayload({
          documentVersionId,
          target,
          locale: normalizeNonEmpty(options.locale),
          fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
        }),
      })
      const content = materializedContent(materialized)
      const outputPath = await writeDocMirrorFile({
        outputRoot,
        groupPath: normalizeNonEmpty(plan.groupPath) ?? 'ungrouped',
        document,
        documentVersion: latest,
        resolvedContext,
        target,
        content,
      })
      written.push({
        ...plan,
        outputPath,
      })
    }
    const localIndexEntries = await listDocMirrorIndexEntries(outputRoot)
    const indexEntries = localIndexEntries.length > 0
      ? localIndexEntries
      : written.filter((entry) => normalizeNonEmpty(entry.outputPath))
    const indexPath = await writeDocMirrorIndex({
      outputRoot,
      resolvedContext,
      entries: indexEntries,
    })

    await emitDocResult({
      options,
      command: 'doc.mirror.pull',
      surface: 'docman materialize -> .aops/docman',
      resolvedContext,
      input,
      result: {
        outputRoot,
        indexPath,
        writtenCount: written.filter((entry) => normalizeNonEmpty(entry.outputPath)).length,
        skippedCount: written.filter((entry) => Boolean(entry.skipped)).length,
        documents: written,
      },
      artifacts: {
        outputRoot,
        indexPath,
        writtenCount: String(written.filter((entry) => normalizeNonEmpty(entry.outputPath)).length),
      },
      successText: 'Docman mirror pull completed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocList(options: DocListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      filter: compactPayload({
        status: normalizeNonEmpty(options.status),
        slug: normalizeNonEmpty(options.slug),
        title: normalizeNonEmpty(options.title),
        groupId: normalizeNonEmpty(options.groupId),
        groupUid: normalizeNonEmpty(options.groupUid),
      }),
      options: compactPayload({
        limit: toInteger(options.limit, '--limit'),
      }),
    })

    const result = await invokeDocCrudList(
      apiState,
      options,
      resolvedContext,
      'docman.document.list',
      unwrapResultData<Record<string, unknown>>(input.filter) ?? {},
      unwrapResultData<Record<string, unknown>>(input.options),
    )
    await emitDocResult({
      options,
      command: 'doc.list',
      surface: 'docman.document.list',
      resolvedContext,
      input,
      result,
      successText: 'Documents listed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocGroupList(options: DocGroupListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      filter: compactPayload({
        title: normalizeNonEmpty(options.title),
        groupUid: normalizeNonEmpty(options.groupUid),
        parentGroupId: normalizeNonEmpty(options.parentGroupId),
        parentGroupUid: normalizeNonEmpty(options.parentGroupUid),
      }),
      options: compactPayload({
        limit: toInteger(options.limit, '--limit'),
      }),
    })

    const result = await invokeDocCrudList(
      apiState,
      options,
      resolvedContext,
      'docman.document-group.list',
      unwrapResultData<Record<string, unknown>>(input.filter) ?? {},
      unwrapResultData<Record<string, unknown>>(input.options),
    )
    await emitDocResult({
      options,
      command: 'doc.group.list',
      surface: 'docman.document-group.list',
      resolvedContext,
      input,
      result,
      successText: 'Document groups listed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocGroupGet(options: DocGroupGetOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = { id }
    const result = await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.document-group.get', id)
    await emitDocResult({
      options,
      command: 'doc.group.get',
      surface: 'docman.document-group.get',
      resolvedContext,
      input,
      result,
      successText: 'Document group loaded.',
      artifacts: collectDocGroupArtifacts(result),
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocGet(options: DocGetOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = { id }
    const result = await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.document.get', id)
    await emitDocResult({
      options,
      command: 'doc.get',
      surface: 'docman.document.get',
      resolvedContext,
      input,
      result,
      successText: 'Document loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocVersionList(options: DocVersionListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      filter: compactPayload({
        documentId: normalizeNonEmpty(options.documentId),
        status: normalizeNonEmpty(options.status),
        title: normalizeNonEmpty(options.title),
      }),
      options: compactPayload({
        limit: toInteger(options.limit, '--limit'),
      }),
    })
    const result = await invokeDocCrudList(
      apiState,
      options,
      resolvedContext,
      'docman.document-version.list',
      unwrapResultData<Record<string, unknown>>(input.filter) ?? {},
      unwrapResultData<Record<string, unknown>>(input.options),
    )
    await emitDocResult({
      options,
      command: 'doc.version.list',
      surface: 'docman.document-version.list',
      resolvedContext,
      input,
      result,
      successText: 'Document versions listed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocVersionGet(options: DocVersionReadOptions = {}): Promise<void> {
  try {
    const id = requireDocumentVersionId(options)
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = { id }
    const result = await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.document-version.get', id)
    await emitDocResult({
      options,
      command: 'doc.version.get',
      surface: 'docman.document-version.get',
      resolvedContext,
      input,
      result,
      successText: 'Document version loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSectionList(options: DocSectionListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      filter: compactPayload({
        title: normalizeNonEmpty(options.title),
        slug: normalizeNonEmpty(options.slug),
        kind: normalizeNonEmpty(options.kind),
        sectionUid: normalizeNonEmpty(options.sectionUid),
      }),
      options: compactPayload({
        limit: toInteger(options.limit, '--limit'),
      }),
    })
    const result = await invokeDocCrudList(
      apiState,
      options,
      resolvedContext,
      'docman.section.list',
      unwrapResultData<Record<string, unknown>>(input.filter) ?? {},
      unwrapResultData<Record<string, unknown>>(input.options),
    )
    await emitDocResult({
      options,
      command: 'doc.section.list',
      surface: 'docman.section.list',
      resolvedContext,
      input,
      result,
      successText: 'Sections listed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSectionGet(options: DocSectionGetOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = { id }
    const result = await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.section.get', id)
    await emitDocResult({
      options,
      command: 'doc.section.get',
      surface: 'docman.section.get',
      resolvedContext,
      input,
      result,
      successText: 'Section loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageList(options: DocPageListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      filter: compactPayload({
        title: normalizeNonEmpty(options.title),
        kind: normalizeNonEmpty(options.kind),
        pageUid: normalizeNonEmpty(options.pageUid),
      }),
      options: compactPayload({
        limit: toInteger(options.limit, '--limit'),
      }),
    })
    const result = await invokeDocCrudList(
      apiState,
      options,
      resolvedContext,
      'docman.page.list',
      unwrapResultData<Record<string, unknown>>(input.filter) ?? {},
      unwrapResultData<Record<string, unknown>>(input.options),
    )
    await emitDocResult({
      options,
      command: 'doc.page.list',
      surface: 'docman.page.list',
      resolvedContext,
      input,
      result,
      successText: 'Pages listed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageGet(options: DocPageGetOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = { id }
    const result = await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.page.get', id)
    await emitDocResult({
      options,
      command: 'doc.page.get',
      surface: 'docman.page.get',
      resolvedContext,
      input,
      result,
      successText: 'Page loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageVersionList(options: DocPageVersionListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      filter: compactPayload({
        pageId: normalizeNonEmpty(options.pageId),
        status: normalizeNonEmpty(options.status),
        title: normalizeNonEmpty(options.title),
        format: normalizeNonEmpty(options.format),
      }),
      options: compactPayload({
        limit: toInteger(options.limit, '--limit'),
      }),
    })
    const result = await invokeDocCrudList(
      apiState,
      options,
      resolvedContext,
      'docman.page-version.list',
      unwrapResultData<Record<string, unknown>>(input.filter) ?? {},
      unwrapResultData<Record<string, unknown>>(input.options),
    )
    await emitDocResult({
      options,
      command: 'doc.page-version.list',
      surface: 'docman.page-version.list',
      resolvedContext,
      input,
      result,
      successText: 'Page versions listed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageVersionGet(options: DocPageVersionGetOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = { id }
    const result = await invokeDocCrudGet(apiState, options, resolvedContext, 'docman.page-version.get', id)
    await emitDocResult({
      options,
      command: 'doc.page-version.get',
      surface: 'docman.page-version.get',
      resolvedContext,
      input,
      result,
      successText: 'Page version loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageVersionUpdate(options: DocPageVersionUpdateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const id = resolveStringField(options.id, seed, 'id')
    if (!id) throw new Error('Provide --id.')
    if (seed.content !== undefined || seed.format !== undefined || seed.title !== undefined) {
      throw new Error('doc page-version update only supports --status; use doc page draft-save for content changes.')
    }
    const status = validatePageVersionStatus(resolveStringField(options.status, seed, 'status'))
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'update')
    const input = { id, patch: compactPayload({ status, ...auditFields }) }
    await invokeDocCrudMutationTool(apiState, options, resolvedContext, {
      command: 'doc.page-version.update',
      toolId: 'docman.page-version.update',
      input,
      successText: 'Page version updated.',
      artifacts: collectDocArtifacts,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocOutlineGet(options: DocOutlineGetOptions = {}): Promise<void> {
  try {
    const documentVersionId = requireDocumentVersionId(options)
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const titlesOnly = options.titlesOnly === true
    const depth = toInteger(options.depth, '--depth')
    if (depth !== undefined && depth < 0) throw new Error('--depth must be zero or greater.')
    const input = compactPayload({ documentVersionId, titlesOnly: titlesOnly || undefined, depth })
    const result = await buildDocOutline(apiState, options, resolvedContext, documentVersionId, {
      titlesOnly,
      depth,
    })
    await emitDocResult({
      options,
      command: 'doc.outline.get',
      surface:
        'docman.document-version.get + docman.document.get + docman.document-section-link.list + docman.section.get + docman.section-page-link.list + docman.page-version.get',
      resolvedContext,
      input,
      result,
      successText: 'Document outline loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocCreate(options: DocCreateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const title = resolveStringField(options.title, seed, 'title')
    if (!title) throw new Error('Provide --title.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'create')
    const groupBinding = await resolveDocumentGroupBinding(apiState, options, resolvedContext, {
      groupId: resolveStringField(options.groupId, seed, 'groupId'),
      groupUid: resolveStringField(options.groupUid, seed, 'groupUid'),
      skipLookup: options.preview === true,
    })
    const input = compactPayload({
      action: 'save-document',
      data: compactPayload({
        documentUid: resolveStringField(options.documentUid, seed, 'documentUid') ?? buildUid('DOC', title),
        slug: resolveStringField(options.slug, seed, 'slug') ?? slugify(title),
        title,
        summary: resolveStringField(options.summary, seed, 'summary'),
        description: resolveStringField(options.description, seed, 'description'),
        status: resolveStringField(options.status, seed, 'status') ?? 'draft',
        visibility: resolveStringField(options.visibility, seed, 'visibility') ?? 'internal',
        ...groupBinding,
        tags: resolveStringArrayField(options.tag, seed, 'tag') ?? resolveStringArrayField(undefined, seed, 'tags'),
        ...auditFields,
      }),
    })
    if (await guardDocWrite({
      options,
      command: 'doc.create',
      surface: '/api/aops/docman/flows save-document',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.create',
      surface: '/api/aops/docman/flows save-document',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Document created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocGroupCreate(options: DocGroupCreateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const title = resolveStringField(options.title, seed, 'title')
    if (!title) throw new Error('Provide --title.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'create')
    const input = {
      data: compactPayload({
        title,
        groupUid: resolveStringField(options.groupUid, seed, 'groupUid') ?? buildUid('DOC', title).replace(/^DOC-/, 'GRP-'),
        parentGroupId: resolveStringField(options.parentGroupId, seed, 'parentGroupId'),
        parentGroupUid: resolveStringField(options.parentGroupUid, seed, 'parentGroupUid'),
        ...auditFields,
      }),
    }

    await invokeDocCrudMutationTool(apiState, options, resolvedContext, {
      command: 'doc.group.create',
      toolId: 'docman.document-group.create',
      input,
      successText: 'Document group created.',
      artifacts: collectDocGroupArtifacts,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocGroupUpdate(options: DocGroupUpdateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const id = resolveStringField(options.id, seed, 'id')
    if (!id) throw new Error('Provide --id.')
    const patch = compactPayload({
      title: resolveStringField(options.title, seed, 'title'),
      groupUid: resolveStringField(options.groupUid, seed, 'groupUid'),
      parentGroupId: resolveStringField(options.parentGroupId, seed, 'parentGroupId'),
      parentGroupUid: resolveStringField(options.parentGroupUid, seed, 'parentGroupUid'),
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one patch field.')
    }
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'update')
    const input = { id, patch: compactPayload({ ...patch, ...auditFields }) }

    await invokeDocCrudMutationTool(apiState, options, resolvedContext, {
      command: 'doc.group.update',
      toolId: 'docman.document-group.update',
      input,
      successText: 'Document group updated.',
      artifacts: collectDocGroupArtifacts,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocGroupDelete(options: DocGroupDeleteOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = { id }

    await invokeDocCrudMutationTool(apiState, options, resolvedContext, {
      command: 'doc.group.delete',
      toolId: 'docman.document-group.delete',
      input,
      successText: 'Document group deleted.',
      destructive: true,
      artifacts: collectDocGroupArtifacts,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocUpdate(options: DocUpdateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const id = resolveStringField(options.id, seed, 'id')
    if (!id) throw new Error('Provide --id.')
    const patch = compactPayload({
      title: resolveStringField(options.title, seed, 'title'),
      slug: resolveStringField(options.slug, seed, 'slug'),
      summary: resolveStringField(options.summary, seed, 'summary'),
      description: resolveStringField(options.description, seed, 'description'),
      status: resolveStringField(options.status, seed, 'status'),
      visibility: resolveStringField(options.visibility, seed, 'visibility'),
      groupId: resolveStringField(options.groupId, seed, 'groupId'),
      groupUid: resolveStringField(options.groupUid, seed, 'groupUid'),
      tags: resolveStringArrayField(options.tag, seed, 'tag') ?? resolveStringArrayField(undefined, seed, 'tags'),
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one patch field.')
    }
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'update')
    const groupBinding = await resolveDocumentGroupBinding(apiState, options, resolvedContext, {
      groupId: resolveStringField(options.groupId, seed, 'groupId'),
      groupUid: resolveStringField(options.groupUid, seed, 'groupUid'),
      skipLookup: options.preview === true,
    })
    const input = {
      action: 'save-document',
      documentId: id,
      data: compactPayload({ ...patch, ...groupBinding, ...auditFields }),
    }
    if (await guardDocWrite({
      options,
      command: 'doc.update',
      surface: '/api/aops/docman/flows save-document',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.update',
      surface: '/api/aops/docman/flows save-document',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Document updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocVersionCreate(options: DocVersionCreateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const documentId = resolveStringField(options.documentId, seed, 'documentId')
    const version = resolveIntegerField(options.version, seed, 'version', '--version')
    if (!documentId) throw new Error('Provide --document-id.')
    if (version === undefined) throw new Error('Provide --version.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'create')
    const input = compactPayload({
      action: 'create-document-version',
      documentId,
      documentInitMode: resolveStringField(options.initMode, seed, 'initMode'),
      sourceVersionId: resolveStringField(options.sourceVersionId, seed, 'sourceVersionId'),
      sourceSectionLinkIds:
        resolveStringArrayField(options.sourceSectionLinkId, seed, 'sourceSectionLinkId') ??
        resolveStringArrayField(undefined, seed, 'sourceSectionLinkIds'),
      data: compactPayload({
        documentId,
        version,
        label: resolveStringField(options.label, seed, 'label'),
        title: resolveStringField(options.title, seed, 'title'),
        summary: resolveStringField(options.summary, seed, 'summary'),
        releaseNotes: resolveStringField(options.releaseNotes, seed, 'releaseNotes'),
        status: resolveStringField(options.status, seed, 'status') ?? 'draft',
        ...auditFields,
      }),
    })
    if (await guardDocWrite({
      options,
      command: 'doc.version.create',
      surface: '/api/aops/docman/flows create-document-version',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.version.create',
      surface: '/api/aops/docman/flows create-document-version',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Document version created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocVersionUpdate(options: DocVersionUpdateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const id = resolveStringField(options.id, seed, 'id')
    if (!id) throw new Error('Provide --id.')
    const status = resolveStringField(options.status, seed, 'status')
    const title = resolveStringField(options.title, seed, 'title')
    const summary = resolveStringField(options.summary, seed, 'summary')
    const releaseNotes = resolveStringField(options.releaseNotes, seed, 'releaseNotes')
    const label = resolveStringField(options.label, seed, 'label')
    const patch = compactPayload({
      status,
      title,
      summary,
      releaseNotes,
      label,
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one of --status / --title / --summary / --release-notes / --label.')
    }
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({ id, patch })
    if (await guardDocWrite({
      options,
      command: 'doc.version.update',
      surface: 'docman.document-version.update',
      resolvedContext,
      input,
    })) return
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      toolId: 'docman.document-version.update',
      input,
      apply: options.apply,
      preview: options.preview,
      confirm: options.confirm,
      idempotencyKey: options.idempotencyKey,
    })
    const result = unwrapHostedToolResult(payload)
    await emitDocResult({
      options,
      command: 'doc.version.update',
      surface: 'docman.document-version.update',
      resolvedContext,
      input,
      result,
      successText: 'Document version metadata updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSetCurrentVersion(options: DocSetCurrentVersionOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const documentVersionId = resolveStringField(options.versionId, seed, 'versionId')
      ?? resolveStringField(undefined, seed, 'documentVersionId')
    if (!documentVersionId) throw new Error('Provide --version-id.')
    const documentId = resolveStringField(options.documentId, seed, 'documentId')
    const expectedPreviousVersionId = resolveStringField(options.expectedPreviousVersionId, seed, 'expectedPreviousVersionId')
    // publish defaults to true for set-current semantics; --no-publish flips it off.
    const publishRaw = options.publish ?? seed.publish
    const publish = publishRaw === undefined ? true : Boolean(publishRaw) && publishRaw !== 'false'
    const publishedAtRaw = options.publishedAt ?? (typeof seed.publishedAt === 'string' ? seed.publishedAt : undefined)
    const publishedAt = publishedAtRaw
      ?? (options.publishNow !== false && publish ? new Date().toISOString() : undefined)
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      documentVersionId,
      documentId,
      publish,
      publishedAt,
      expectedPreviousVersionId,
    })
    if (await guardDocWrite({
      options,
      command: 'doc.set-current-version',
      surface: 'docman.document-version.set-current',
      resolvedContext,
      input,
    })) return
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      toolId: 'docman.document-version.set-current',
      input,
      apply: options.apply,
      preview: options.preview,
      confirm: options.confirm,
      idempotencyKey: options.idempotencyKey,
    })
    const result = unwrapHostedToolResult(payload)
    await emitDocResult({
      options,
      command: 'doc.set-current-version',
      surface: 'docman.document-version.set-current',
      resolvedContext,
      input,
      result,
      successText: 'Document version marked current.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSectionCreate(options: DocSectionCreateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const title = resolveStringField(options.title, seed, 'title')
    if (!title) throw new Error('Provide --title.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const documentVersionId = resolveStringField(options.documentVersionId, seed, 'documentVersionId')
    const parentLinkId = resolveStringField(options.parentLinkId, seed, 'parentLinkId')
    const position = resolveIntegerField(options.position, seed, 'position', '--position')
    const titleOverride = resolveStringField(options.titleOverride, seed, 'titleOverride')
    const numbering = resolveStringField(options.numbering, seed, 'numbering')
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'create')

    const saveInput = {
      action: 'save-section',
      data: compactPayload({
        sectionUid: resolveStringField(options.sectionUid, seed, 'sectionUid') ?? buildUid('SEC', title),
        title,
        slug: resolveStringField(options.slug, seed, 'slug') ?? slugify(title),
        kind: 'container',
        ...auditFields,
      }),
    }
    const previewInput = compactPayload({
      save: saveInput,
      link: documentVersionId
        ? compactPayload({
            action: 'link-existing-section',
            documentVersionId,
            parentLinkId,
            position,
            titleOverride,
            numbering,
          })
        : undefined,
    })
    if (await guardDocWrite({
      options,
      command: 'doc.section.create',
      surface: '/api/aops/docman/flows save-section/link-existing-section',
      resolvedContext,
      input: previewInput,
    })) return
    const saved = await callDocmanFlow(apiState, options, resolvedContext, saveInput) as Record<string, unknown>
    const savedData = unwrapResultData<Record<string, unknown>>(saved)
    const sectionId =
      normalizeNonEmpty((savedData as Record<string, unknown>)?.sectionId) ??
      normalizeNonEmpty((savedData as Record<string, unknown>)?.focusSectionId) ??
      normalizeNonEmpty(((savedData as Record<string, unknown>)?.section as Record<string, unknown>)?.id)
    if (!sectionId) {
      throw new Error('Section was created but sectionId could not be resolved.')
    }

    let result: unknown = saved
    let linkResult: unknown = undefined
    if (documentVersionId) {
      const linkInput = compactPayload({
        action: 'link-existing-section',
        documentVersionId,
        sectionId,
        parentLinkId,
        position,
        titleOverride,
        numbering,
      })
      linkResult = await callDocmanFlow(apiState, options, resolvedContext, linkInput)
      result = { save: saved, link: linkResult }
    }

    await emitDocResult({
      options,
      command: 'doc.section.create',
      surface: '/api/aops/docman/flows save-section/link-existing-section',
      resolvedContext,
      input: compactPayload({
        save: saveInput,
        link: documentVersionId
          ? compactPayload({
              action: 'link-existing-section',
              documentVersionId,
              sectionId,
              parentLinkId,
              position,
              titleOverride,
              numbering,
            })
          : undefined,
      }),
      result,
      artifacts: collectDocArtifacts(result),
      successText: documentVersionId ? 'Section created and linked.' : 'Section created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSectionUpdate(options: DocSectionUpdateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const id = resolveStringField(options.id, seed, 'id')
    if (!id) throw new Error('Provide --id.')
    const patch = compactPayload({
      title: resolveStringField(options.title, seed, 'title'),
      slug: resolveStringField(options.slug, seed, 'slug'),
    })
    if (Object.keys(patch).length === 0) throw new Error('Provide at least one patch field.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'update')
    const input = {
      action: 'save-section',
      sectionId: id,
      data: compactPayload({ ...patch, ...auditFields }),
    }
    if (await guardDocWrite({
      options,
      command: 'doc.section.update',
      surface: '/api/aops/docman/flows save-section',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.section.update',
      surface: '/api/aops/docman/flows save-section',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Section updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSectionCopy(options: DocSectionCopyOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const sourceSectionId = resolveStringField(options.sourceSectionId, seed, 'sourceSectionId')
    const targetDocumentVersionId = resolveStringField(options.targetDocumentVersionId, seed, 'targetDocumentVersionId')
    if (!sourceSectionId) throw new Error('Provide --source-section-id.')
    if (!targetDocumentVersionId) throw new Error('Provide --target-document-version-id.')
    if (options.reusePages && options.clonePages) throw new Error('Use either --reuse-pages or --clone-pages, not both.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      action: 'copy-section',
      sourceSectionId,
      targetDocumentVersionId,
      parentLinkId: resolveStringField(options.parentLinkId, seed, 'parentLinkId'),
      position: resolveIntegerField(options.position, seed, 'position', '--position'),
      rename: resolveStringField(options.rename, seed, 'rename'),
      clonePages: Boolean(options.clonePages || seed.clonePages === true),
    })
    if (await guardDocWrite({
      options,
      command: 'doc.section.copy',
      surface: '/api/aops/docman/flows copy-section',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.section.copy',
      surface: '/api/aops/docman/flows copy-section',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Section copied.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSectionUnlink(options: DocSectionUnlinkOptions = {}): Promise<void> {
  try {
    const linkId = normalizeNonEmpty(options.linkId)
    if (!linkId) throw new Error('Provide --link-id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    await invokeDocCrudMutationTool(apiState, options, resolvedContext, {
      command: 'doc.section.unlink',
      toolId: 'docman.document-section-link.delete',
      input: { id: linkId },
      successText: 'Section unlinked.',
      artifacts: collectDocArtifacts,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageCreate(options: DocPageCreateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const title = resolveStringField(options.title, seed, 'title')
    if (!title) throw new Error('Provide --title.')
    const format = (resolveStringField(options.format, seed, 'format') ?? 'md') as 'md' | 'mdx'
    if (format !== 'md' && format !== 'mdx') throw new Error('Format must be md or mdx.')
    const content = resolveTextField(options.content, seed, 'content') ?? ''
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const createAuditFields = await resolveDocAuditFields(apiState, options, seed, 'create')
    const updateAuditFields = await resolveDocAuditFields(apiState, options, seed, 'update')

    const documentVersionId = resolveStringField(options.documentVersionId, seed, 'documentVersionId')
    const sectionId = resolveStringField(options.sectionId, seed, 'sectionId')
    const parentLinkId = resolveStringField(options.parentLinkId, seed, 'parentLinkId')
    const previewInput = compactPayload({
      create:
        documentVersionId
          ? compactPayload({
              action: 'create-linked-page',
              documentVersionId,
              sectionId,
              parentLinkId,
              format,
            })
          : {
              action: 'create-page-with-initial-version',
              data: compactPayload({
                pageUid: resolveStringField(options.pageUid, seed, 'pageUid') ?? buildUid('PAG', title),
                title,
                kind: 'content',
                format,
                ...createAuditFields,
              }),
            },
      updatePage: title ? { action: 'update-page', data: { title, ...updateAuditFields } } : undefined,
      draftSave:
        content || title || format
          ? {
              action: 'save-page-version-draft',
              data: compactPayload({ title, format, content, status: 'draft', ...updateAuditFields }),
            }
          : undefined,
    })
    if (await guardDocWrite({
      options,
      command: 'doc.page.create',
      surface: '/api/aops/docman/flows create-linked-page/create-page-with-initial-version',
      resolvedContext,
      input: previewInput,
    })) return

    let createInput: Record<string, unknown>
    let createResult: Record<string, unknown>
    let pageId = ''
    let pageVersionId = ''

    if (documentVersionId) {
      createInput = compactPayload({
        action: 'create-linked-page',
        documentVersionId,
        sectionId,
        parentLinkId,
        format,
      })
      createResult = (await callDocmanFlow(apiState, options, resolvedContext, createInput)) as Record<string, unknown>
      const createData = unwrapResultData<Record<string, unknown>>(createResult)
      pageId = normalizeNonEmpty((createData?.page as Record<string, unknown>)?.id) ?? ''
      pageVersionId = normalizeNonEmpty((createData?.pageVersion as Record<string, unknown>)?.id) ?? ''
    } else {
      createInput = {
        action: 'create-page-with-initial-version',
        data: compactPayload({
          pageUid: resolveStringField(options.pageUid, seed, 'pageUid') ?? buildUid('PAG', title),
          title,
          kind: 'content',
          format,
          ...createAuditFields,
        }),
      }
      createResult = (await callDocmanFlow(apiState, options, resolvedContext, createInput)) as Record<string, unknown>
      const createData = unwrapResultData<Record<string, unknown>>(createResult)
      pageId = normalizeNonEmpty(createData?.pageId) ?? normalizeNonEmpty((createData?.page as Record<string, unknown>)?.id) ?? ''
      pageVersionId =
        normalizeNonEmpty(createData?.pageVersionId) ??
        normalizeNonEmpty((createData?.pageVersion as Record<string, unknown>)?.id) ??
        ''
    }

    if (!pageId) throw new Error('Page was created but pageId could not be resolved.')
    if (!pageVersionId) throw new Error('Page was created but pageVersionId could not be resolved.')

    let pageUpdateResult: unknown
    let draftSaveResult: unknown

    if (title) {
      pageUpdateResult = await callDocmanFlow(apiState, options, resolvedContext, {
        action: 'update-page',
        pageId,
        data: { title, ...updateAuditFields },
      })
    }

    if (content || title || format) {
      draftSaveResult = await callDocmanFlow(apiState, options, resolvedContext, {
        action: 'save-page-version-draft',
        pageVersionId,
        data: compactPayload({
          title,
          format,
          content,
          status: 'draft',
          ...updateAuditFields,
        }),
      })
    }

    await emitDocResult({
      options,
      command: 'doc.page.create',
      surface: '/api/aops/docman/flows create-linked-page/create-page-with-initial-version',
      resolvedContext,
      input: compactPayload({
        create: createInput,
        updatePage: title ? { action: 'update-page', pageId, data: { title, ...updateAuditFields } } : undefined,
        draftSave:
          content || title || format
            ? {
                action: 'save-page-version-draft',
                pageVersionId,
                data: compactPayload({ title, format, content, status: 'draft', ...updateAuditFields }),
              }
            : undefined,
      }),
      result: compactPayload({
        create: createResult,
        pageUpdate: pageUpdateResult,
        draftSave: draftSaveResult,
      }),
      artifacts: collectDocArtifacts(
        compactPayload({
          create: createResult,
          pageUpdate: pageUpdateResult,
          draftSave: draftSaveResult,
        }),
      ),
      successText: 'Page created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageUpdate(options: DocPageUpdateOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const id = resolveStringField(options.id, seed, 'id')
    if (!id) throw new Error('Provide --id.')
    if (seed.content !== undefined || seed.format !== undefined) {
      throw new Error('Use doc page draft-save for content or format changes.')
    }
    const patch = compactPayload({
      title: resolveStringField(options.title, seed, 'title'),
    })
    if (Object.keys(patch).length === 0) throw new Error('Provide at least one patch field.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'update')
    const input = {
      action: 'update-page',
      pageId: id,
      data: compactPayload({ ...patch, ...auditFields }),
    }
    if (await guardDocWrite({
      options,
      command: 'doc.page.update',
      surface: '/api/aops/docman/flows update-page',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.page.update',
      surface: '/api/aops/docman/flows update-page',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Page updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageCopy(options: DocPageCopyOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const sourcePageId = resolveStringField(options.sourcePageId, seed, 'sourcePageId')
    const sourcePageVersionId = resolveStringField(options.sourcePageVersionId, seed, 'sourcePageVersionId')
    const targetSectionId = resolveStringField(options.targetSectionId, seed, 'targetSectionId')
    if (!sourcePageId) throw new Error('Provide --source-page-id.')
    if (!targetSectionId) throw new Error('Provide --target-section-id.')
    if (options.reusePage && options.clonePage) throw new Error('Use either --reuse-page or --clone-page, not both.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      action: 'copy-page',
      sourcePageId,
      sourcePageVersionId,
      targetSectionId,
      position: resolveIntegerField(options.position, seed, 'position', '--position'),
      rename: resolveStringField(options.rename, seed, 'rename'),
      clonePage: Boolean(options.clonePage || seed.clonePage === true),
    })
    if (await guardDocWrite({
      options,
      command: 'doc.page.copy',
      surface: '/api/aops/docman/flows copy-page',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.page.copy',
      surface: '/api/aops/docman/flows copy-page',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Page copied.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageMove(options: DocPageMoveOptions = {}): Promise<void> {
  try {
    const linkId = normalizeNonEmpty(options.linkId)
    const targetSectionId = normalizeNonEmpty(options.targetSectionId)
    if (!linkId) throw new Error('Provide --link-id.')
    if (!targetSectionId) throw new Error('Provide --target-section-id.')
    const patch = compactPayload({
      sectionId: targetSectionId,
      position: toInteger(options.position, '--position'),
    })
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    await invokeDocCrudMutationTool(apiState, options, resolvedContext, {
      command: 'doc.page.move',
      toolId: 'docman.section-page-link.update',
      input: { id: linkId, patch },
      successText: 'Page moved.',
      artifacts: collectDocArtifacts,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageUnlink(options: DocPageUnlinkOptions = {}): Promise<void> {
  try {
    const linkId = normalizeNonEmpty(options.linkId)
    if (!linkId) throw new Error('Provide --link-id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    await invokeDocCrudMutationTool(apiState, options, resolvedContext, {
      command: 'doc.page.unlink',
      toolId: 'docman.section-page-link.delete',
      input: { id: linkId },
      successText: 'Page unlinked.',
      artifacts: collectDocArtifacts,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPageDraftSave(options: DocPageDraftSaveOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const pageVersionId = resolveStringField(options.pageVersionId, seed, 'pageVersionId')
    const pageId = resolveStringField(options.pageId, seed, 'pageId')
    const documentLinkId = resolveStringField(options.documentLinkId, seed, 'documentLinkId')
    if (!pageVersionId && !pageId) {
      throw new Error('Provide --page-version-id or --page-id.')
    }
    const format = resolveStringField(options.format, seed, 'format')
    if (format && format !== 'md' && format !== 'mdx') {
      throw new Error('Format must be md or mdx.')
    }
    const content = resolveTextField(options.content, seed, 'content')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const auditFields = await resolveDocAuditFields(apiState, options, seed, 'update')
    const input = compactPayload({
      action: 'save-page-version-draft',
      pageVersionId,
      documentLinkId,
      data: compactPayload({
        pageId,
        title: resolveStringField(options.title, seed, 'title'),
        format,
        content,
        status: resolveStringField(options.status, seed, 'status') ?? 'draft',
        ...auditFields,
      }),
    })
    if (await guardDocWrite({
      options,
      command: 'doc.page.draft-save',
      surface: '/api/aops/docman/flows save-page-version-draft',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.page.draft-save',
      surface: '/api/aops/docman/flows save-page-version-draft',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Page draft saved.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocLinkSection(options: DocLinkSectionOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const documentVersionId = resolveStringField(options.documentVersionId, seed, 'documentVersionId')
    const sectionId = resolveStringField(options.sectionId, seed, 'sectionId')
    if (!documentVersionId) throw new Error('Provide --document-version-id.')
    if (!sectionId) throw new Error('Provide --section-id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      action: 'link-existing-section',
      documentVersionId,
      sectionId,
      parentLinkId: resolveStringField(options.parentLinkId, seed, 'parentLinkId'),
      position: resolveIntegerField(options.position, seed, 'position', '--position'),
      titleOverride: resolveStringField(options.titleOverride, seed, 'titleOverride'),
      numbering: resolveStringField(options.numbering, seed, 'numbering'),
    })
    if (await guardDocWrite({
      options,
      command: 'doc.link.section',
      surface: '/api/aops/docman/flows link-existing-section',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.link.section',
      surface: '/api/aops/docman/flows link-existing-section',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Section linked.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocLinkPage(options: DocLinkPageOptions = {}): Promise<void> {
  try {
    const seed = readJsonObjectInput(options.input)
    const sectionId = resolveStringField(options.sectionId, seed, 'sectionId')
    const pageVersionId = resolveStringField(options.pageVersionId, seed, 'pageVersionId')
    const pageId = resolveStringField(options.pageId, seed, 'pageId')
    if (!sectionId) throw new Error('Provide --section-id.')
    if (!pageVersionId && !pageId) throw new Error('Provide --page-version-id or --page-id.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = compactPayload({
      action: 'link-existing-page-version',
      sectionId,
      pageVersionId,
      pageId,
      position: resolveIntegerField(options.position, seed, 'position', '--position'),
      titleOverride: resolveStringField(options.titleOverride, seed, 'titleOverride'),
      numbering: resolveStringField(options.numbering, seed, 'numbering'),
    })
    if (await guardDocWrite({
      options,
      command: 'doc.link.page',
      surface: '/api/aops/docman/flows link-existing-page-version',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.link.page',
      surface: '/api/aops/docman/flows link-existing-page-version',
      resolvedContext,
      input,
      result,
      artifacts: collectDocArtifacts(result),
      successText: 'Page linked.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocOrderSections(options: DocOrderSectionsOptions = {}): Promise<void> {
  try {
    const documentVersionId = normalizeNonEmpty(options.documentVersionId)
    if (!documentVersionId) throw new Error('Provide --document-version-id.')
    const updates = parseUpdateList(options.update, options.input)
    if (updates.length === 0) throw new Error('Provide at least one --update or --input JSON array.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = {
      action: 'update-document-section-links',
      documentVersionId,
      updates,
    }
    if (await guardDocWrite({
      options,
      command: 'doc.order.sections',
      surface: '/api/aops/docman/flows update-document-section-links',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.order.sections',
      surface: '/api/aops/docman/flows update-document-section-links',
      resolvedContext,
      input,
      result,
      successText: 'Document section order updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocOrderPages(options: DocOrderPagesOptions = {}): Promise<void> {
  try {
    const sectionId = normalizeNonEmpty(options.sectionId)
    if (!sectionId) throw new Error('Provide --section-id.')
    const updates = parseUpdateList(options.update, options.input)
    if (updates.length === 0) throw new Error('Provide at least one --update or --input JSON array.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const input = {
      action: 'update-section-page-links',
      sectionId,
      updates,
    }
    if (await guardDocWrite({
      options,
      command: 'doc.order.pages',
      surface: '/api/aops/docman/flows update-section-page-links',
      resolvedContext,
      input,
    })) return
    const result = await callDocmanFlow(apiState, options, resolvedContext, input)
    await emitDocResult({
      options,
      command: 'doc.order.pages',
      surface: '/api/aops/docman/flows update-section-page-links',
      resolvedContext,
      input,
      result,
      successText: 'Section page order updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocIndexBuild(options: DocVersionReadOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const documentVersionId = requireDocumentVersionId(options)
    const input = compactPayload({
      documentVersionId,
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    })
    const result = await callDocmanVersionRoute(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'index',
      method: 'POST',
      body: input,
    })
    await emitDocResult({
      options,
      command: 'doc.index.build',
      surface: `/api/docman/document-versions/:id/index`,
      resolvedContext,
      input,
      result,
      successText: 'Document index built.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSummaryBuild(options: DocVersionReadOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const documentVersionId = requireDocumentVersionId(options)
    const input = compactPayload({
      documentVersionId,
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    })
    const result = await callDocmanVersionRoute(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'summaries',
      method: 'POST',
      body: input,
    })
    await emitDocResult({
      options,
      command: 'doc.summary.build',
      surface: `/api/docman/document-versions/:id/summaries`,
      resolvedContext,
      input,
      result,
      successText: 'Document summaries built.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSearch(options: DocSearchOptions = {}): Promise<void> {
  try {
    assertDocReadMode(options)
    const documentVersionId = requireDocumentVersionId(options)
    const q = normalizeNonEmpty(options.q)
    if (!q) throw new Error('Provide --q.')

    let localPayload: LocalDocResultPayload | undefined
    if (options.remote !== true) {
      try {
        localPayload = await buildLocalDocSearchPayload(options, documentVersionId, q)
        if (options.local === true || localMirrorHits(localPayload.result).length > 0) {
          await emitDocResult({
            options,
            command: 'doc.search',
            surface: 'repo-local-docman-mirror',
            resolvedContext: localPayload.resolvedContext,
            input: localPayload.input,
            result: localPayload.result,
            successText: 'Local Docman mirror search completed.',
          })
          return
        }
      } catch (error) {
        if (options.local === true) throw error
      }
    }

    const ensure = normalizePreReadEnsureMode(options.ensure)
    const apiState = await requireApiState(options)
    if (!apiState) {
      if (options.remote === true) return
      process.exitCode = undefined
      if (localPayload) {
        await emitDocResult({
          options,
          command: 'doc.search',
          surface: 'repo-local-docman-mirror',
          resolvedContext: localPayload.resolvedContext,
          input: localPayload.input,
          result: localPayload.result,
          successText: 'Local Docman mirror search completed.',
        })
      } else {
        await runLocalDocSearch(options, documentVersionId, q)
      }
      return
    }
    const resolvedContext = await resolveDocContext(options, apiState)
    await maybeEnsureRetrievalState(apiState, options, resolvedContext, {
      ensure,
      documentVersionId,
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    })
    const input = compactPayload({
      documentVersionId,
      q,
      limit: toInteger(options.limit, '--limit'),
      retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
      ensure,
    })
    const result = await callDocmanVersionRoute(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'search',
      method: 'GET',
      query: compactPayload({
        q,
        limit: toInteger(options.limit, '--limit'),
        retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
        locale: normalizeNonEmpty(options.locale),
        fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
      }),
    })
    await emitDocResult({
      options,
      command: 'doc.search',
      surface: `/api/docman/document-versions/:id/search`,
      resolvedContext,
      input,
      result,
      successText: 'Document search completed.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocScopeSearch(options: DocScopeSearchOptions = {}): Promise<void> {
  try {
    assertDocReadMode(options)
    const q = normalizeNonEmpty(options.q)
    if (!q) throw new Error('Provide --q.')

    let localPayload: LocalDocResultPayload | undefined
    if (options.remote !== true) {
      try {
        localPayload = await buildLocalDocScopeSearchPayload(options, q)
        if (options.local === true || localMirrorDocumentCount(localPayload.result) > 0) {
          if (options.json) {
            await emitDocResult({
              options,
              command: 'doc.scope.search',
              surface: 'repo-local-docman-mirror',
              resolvedContext: localPayload.resolvedContext,
              input: localPayload.input,
              result: localPayload.result,
              successText: 'Local Docman mirror search completed.',
            })
          } else {
            renderDocScopeSearchResult(localPayload.result)
          }
          return
        }
      } catch (error) {
        if (options.local === true) throw error
      }
    }
    const apiState = await requireApiState(options)
    if (!apiState) {
      if (options.remote === true) return
      process.exitCode = undefined
      if (localPayload) {
        if (options.json) {
          await emitDocResult({
            options,
            command: 'doc.scope.search',
            surface: 'repo-local-docman-mirror',
            resolvedContext: localPayload.resolvedContext,
            input: localPayload.input,
            result: localPayload.result,
            successText: 'Local Docman mirror search completed.',
          })
        } else {
          renderDocScopeSearchResult(localPayload.result)
        }
      } else {
        await runLocalDocScopeSearch(options, q)
      }
      return
    }
    const resolvedContext = await resolveDocContext(options, apiState, { forceHostedScope: true })
    const scopeId = normalizeNonEmpty(options.scopeId) ?? normalizeNonEmpty(resolvedContext.scopeId)
    if (!scopeId) throw new Error('Provide --scope-id or repo-bound project context.')

    const input = compactPayload({
      scopeId,
      q,
      limit: toInteger(options.limit, '--limit'),
      retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    })
    const result = await callDocmanScopeRoute(apiState, options, resolvedContext, {
      scopeId,
      suffix: 'documents/search',
      method: 'GET',
      query: compactPayload({
        q,
        limit: toInteger(options.limit, '--limit'),
        retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
        locale: normalizeNonEmpty(options.locale),
        fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
      }),
    })

    if (options.json) {
      await emitDocResult({
        options,
        command: 'doc.scope.search',
        surface: `/api/docman/scopes/:id/documents/search`,
        resolvedContext,
        input,
        result,
        successText: 'Scope-wide document search completed.',
      })
      return
    }

    renderDocScopeSearchResult(result)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocScopeAnswer(options: DocScopeAnswerOptions = {}): Promise<void> {
  try {
    assertDocReadMode(options)
    const q = normalizeNonEmpty(options.q)
    if (!q) throw new Error('Provide --q.')

    let localPayload: LocalDocResultPayload | undefined
    if (options.remote !== true) {
      try {
        localPayload = await buildLocalDocScopeAnswerPayload(options, q)
        if (options.local === true || localMirrorDocumentCount(localPayload.result) > 0) {
          await emitDocResult({
            options,
            command: 'doc.scope.answer',
            surface: 'repo-local-docman-mirror',
            resolvedContext: localPayload.resolvedContext,
            input: localPayload.input,
            result: localPayload.result,
            successText: 'Local Docman mirror scope answer pack loaded.',
          })
          return
        }
      } catch (error) {
        if (options.local === true) throw error
      }
    }

    const apiState = await requireApiState(options)
    if (!apiState) {
      if (options.remote === true) return
      process.exitCode = undefined
      if (localPayload) {
        await emitDocResult({
          options,
          command: 'doc.scope.answer',
          surface: 'repo-local-docman-mirror',
          resolvedContext: localPayload.resolvedContext,
          input: localPayload.input,
          result: localPayload.result,
          successText: 'Local Docman mirror scope answer pack loaded.',
        })
      } else {
        await runLocalDocScopeAnswer(options, q)
      }
      return
    }

    const resolvedContext = await resolveDocContext(options, apiState, { forceHostedScope: true })
    const scopeId = normalizeNonEmpty(options.scopeId) ?? normalizeNonEmpty(resolvedContext.scopeId)
    if (!scopeId) throw new Error('Provide --scope-id or repo-bound project context.')

    const input = compactPayload({
      scopeId,
      q,
      limit: toInteger(options.limit, '--limit'),
      retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    })
    const searchResult = await callDocmanScopeRoute(apiState, options, resolvedContext, {
      scopeId,
      suffix: 'documents/search',
      method: 'GET',
      query: compactPayload({
        q,
        limit: toInteger(options.limit, '--limit'),
        retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
        locale: normalizeNonEmpty(options.locale),
        fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
      }),
    })
    const result = buildScopeAnswerResult({
      searchResult,
      scopeId,
      q,
      answerSource: 'scope-search',
      strategy: 'scope-search-answer-pack-v1',
      retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy) ?? 'hybrid',
      source: '/api/docman/scopes/:id/documents/search',
    })

    await emitDocResult({
      options,
      command: 'doc.scope.answer',
      surface: `/api/docman/scopes/:id/documents/search answer-pack`,
      resolvedContext,
      input,
      result,
      successText: 'Scope-wide document answer pack loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocAnswer(options: DocAnswerOptions = {}): Promise<void> {
  try {
    assertDocReadMode(options)
    const documentVersionId = requireDocumentVersionId(options)
    const q = normalizeNonEmpty(options.q)
    if (!q) throw new Error('Provide --q.')

    let localPayload: LocalDocResultPayload | undefined
    if (options.remote !== true) {
      try {
        localPayload = await buildLocalDocAnswerPayload(options, documentVersionId, q)
        if (options.local === true || localMirrorCitationCount(localPayload.result) > 0) {
          await emitDocResult({
            options,
            command: 'doc.answer',
            surface: 'repo-local-docman-mirror',
            resolvedContext: localPayload.resolvedContext,
            input: localPayload.input,
            result: localPayload.result,
            successText: 'Local Docman mirror answer pack loaded.',
          })
          return
        }
      } catch (error) {
        if (options.local === true) throw error
      }
    }

    const ensure = normalizePreReadEnsureMode(options.ensure)
    const apiState = await requireApiState(options)
    if (!apiState) {
      if (options.remote === true) return
      process.exitCode = undefined
      if (localPayload) {
        await emitDocResult({
          options,
          command: 'doc.answer',
          surface: 'repo-local-docman-mirror',
          resolvedContext: localPayload.resolvedContext,
          input: localPayload.input,
          result: localPayload.result,
          successText: 'Local Docman mirror answer pack loaded.',
        })
      } else {
        await runLocalDocAnswer(options, documentVersionId, q)
      }
      return
    }
    const resolvedContext = await resolveDocContext(options, apiState, { forceHostedScope: true })
    await maybeEnsureRetrievalState(apiState, options, resolvedContext, {
      ensure,
      documentVersionId,
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    })
    const input = compactPayload({
      documentVersionId,
      q,
      limit: toInteger(options.limit, '--limit'),
      retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
      ensure,
    })
    const result = await callDocmanVersionRoute(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'answer-pack',
      method: 'GET',
      query: compactPayload({
        q,
        limit: toInteger(options.limit, '--limit'),
        retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
        locale: normalizeNonEmpty(options.locale),
        fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
      }),
    })
    await emitDocResult({
      options,
      command: 'doc.answer',
      surface: `/api/docman/document-versions/:id/answer-pack`,
      resolvedContext,
      input,
      result,
      successText: 'Document answer pack loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocSource(options: DocSourceOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const documentVersionId = requireDocumentVersionId(options)
    const input = compactPayload({
      documentVersionId,
      sectionId: normalizeNonEmpty(options.sectionId),
      pageVersionId: normalizeNonEmpty(options.pageVersionId),
      pageNumber: toInteger(options.pageNumber, '--page-number'),
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    })
    const result = await callDocmanVersionRoute(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'compose-fetch',
      method: 'POST',
      body: input,
    })
    await emitDocResult({
      options,
      command: 'doc.source',
      surface: `/api/docman/document-versions/:id/compose-fetch`,
      resolvedContext,
      input,
      result,
      successText: 'Composed document source loaded.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runDocPublish(options: DocPublishOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveDocContext(options, apiState)
    const documentVersionId = requireDocumentVersionId(options)
    const target = normalizeNonEmpty(options.target) ?? 'markdown'
    if (target !== 'markdown' && target !== 'html') {
      throw new Error('Target must be markdown or html.')
    }
    const input = compactPayload({
      documentVersionId,
      target,
      sectionId: normalizeNonEmpty(options.sectionId),
      pageVersionId: normalizeNonEmpty(options.pageVersionId),
      pageNumber: toInteger(options.pageNumber, '--page-number'),
      locale: normalizeNonEmpty(options.locale),
      fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    })
    const result = await callDocmanVersionRoute(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'materialize',
      method: 'POST',
      body: input,
    })
    const outputPath = await writeMaterializedDocOutput(options.out, result)
    const artifacts = compactPayload({
      documentVersionId,
      outputPath,
    }) as Record<string, string> | undefined

    if (options.json) {
      console.log(
        JSON.stringify(
          buildEnvelope({
            command: 'doc.publish',
            surface: `/api/docman/document-versions/:id/materialize`,
            resolvedContext: buildResolvedContextRecord(resolvedContext),
            input,
            result,
            artifacts: artifacts && Object.keys(artifacts).length > 0 ? artifacts : undefined,
          }),
          null,
          2,
        ),
      )
      return
    }

    if (outputPath) {
      logSuccess(`Publish materialization written to ${outputPath}.`)
      return
    }

    await emitDocResult({
      options,
      command: 'doc.publish',
      surface: `/api/docman/document-versions/:id/materialize`,
      resolvedContext,
      input,
      result,
      successText: 'Publish materialization loaded.',
      artifacts,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function applyDocContextOptions<T extends Command>(cmd: T): T {
  applyCommonOptions(cmd, { withProject: false })
  cmd.option('--scope-id <id>', 'Canonical owner scope override')
  cmd.option('--project-id <id>', 'Project id used to resolve the canonical owner scope')
  cmd.option('--project-name <name>', 'Project name override for repo-aware scope resolution')
  cmd.option('--project-slug <slug>', 'Project slug override for repo-aware scope resolution')
  cmd.option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
  cmd.option('--locale <locale>', 'Locale header (x-locale)')
  cmd.option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
  return cmd
}

function applyWriteOptions<T extends Command>(cmd: T): T {
  cmd.option('--preview', 'Return a validated preflight summary without executing the command')
  cmd.option('--apply', 'Explicitly allow guarded write operations')
  cmd.option('--confirm', 'Explicitly confirm destructive operations when needed')
  cmd.option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
  return cmd
}

export function makeDocCommand(): Command {
  const cmd = new Command('doc').description('Docman authoring, retrieval, and publish sugar over the hosted AOPS plane')

  applyDocContextOptions(
    cmd
      .command('list')
      .description('List Docman documents through the hosted gateway')
      .option('--status <value>', 'Document status filter')
      .option('--slug <value>', 'Document slug filter')
      .option('--title <value>', 'Document title filter')
      .option('--group-id <id>', 'Document group id filter')
      .option('--group-uid <uid>', 'Document group uid filter')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: DocListOptions) => {
        await runDocList(options)
      }),
  )

  applyDocContextOptions(
    cmd
      .command('get')
      .description('Get a Docman document by id through the hosted gateway')
      .requiredOption('--id <id>', 'Document id')
      .action(async (options: DocGetOptions) => {
        await runDocGet(options)
      }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      cmd
        .command('create')
        .description('Create a Docman document through the canonical flow surface')
        .option('--title <title>', 'Document title')
        .option('--input <json>', 'JSON object or @file.json with create fields')
        .option('--document-uid <uid>', 'Document uid override')
        .option('--slug <slug>', 'Document slug')
        .option('--summary <text>', 'Document summary')
        .option('--description <text>', 'Document description')
        .option('--status <value>', 'Document status', 'draft')
        .option('--visibility <value>', 'Document visibility', 'internal')
        .option('--group-id <id>', 'Document group id')
        .option('--group-uid <uid>', 'Document group uid')
        .option('--tag <value>', 'Repeatable tag', collectRepeatedOption, []),
    ).action(async (options: DocCreateOptions) => {
      await runDocCreate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      cmd
        .command('update')
        .description('Update a Docman document through the canonical flow surface')
        .option('--id <id>', 'Document id')
        .option('--input <json>', 'JSON object or @file.json with update fields')
        .option('--title <title>', 'Document title')
        .option('--slug <slug>', 'Document slug')
        .option('--summary <text>', 'Document summary')
        .option('--description <text>', 'Document description')
        .option('--status <value>', 'Document status')
        .option('--visibility <value>', 'Document visibility')
        .option('--group-id <id>', 'Document group id')
        .option('--group-uid <uid>', 'Document group uid')
        .option('--tag <value>', 'Repeatable tag', collectRepeatedOption, []),
    ).action(async (options: DocUpdateOptions) => {
      await runDocUpdate(options)
      }),
  )

  const group = cmd.command('group').description('Docman document-group commands')
  applyDocContextOptions(
    group
      .command('list')
      .description('List document groups')
      .option('--title <text>', 'Document group title filter')
      .option('--group-uid <uid>', 'Document group uid filter')
      .option('--parent-group-id <id>', 'Parent document group id filter')
      .option('--parent-group-uid <uid>', 'Parent document group uid filter')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: DocGroupListOptions) => {
        await runDocGroupList(options)
      }),
  )

  applyDocContextOptions(
    group
      .command('get')
      .description('Get a document group by id')
      .requiredOption('--id <id>', 'Document group id')
      .action(async (options: DocGroupGetOptions) => {
        await runDocGroupGet(options)
      }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      group
        .command('create')
        .description('Create a document group')
        .option('--title <title>', 'Document group title')
        .option('--input <json>', 'JSON object or @file.json with create fields')
        .option('--group-uid <uid>', 'Document group uid override')
        .option('--parent-group-id <id>', 'Optional parent document group id')
        .option('--parent-group-uid <uid>', 'Optional parent document group uid'),
    ).action(async (options: DocGroupCreateOptions) => {
      await runDocGroupCreate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      group
        .command('update')
        .description('Update a document group')
        .option('--id <id>', 'Document group id')
        .option('--input <json>', 'JSON object or @file.json with update fields')
        .option('--title <title>', 'Document group title')
        .option('--group-uid <uid>', 'Document group uid')
        .option('--parent-group-id <id>', 'Optional parent document group id')
        .option('--parent-group-uid <uid>', 'Optional parent document group uid'),
    ).action(async (options: DocGroupUpdateOptions) => {
      await runDocGroupUpdate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      group
        .command('delete')
        .description('Delete a document group')
        .requiredOption('--id <id>', 'Document group id'),
    ).action(async (options: DocGroupDeleteOptions) => {
      await runDocGroupDelete(options)
    }),
  )

  const version = cmd.command('version').description('Docman document-version commands')
  applyDocContextOptions(
    version
      .command('list')
      .description('List document versions')
      .option('--document-id <id>', 'Document id filter')
      .option('--status <value>', 'Version status filter')
      .option('--title <text>', 'Version title filter')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: DocVersionListOptions) => {
        await runDocVersionList(options)
      }),
  )

  applyDocContextOptions(
    version
      .command('get')
      .description('Get a document version by id')
      .requiredOption('--id <id>', 'Document version id')
      .action(async (options: DocVersionReadOptions) => {
        await runDocVersionGet(options)
      }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      version
        .command('create')
        .description('Create a document version through the canonical flow surface')
        .option('--document-id <id>', 'Document id')
        .option('--version <number>', 'Version number', (value) => Number.parseInt(String(value), 10))
        .option('--input <json>', 'JSON object or @file.json with create fields')
        .option('--label <text>', 'Optional version label')
        .option('--title <text>', 'Optional version title')
        .option('--summary <text>', 'Optional version summary')
        .option('--release-notes <text>', 'Optional release notes')
        .option('--status <value>', 'Version status', 'draft')
        .option('--init-mode <mode>', 'Version init mode: clean, clone_all, clone_selected')
        .option('--source-version-id <id>', 'Source version id when cloning')
        .option('--source-section-link-id <id>', 'Repeatable source section link id', collectRepeatedOption, []),
    ).action(async (options: DocVersionCreateOptions) => {
      await runDocVersionCreate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      version
        .command('update')
        .description('Update document-version header metadata (status / title / summary / release-notes / label). To switch the canonical current version, use `aops-cli doc set-current-version` instead.')
        .requiredOption('--id <id>', 'Document version id')
        .option('--input <json>', 'JSON object or @file.json with patch fields')
        .option('--status <value>', 'Version status (draft | published | archived)')
        .option('--title <text>', 'Optional title patch')
        .option('--summary <text>', 'Optional summary patch')
        .option('--release-notes <text>', 'Optional release-notes patch')
        .option('--label <text>', 'Optional label patch'),
    ).action(async (options: DocVersionUpdateOptions) => {
      await runDocVersionUpdate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      cmd
        .command('set-current-version')
        .description('Flip a document’s canonical current version atomically (peer-clear + optional publish + publishedAt). Dispatches docman.document-version.set-current.')
        .option('--document-id <id>', 'Optional document id guard (rejects if target version belongs to a different document)')
        .requiredOption('--version-id <id>', 'Target document version id (the one to mark current)')
        .option('--input <json>', 'JSON object or @file.json with the full input payload')
        .option('--publish-now', 'Set publishedAt to server now; default true when --published-at is omitted')
        .option('--no-publish-now', 'Skip setting publishedAt to server now')
        .option('--published-at <iso>', 'Explicit ISO timestamp for publishedAt (overrides --publish-now)')
        .option('--no-publish', 'Flip isCurrent without changing status / publishedAt (status stays as-is)')
        .option('--expected-previous-version-id <id>', 'Race guard: fail if the currently-current version id does not match this'),
    ).action(async (options: DocSetCurrentVersionOptions) => {
      await runDocSetCurrentVersion(options)
    }),
  )

  const section = cmd.command('section').description('Docman section commands')
  applyDocContextOptions(
    section
      .command('list')
      .description('List sections')
      .option('--title <text>', 'Section title filter')
      .option('--slug <slug>', 'Section slug filter')
      .option('--kind <kind>', 'Section kind filter')
      .option('--section-uid <uid>', 'Section uid filter')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: DocSectionListOptions) => {
        await runDocSectionList(options)
      }),
  )

  applyDocContextOptions(
    section
      .command('get')
      .description('Get a section by id')
      .requiredOption('--id <id>', 'Section id')
      .action(async (options: DocSectionGetOptions) => {
        await runDocSectionGet(options)
      }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      section
        .command('create')
        .description('Create a section and optionally link it into a document outline')
        .option('--title <title>', 'Section title')
        .option('--input <json>', 'JSON object or @file.json with create fields')
        .option('--section-uid <uid>', 'Section uid override')
        .option('--slug <slug>', 'Section slug')
        .option('--document-version-id <id>', 'Optional document version id to link into')
        .option('--parent-link-id <id>', 'Optional parent document link id')
        .option('--title-override <text>', 'Optional document-link title override')
        .option('--numbering <text>', 'Optional numbering override')
        .option('--position <index>', 'Optional sibling position', (value) => Number.parseInt(String(value), 10)),
    ).action(async (options: DocSectionCreateOptions) => {
      await runDocSectionCreate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      section
        .command('update')
        .description('Update a Docman section through the canonical flow surface')
        .option('--id <id>', 'Section id')
        .option('--input <json>', 'JSON object or @file.json with update fields')
        .option('--title <title>', 'Section title')
        .option('--slug <slug>', 'Section slug'),
    ).action(async (options: DocSectionUpdateOptions) => {
      await runDocSectionUpdate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      section
        .command('copy')
        .description('Copy a section into a document version through the canonical flow surface')
        .option('--input <json>', 'JSON object or @file.json with copy fields')
        .option('--source-section-id <id>', 'Source section id')
        .option('--target-document-version-id <id>', 'Target document version id')
        .option('--parent-link-id <id>', 'Optional parent document-section-link id')
        .option('--position <index>', 'Optional sibling position', (value) => Number.parseInt(String(value), 10))
        .option('--rename <title>', 'Copied section title or reuse-mode title override')
        .option('--reuse-pages', 'Reuse source page versions when copying the section')
        .option('--clone-pages', 'Clone source pages and page versions when copying the section'),
    ).action(async (options: DocSectionCopyOptions) => {
      await runDocSectionCopy(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      section
        .command('unlink')
        .description('Unlink a section from a document outline without deleting the section')
        .requiredOption('--link-id <id>', 'Document-section-link id'),
    ).action(async (options: DocSectionUnlinkOptions) => {
      await runDocSectionUnlink(options)
    }),
  )

  const page = cmd.command('page').description('Docman page and page-version commands')
  applyDocContextOptions(
    page
      .command('list')
      .description('List pages')
      .option('--title <text>', 'Page title filter')
      .option('--kind <kind>', 'Page kind filter')
      .option('--page-uid <uid>', 'Page uid filter')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: DocPageListOptions) => {
        await runDocPageList(options)
      }),
  )

  applyDocContextOptions(
    page
      .command('get')
      .description('Get a page by id')
      .requiredOption('--id <id>', 'Page id')
      .action(async (options: DocPageGetOptions) => {
        await runDocPageGet(options)
      }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      page
        .command('create')
        .description('Create a page with its first draft and optionally link it into a document tree')
        .option('--title <title>', 'Page title')
        .option('--input <json>', 'JSON object or @file.json with create fields')
        .option('--page-uid <uid>', 'Page uid override')
        .option('--document-version-id <id>', 'Optional document version id for linked page creation')
        .option('--section-id <id>', 'Optional section id')
        .option('--parent-link-id <id>', 'Optional parent document link id')
        .option('--format <value>', 'Page source format: md or mdx', 'md')
        .option('--content <text>', 'Initial page draft content'),
    ).action(async (options: DocPageCreateOptions) => {
      await runDocPageCreate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      page
        .command('update')
        .description('Update Docman page metadata through the canonical flow surface')
        .option('--id <id>', 'Page id')
        .option('--input <json>', 'JSON object or @file.json with update fields')
        .option('--title <title>', 'Page title'),
    ).action(async (options: DocPageUpdateOptions) => {
      await runDocPageUpdate(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      page
        .command('copy')
        .description('Copy a page into a section through the canonical flow surface')
        .option('--input <json>', 'JSON object or @file.json with copy fields')
        .option('--source-page-id <id>', 'Source page id')
        .option('--source-page-version-id <id>', 'Optional source page version id; latest is used when omitted')
        .option('--target-section-id <id>', 'Target section id')
        .option('--position <index>', 'Optional section-page-link position', (value) => Number.parseInt(String(value), 10))
        .option('--rename <title>', 'Copied page title or reuse-mode title override')
        .option('--reuse-page', 'Reuse the selected source page version')
        .option('--clone-page', 'Clone source page metadata and source content'),
    ).action(async (options: DocPageCopyOptions) => {
      await runDocPageCopy(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      page
        .command('move')
        .description('Move a section-page-link to another section')
        .requiredOption('--link-id <id>', 'Section-page-link id')
        .requiredOption('--target-section-id <id>', 'Target section id')
        .option('--position <index>', 'Optional target position', (value) => Number.parseInt(String(value), 10)),
    ).action(async (options: DocPageMoveOptions) => {
      await runDocPageMove(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      page
        .command('unlink')
        .description('Unlink a page version from a section without deleting the page')
        .requiredOption('--link-id <id>', 'Section-page-link id'),
    ).action(async (options: DocPageUnlinkOptions) => {
      await runDocPageUnlink(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      page
        .command('draft-save')
        .description('Create or update a page-version draft through the canonical flow surface')
        .option('--input <json>', 'JSON object or @file.json with draft fields')
        .option('--page-version-id <id>', 'Existing page version id')
        .option('--document-link-id <id>', 'Optional document link id for relink-on-fork behavior')
        .option('--page-id <id>', 'Page id when creating a new draft version')
        .option('--title <text>', 'Draft title')
        .option('--format <value>', 'Draft source format: md or mdx')
        .option('--content <text>', 'Draft content')
        .option('--status <value>', 'Draft status', 'draft'),
    ).action(async (options: DocPageDraftSaveOptions) => {
      await runDocPageDraftSave(options)
    }),
  )

  const pageVersion = cmd.command('page-version').description('Docman page-version commands')
  applyDocContextOptions(
    pageVersion
      .command('list')
      .description('List page versions')
      .option('--page-id <id>', 'Page id filter')
      .option('--status <value>', 'Page version status filter')
      .option('--title <text>', 'Page version title filter')
      .option('--format <value>', 'Page version format filter')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: DocPageVersionListOptions) => {
        await runDocPageVersionList(options)
      }),
  )

  applyDocContextOptions(
    pageVersion
      .command('get')
      .description('Get a page version by id')
      .requiredOption('--id <id>', 'Page version id')
      .action(async (options: DocPageVersionGetOptions) => {
      await runDocPageVersionGet(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      pageVersion
        .command('update')
        .description('Update page-version metadata; content changes must use doc page draft-save')
        .option('--id <id>', 'Page version id')
        .option('--input <json>', 'JSON object or @file.json with update fields')
        .option('--status <value>', 'Page version status: draft, review, published, archived'),
    ).action(async (options: DocPageVersionUpdateOptions) => {
      await runDocPageVersionUpdate(options)
    }),
  )

  const link = cmd.command('link').description('Docman structure linking commands')
  const linkSection = link.command('section').description('Link or unlink sections in a document outline')
  applyDocContextOptions(
    applyWriteOptions(
      linkSection
        .option('--document-version-id <id>', 'Document version id')
        .option('--section-id <id>', 'Section id')
        .option('--input <json>', 'JSON object or @file.json with link fields')
        .option('--parent-link-id <id>', 'Optional parent document link id')
        .option('--position <index>', 'Optional sibling position', (value) => Number.parseInt(String(value), 10))
        .option('--title-override <text>', 'Optional title override')
        .option('--numbering <text>', 'Optional numbering override'),
    ).action(async (options: DocLinkSectionOptions) => {
      await runDocLinkSection(options)
    }),
  )
  applyDocContextOptions(
    applyWriteOptions(
      linkSection
        .command('delete')
        .description('Alias for doc section unlink')
        .requiredOption('--link-id <id>', 'Document-section-link id'),
    ).action(async (options: DocSectionUnlinkOptions) => {
      await runDocSectionUnlink(options)
    }),
  )

  const linkPage = link.command('page').description('Link or unlink pages in a section')
  applyDocContextOptions(
    applyWriteOptions(
      linkPage
        .option('--section-id <id>', 'Section id')
        .option('--input <json>', 'JSON object or @file.json with link fields')
        .option('--page-version-id <id>', 'Page version id')
        .option('--page-id <id>', 'Page id')
        .option('--position <index>', 'Optional sibling position', (value) => Number.parseInt(String(value), 10))
        .option('--title-override <text>', 'Optional title override')
        .option('--numbering <text>', 'Optional numbering override'),
    ).action(async (options: DocLinkPageOptions) => {
      await runDocLinkPage(options)
    }),
  )
  applyDocContextOptions(
    applyWriteOptions(
      linkPage
        .command('delete')
        .description('Alias for doc page unlink')
        .requiredOption('--link-id <id>', 'Section-page-link id'),
    ).action(async (options: DocPageUnlinkOptions) => {
      await runDocPageUnlink(options)
    }),
  )

  const order = cmd.command('order').description('Docman outline ordering commands')
  applyDocContextOptions(
    applyWriteOptions(
      order
        .command('sections')
        .description('Update document-section-link ordering through the canonical flow surface')
        .requiredOption('--document-version-id <id>', 'Document version id')
        .option('--update <json>', 'Repeatable JSON update item', collectRepeatedOption, [])
        .option('--input <json>', 'JSON array or @file.json with update records'),
    ).action(async (options: DocOrderSectionsOptions) => {
      await runDocOrderSections(options)
    }),
  )

  const outline = cmd.command('outline').description('Docman normalized outline inspection')
  applyDocContextOptions(
    outline
      .command('get')
      .description('Read a section-centric normalized outline for a saved document version')
      .requiredOption('--document-version-id <id>', 'Document version id')
      .option(
        '--titles-only',
        'Emit a body-free section/title tree: project each page version down to { id, pageId, version, title, format, status } and drop content/contentMl/contentData/directives (still can be large for big outlines; pair with --depth)',
      )
      .option(
        '--depth <n>',
        'Stop recursing into nested sections beyond depth n (root sections are depth 0); page/title leaves at kept levels are preserved',
        (value) => Number.parseInt(String(value), 10),
      )
      .action(async (options: DocOutlineGetOptions) => {
        await runDocOutlineGet(options)
      }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      order
        .command('pages')
        .description('Update section-page-link ordering through the canonical flow surface')
        .requiredOption('--section-id <id>', 'Section id')
        .option('--update <json>', 'Repeatable JSON update item', collectRepeatedOption, [])
        .option('--input <json>', 'JSON array or @file.json with update records'),
    ).action(async (options: DocOrderPagesOptions) => {
      await runDocOrderPages(options)
    }),
  )

  const index = cmd.command('index').description('Docman retrieval index commands')
  applyDocContextOptions(
    index
      .command('build')
      .description('Build or refresh the persisted retrieval index for a saved document version')
      .requiredOption('--document-version-id <id>', 'Document version id')
      .action(async (options: DocVersionReadOptions) => {
        await runDocIndexBuild(options)
      }),
  )

  const summary = cmd.command('summary').description('Docman persisted summary commands')
  applyDocContextOptions(
    summary
      .command('build')
      .description('Build or refresh persisted summaries for a saved document version; index rows are ensured first')
      .requiredOption('--document-version-id <id>', 'Document version id')
      .action(async (options: DocVersionReadOptions) => {
        await runDocSummaryBuild(options)
      }),
  )

  applyDocContextOptions(
    cmd
      .command('search')
      .description('Search persisted Docman retrieval rows for a saved document version')
      .requiredOption('--document-version-id <id>', 'Document version id')
      .requiredOption('--q <text>', 'Search query')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--retrieval-strategy <mode>', 'Retrieval strategy: lexical, hybrid, semantic', 'hybrid')
      .option('--ensure <mode>', 'Hosted pre-read build: none = read existing, index = refresh rows, summary = refresh rows + summaries', 'summary')
      .option('--local', 'Search only the repo-local .aops/docman mirror')
      .option('--remote', 'Use the hosted Docman API directly instead of local-first auto mode')
      .option('--mirror-dir <path>', 'Repo-local Docman mirror directory for local-first/--local', path.join('.aops', 'docman'))
      .action(async (options: DocSearchOptions) => {
        await runDocSearch(options)
      }),
  )

  const scope = cmd.command('scope').description('Docman scope-owned retrieval commands')
  applyDocContextOptions(
    scope
      .command('search')
      .description('Search persisted Docman retrieval rows across latest document versions in one scope')
      .requiredOption('--q <text>', 'Search query')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--retrieval-strategy <mode>', 'Retrieval strategy: lexical, hybrid, semantic', 'hybrid')
      .option('--local', 'Search only the repo-local .aops/docman mirror')
      .option('--remote', 'Use the hosted Docman API directly instead of local-first auto mode')
      .option('--mirror-dir <path>', 'Repo-local Docman mirror directory for local-first/--local', path.join('.aops', 'docman'))
      .action(async (options: DocScopeSearchOptions) => {
        await runDocScopeSearch(options)
      }),
  )

  applyDocContextOptions(
    scope
      .command('answer')
      .description('Read a citation-first answer pack across latest document versions in one scope')
      .requiredOption('--q <text>', 'Question text')
      .option('--limit <count>', 'Citation limit', (value) => Number.parseInt(String(value), 10))
      .option('--retrieval-strategy <mode>', 'Retrieval strategy: lexical, hybrid, semantic', 'hybrid')
      .option('--local', 'Read only from the repo-local .aops/docman mirror')
      .option('--remote', 'Use the hosted Docman API directly instead of local-first auto mode')
      .option('--mirror-dir <path>', 'Repo-local Docman mirror directory for local-first/--local', path.join('.aops', 'docman'))
      .action(async (options: DocScopeAnswerOptions) => {
        await runDocScopeAnswer(options)
      }),
  )

  const importCommand = applyDocContextOptions(
    applyWriteOptions(
      cmd
        .command('import')
        .description('Import structured Docman content from source files')
        .option('--from-markdown', 'Parse --source as markdown heading graph')
        .requiredOption('--document-version-id <id>', 'Target clean document version id')
        .requiredOption('--source <path>', 'Markdown source path, @path, or - for stdin')
        .option('--baseline <path>', 'Prior materialized markdown path used to guard against unrelated body loss')
        .option('--guard-target <heading>', 'Heading path/title allowed to change when --baseline is provided (repeatable)', collectRepeatedOption, [])
        .option('--dry-run', 'Execute service-side import planning without mutating rows')
        .option('--existing-graph-policy <policy>', 'Existing graph policy: error, append, replace', 'error')
        .option('--append-existing-graph', 'Append into an existing graph explicitly')
        .option('--replace-existing-graph', 'Request explicit replace semantics')
        .option('--slug-strategy <strategy>', 'Slug strategy: hash-suffix-on-collision or kebab-from-title', 'hash-suffix-on-collision')
        .option('--body-assignment <policy>', 'Body assignment policy', 'leaf-page-content')
        .option('--heading-to-page-policy <policy>', 'Heading-to-page policy', 'h4-and-below')
        .option('--synthesize-overview-pages', 'Import direct H2/H3 section body as child Overview pages'),
    ).action(async (options: DocImportMarkdownOptions) => {
      await runDocImportMarkdown(options)
    }),
  )
  importCommand.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli doc import --from-markdown --document-version-id <docver-id> --source ./candidate.md --baseline ./.aops/docman/<group>/<document>.md --guard-target "<intended heading>" --dry-run --json',
        'aops-cli doc import --from-markdown --document-version-id <docver-id> --source ./candidate.md --baseline ./.aops/docman/<group>/<document>.md --guard-target "<intended heading>" --synthesize-overview-pages --dry-run --json',
      ],
      guide: GUIDE_PATHS.docman,
      notes: [
        'If dry-run warnings include section-direct-body-ignored, the default leaf-page-content policy would drop direct H2/H3 section prose.',
        'In JSON, warning codes are under result.summary.warnings[].code, or result.import.summary.warnings[].code when baselineGuard wraps the import result.',
        'Use --synthesize-overview-pages when direct H2/H3 body text must become child Overview pages, then verify the mirror after publish/pull.',
        'Use --baseline and --guard-target for full-document imports; apply is blocked on unrelated deltas unless --confirm is explicit.',
      ],
    }),
  )

  const mirror = cmd.command('mirror').description('Docman mirror pull and markdown import helpers')
  applyDocContextOptions(
    applyWriteOptions(
      mirror
        .command('push')
        .description('Import root markdown files into hosted Docman; use manual doc version/section/page commands for canonical graph authoring')
        .option('--source-dir <path>', 'Directory containing root *.md files', 'docs')
        .option('--group-title <title>', 'Document group title to create/use')
        .option('--group-uid <uid>', 'Document group uid to create/use')
        .option('--document-status <value>', 'Document status: draft, published, archived', 'published')
        .option('--version-status <value>', 'Document version status: draft, published, archived', 'published')
        .option('--visibility <value>', 'Document visibility: public, private, internal', 'internal')
        .option('--no-index', 'Skip building the retrieval index after import')
        .option('--no-summary', 'Skip building summaries after import'),
    ).action(async (options: DocMirrorPushOptions) => {
      await runDocMirrorPush(options)
    }),
  )

  applyDocContextOptions(
    applyWriteOptions(
      mirror
        .command('pull')
        .description('Materialize hosted Docman documents into .aops/docman read-only mirrors')
        .option('--group-uid <uid>', 'Only pull one document group uid')
        .option('--document-slug <slug>', 'Only pull matching document slug (repeatable)', collectRepeatedOption, [])
        .option('--status <value>', 'Document status filter')
        .option('--limit <count>', 'Document limit', (value) => Number.parseInt(String(value), 10))
        .option('--out-dir <path>', 'Repo-local mirror output directory', path.join('.aops', 'docman'))
        .option('--target <target>', 'Publish target: markdown or html', 'markdown'),
    ).action(async (options: DocMirrorPullOptions) => {
      await runDocMirrorPull(options)
    }),
  )

  applyDocContextOptions(
    cmd
      .command('answer')
      .description('Read a citation-first deterministic answer pack for a saved document version')
      .requiredOption('--document-version-id <id>', 'Document version id')
      .requiredOption('--q <text>', 'Question text')
      .option('--limit <count>', 'Citation limit', (value) => Number.parseInt(String(value), 10))
      .option('--retrieval-strategy <mode>', 'Retrieval strategy: lexical, hybrid, semantic', 'hybrid')
      .option('--ensure <mode>', 'Hosted pre-read build: none = read existing, index = refresh rows, summary = refresh rows + summaries', 'summary')
      .option('--local', 'Read a deterministic answer pack only from the repo-local .aops/docman mirror')
      .option('--remote', 'Use the hosted Docman API directly instead of local-first auto mode')
      .option('--mirror-dir <path>', 'Repo-local Docman mirror directory for local-first/--local', path.join('.aops', 'docman'))
      .action(async (options: DocAnswerOptions) => {
        await runDocAnswer(options)
      }),
  )

  applyDocContextOptions(
    cmd
      .command('source')
      .description('Fetch exact composed source for a saved document fragment')
      .requiredOption('--document-version-id <id>', 'Document version id')
      .option('--section-id <id>', 'Section id')
      .option('--page-version-id <id>', 'Page version id')
      .option('--page-number <number>', 'Page number', (value) => Number.parseInt(String(value), 10))
      .action(async (options: DocSourceOptions) => {
        await runDocSource(options)
      }),
  )

  applyDocContextOptions(
    cmd
      .command('publish')
      .description('Materialize saved document content to markdown or html')
      .requiredOption('--document-version-id <id>', 'Document version id')
      .option('--target <target>', 'Publish target: markdown or html', 'markdown')
      .option('--out <path>', 'Write materialized content to a file path')
      .option('--section-id <id>', 'Section id')
      .option('--page-version-id <id>', 'Page version id')
      .option('--page-number <number>', 'Page number', (value) => Number.parseInt(String(value), 10))
      .action(async (options: DocPublishOptions) => {
        await runDocPublish(options)
      }),
  )

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli doc create --title "Power Tree" --apply --json',
        'aops-cli doc group create --title "Guides" --apply --json',
        'aops-cli doc group list --json',
        'aops-cli doc version create --document-id <doc-id> --version 1 --status draft --apply --json',
        'aops-cli doc section create --document-version-id <docver-id> --title "Overview" --apply --json',
        'aops-cli doc page create --document-version-id <docver-id> --section-id <section-id> --title "Startup" --content \'@./page.md\' --apply --json',
        'aops-cli doc import --from-markdown --document-version-id <docver-id> --source ./ui-system-v2.md --dry-run --json',
        'aops-cli doc import --from-markdown --document-version-id <docver-id> --source ./user_guide.md --baseline ./.aops/docman/eops-cli/user_guide.md --guard-target "BOM Variant Build Models" --dry-run --json',
        'aops-cli doc import --from-markdown --document-version-id <docver-id> --source ./ui-system-v2.md --apply --json',
        'aops-cli doc outline get --document-version-id <docver-id> --json',
        'aops-cli doc index build --document-version-id <docver-id> --json',
        'aops-cli doc summary build --document-version-id <docver-id> --json',
        'aops-cli doc search --document-version-id <docver-id> --q "startup current" --json',
        'aops-cli doc search --document-version-id <docver-id> --q "startup current" --local --json',
        'aops-cli doc search --document-version-id <docver-id> --q "startup current" --remote --ensure summary --json',
        'aops-cli doc answer --document-version-id <docver-id> --q "Enable pin behavior?" --json',
        'aops-cli doc answer --document-version-id <docver-id> --q "Enable pin behavior?" --remote --ensure summary --json',
        'aops-cli doc publish --document-version-id <docver-id> --target markdown --out ./tmp/doc.md',
        'aops-cli doc mirror pull --project-slug aops --group-uid architecture --out-dir ./.aops/docman --apply --json',
        'aops-cli doc mirror push --project-slug aops --source-dir ./docs --group-uid architecture --group-title Architecture --apply --json  # import-only helper',
        'aops-cli doc scope search --project-id <project-id> --q "startup current" --json',
        'aops-cli doc scope answer --project-id <project-id> --q "startup current" --json',
        'aops-cli doc scope search --project-id <project-id> --q "startup current" --remote --json',
        'aops-cli doc source --document-version-id <docver-id> --section-id <section-id> --json',
        'aops-cli doc publish --document-version-id <docver-id> --target html --json',
      ],
      guide: GUIDE_PATHS.docman,
      notes: [
        'For one-page/one-section edits, prefer clone_all + page/section CRUD + set-current-version + mirror pull.',
        'Use doc import --baseline for full-document imports; apply is blocked on unrelated deltas unless --confirm is explicit.',
        '.aops/docman/** is a read-only mirror. Refresh it with doc mirror pull after canonical Docman changes.',
      ],
    }),
  )

  return cmd
}
