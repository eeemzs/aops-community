import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  type Stats,
} from 'node:fs'
import path from 'node:path'

import { AgentAssetsError } from './envelope.js'
import {
  AOPS_AGENT_ASSETS_GATEWAY,
  AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
  AOPS_AGENT_ASSETS_GATEWAY_SHA256,
} from './gateway.js'
import {
  openAgentAssetsNativePublicationSession,
  type AgentAssetsNativeCapabilityV1,
  type AgentAssetsNativePublicationSession,
  type AgentAssetsNativeRuntimeRoot,
  type OpenAgentAssetsNativeSessionOptions,
} from './native-fs.js'
import {
  agentAssetsRuntimeHomeId,
  inspectRuntimeGatewayBinding,
  parseRuntimeBindingV1,
  parseRuntimeGatewayOwnerMarkerV1,
  type RuntimeBindingInspectionV1,
} from './runtime-binding-reader.js'
import {
  canonicalJsonSha256V1,
  canonicalJsonV1,
  readAgentAssetsStoreSnapshot,
} from './store-reader.js'
import type {
  ActivePointerV1,
  ActivationReceiptV1,
  PublicationCapabilityV1,
  RuntimeBindingReceiptV1,
  RuntimeBindingV1,
  RuntimeGatewayOwnerMarkerV1,
  StoreAuthorityV1,
} from './store-types.js'

const MAX_LEGACY_POINTER_BYTES = 64 * 1024
const MAX_MANAGED_STATE_BYTES = 1024 * 1024
const OWNER_MARKER_RELATIVE_PATH = 'skills/aops/.aops-gateway-owner.json' as const
type Runtime = 'codex' | 'claude'

export const LEGACY_POINTER_GENERATOR_CONTRACT_V1 = Object.freeze({
  schemaVersion: 1 as const,
  canonicalOwner: 'aops-cli.assets.migrate.legacy-pointers' as const,
  retiredGenerators: Object.freeze([
    Object.freeze({
      template: 'setup-agent-assets-v1' as const,
      source: 'apps/aops-cli/src/utils/agent-assets.ts',
    }),
    Object.freeze({
      template: 'workspace-pointer-sync-v2' as const,
      source: '<workspace>/scripts/sync-aops-skills-to-codex.mjs',
    }),
  ]),
})

export type LegacyPointerTemplateV1 =
  (typeof LEGACY_POINTER_GENERATOR_CONTRACT_V1.retiredGenerators)[number]['template']

export type LegacyPointerClassificationStateV1 =
  | 'absent'
  | 'recognized-legacy'
  | 'managed-ready'
  | 'ownership-conflict'
  | 'unknown-user-owned'
  | 'unsafe-path'

export type LegacyPointerClassificationV1 = Readonly<{
  schemaVersion: 1
  runtime: Runtime
  runtimeHomeId: string
  relativePath: typeof AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH
  state: LegacyPointerClassificationStateV1
  eligible: boolean
  contentSha256?: string
  legacyTemplate?: LegacyPointerTemplateV1
  bindingState: RuntimeBindingInspectionV1['state']
  reasons: readonly string[]
}>

export type InspectLegacyPointersOptionsV1 = Readonly<{
  assetRoot: string
  runtimeHomes: Readonly<Partial<Record<Runtime, string>>>
  expectedRuntimeRootIdentitySha256?: Readonly<Partial<Record<Runtime, string>>>
}>

export type MigrateLegacyPointersOptionsV1 = Readonly<{
  assetRoot: string
  runtimeHomes: Readonly<Partial<Record<Runtime, string>>>
  bootstrapAnchor?: string
  now?: () => Date
  randomId?: () => string
  openNative?: (
    options: OpenAgentAssetsNativeSessionOptions,
  ) => Promise<AgentAssetsNativePublicationSession>
}>

export type MigrateLegacyPointersResultV1 = Readonly<{
  idempotent: boolean
  migrated: readonly Runtime[]
  unchanged: readonly Runtime[]
  authority: StoreAuthorityV1
  active: ActivePointerV1
  receipt: ActivationReceiptV1
  capability: AgentAssetsNativeCapabilityV1
  classifications: readonly LegacyPointerClassificationV1[]
}>

export type RemoveAopsGatewayPointersOptionsV1 = Readonly<{
  assetRoot: string
  runtimeHomes: Readonly<Partial<Record<Runtime, string>>>
}>

export type RemoveAopsGatewayPointersResultV1 = Readonly<{
  removed: readonly Runtime[]
  unchanged: readonly Runtime[]
  retainedManagedBindings: readonly Runtime[]
  classifications: readonly LegacyPointerClassificationV1[]
}>

type SafeFileRead =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'unsafe-path'; reason: string }>
  | Readonly<{ state: 'ready'; bytes: Buffer }>

export type ParsedLegacyPointer = Readonly<{
  template: LegacyPointerTemplateV1
  sha256: string
  bytes: Buffer
}>

type PreparedRuntime = Readonly<{
  runtime: Runtime
  runtimeHome: string
  nativeRoot: AgentAssetsNativeRuntimeRoot
  classification: LegacyPointerClassificationV1
  legacy?: ParsedLegacyPointer
}>

function migrationError(
  code: ConstructorParameters<typeof AgentAssetsError>[0],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AgentAssetsError {
  return new AgentAssetsError(code, message, {
    nextActions: [
      'Run `aops assets migrate inspect --json` and leave unknown/user-owned files untouched.',
    ],
    ...(details === undefined ? {} : { details }),
  })
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJsonV1(value), 'utf8')
}

function isSameFile(before: Stats, after: Stats): boolean {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size
}

function pathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function linkedExistingAncestor(absolutePath: string): boolean {
  const normalized = path.normalize(absolutePath)
  const parsed = path.parse(normalized)
  let cursor = parsed.root
  for (const segment of normalized.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment)
    if (!existsSync(cursor)) break
    if (lstatSync(cursor).isSymbolicLink()) return true
  }
  return false
}

function safeReadBoundedFile(rootPath: string, relativePath: string, maximumBytes: number): SafeFileRead {
  if (!path.isAbsolute(rootPath)) return { state: 'unsafe-path', reason: 'root-not-absolute' }
  const root = path.normalize(rootPath)
  if (linkedExistingAncestor(root)) return { state: 'unsafe-path', reason: 'root-or-parent-link' }
  if (!existsSync(root)) return { state: 'absent' }
  const segments = relativePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
    return { state: 'unsafe-path', reason: 'unsafe-relative-path' }
  }
  try {
    const rootStat = lstatSync(root)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return { state: 'unsafe-path', reason: 'root-link-or-special' }
    }
    const realRoot = realpathSync.native(root)
    let cursor = root
    for (const segment of segments.slice(0, -1)) {
      cursor = path.join(cursor, segment)
      if (!existsSync(cursor)) return { state: 'absent' }
      const stat = lstatSync(cursor)
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        return { state: 'unsafe-path', reason: 'ancestor-link-or-special' }
      }
      if (!pathWithin(realRoot, realpathSync.native(cursor))) {
        return { state: 'unsafe-path', reason: 'ancestor-escaped-root' }
      }
    }
    const filePath = path.join(cursor, segments.at(-1)!)
    if (!existsSync(filePath)) return { state: 'absent' }
    const before = lstatSync(filePath)
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maximumBytes) {
      return { state: 'unsafe-path', reason: 'file-link-special-or-unbounded' }
    }
    if (!pathWithin(realRoot, realpathSync.native(filePath))) {
      return { state: 'unsafe-path', reason: 'file-escaped-root' }
    }
    const noFollow = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0)
    const fd = openSync(filePath, constants.O_RDONLY | noFollow)
    try {
      const opened = fstatSync(fd)
      if (!opened.isFile() || !isSameFile(before, opened)) {
        return { state: 'unsafe-path', reason: 'file-changed-during-open' }
      }
      const bytes = readFileSync(fd)
      const after = lstatSync(filePath)
      if (!isSameFile(opened, after) || after.isSymbolicLink()) {
        return { state: 'unsafe-path', reason: 'file-changed-during-read' }
      }
      if (!pathWithin(realRoot, realpathSync.native(filePath))) {
        return { state: 'unsafe-path', reason: 'file-escaped-after-read' }
      }
      return { state: 'ready', bytes }
    } finally {
      closeSync(fd)
    }
  } catch (error) {
    return { state: 'unsafe-path', reason: error instanceof Error ? error.name : 'read-failed' }
  }
}

function parseDescriptionHeader(lines: readonly string[]): boolean {
  if (
    lines[0] !== '---'
    || lines[1] !== 'name: aops'
    || !lines[2]?.startsWith('description: ')
    || lines[3] !== '---'
    || lines[4] !== ''
  ) return false
  try {
    const description = JSON.parse(lines[2].slice('description: '.length)) as unknown
    return typeof description === 'string' && description.length > 0 && description.length <= 8_192
  } catch {
    return false
  }
}

const SETUP_AGENT_ASSETS_V1_BODY = Object.freeze([
  '# aops (pointer)',
  '',
  'This skill is a thin pointer to the single source of truth. The canonical content lives in the hosted skill mirror inside the active repo.',
  '',
  '**Canonical file:** `.aops/hosted/skills/aops.md` (cwd-relative; mirrored via `aops-cli sync pull --apply --hosted-project-slug aops --yes --json`).',
  '',
  '## When triggered',
  '',
  '1. Read `.aops/hosted/skills/aops.md` from the current working directory.',
  '2. If found, follow its instructions verbatim. The hosted file is canonical and may have been updated since this pointer was authored; do not duplicate or paraphrase its content here.',
  '3. If missing, bootstrap the mirror with the `sync pull` command above. If the active repo is out of context for this skill, say that briefly and stop.',
  '',
])

const WORKSPACE_POINTER_V2_PREFIX = Object.freeze([
  '# aops (pointer)',
  '',
  'This skill is a thin pointer to the single source of truth. The canonical content lives in the hosted skill mirror inside the active repo.',
  '',
  '**Canonical file:** `.aops/hosted/skills/aops.md` (cwd-relative; hosted project slug: `aops`).',
  '',
  'Known repo candidates from the last global sync:',
  '',
])

const WORKSPACE_POINTER_V2_SUFFIX = Object.freeze([
  '',
  '## When triggered',
  '',
  '1. First read `.aops/hosted/skills/aops.md` from the current working directory.',
  '2. If found, follow that file verbatim. It may have changed since this pointer was authored; do not duplicate or paraphrase it here.',
  '3. If the cwd-relative file is missing, read the first existing known repo candidate above that matches this skill.',
  '4. If every candidate is missing or stale, refresh hosted mirrors from the relevant repo with `aops-cli sync pull --apply --hosted-project-slug aops --json`, then rerun the pointer sync.',
  '5. If the active repo is not one of the known candidates and no source file exists, say the skill does not apply in this cwd and stop.',
  '',
])

function exactLines(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((line, index) => line === expected[index])
}

function validLegacyCandidateLine(line: string, expectedIndex: number): boolean {
  const match = line.match(/^([1-9]\d*)\. `([^`\r\n]+)` \((hosted|repo-local); project: aops\)$/)
  if (!match || Number.parseInt(match[1], 10) !== expectedIndex) return false
  const candidatePath = match[2]
  if (!path.win32.isAbsolute(candidatePath) && !path.posix.isAbsolute(candidatePath)) return false
  const normalized = candidatePath.replaceAll('\\', '/')
  return match[3] === 'hosted'
    ? normalized.endsWith('/.aops/hosted/skills/aops.md')
    : normalized.endsWith('/skills/aops/SKILL.md')
}

/** Frozen parser for the two retired, generated `aops` skill-pointer templates. */
export function parseRecognizedLegacyAopsPointer(bytes: Uint8Array): ParsedLegacyPointer | null {
  const buffer = Buffer.from(bytes)
  if (buffer.byteLength < 1 || buffer.byteLength > MAX_LEGACY_POINTER_BYTES) return null
  const text = buffer.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(buffer) || text.includes('\0') || /\r(?!\n)/.test(text)) return null
  const normalized = text.replaceAll('\r\n', '\n')
  if (!normalized.endsWith('\n') || normalized.endsWith('\n\n')) return null
  const lines = normalized.split('\n')
  if (!parseDescriptionHeader(lines)) return null
  const body = lines.slice(5)
  if (exactLines(body, SETUP_AGENT_ASSETS_V1_BODY)) {
    return Object.freeze({ template: 'setup-agent-assets-v1', sha256: sha256(buffer), bytes: buffer })
  }
  if (!exactLines(body.slice(0, WORKSPACE_POINTER_V2_PREFIX.length), WORKSPACE_POINTER_V2_PREFIX)) return null
  const suffixStart = body.length - WORKSPACE_POINTER_V2_SUFFIX.length
  if (suffixStart <= WORKSPACE_POINTER_V2_PREFIX.length) return null
  if (!exactLines(body.slice(suffixStart), WORKSPACE_POINTER_V2_SUFFIX)) return null
  const candidates = body.slice(WORKSPACE_POINTER_V2_PREFIX.length, suffixStart)
  if (candidates.length < 1 || candidates.length > 16) return null
  if (!candidates.every((line, index) => validLegacyCandidateLine(line, index + 1))) return null
  return Object.freeze({ template: 'workspace-pointer-sync-v2', sha256: sha256(buffer), bytes: buffer })
}

function classifyRuntime(
  assetRoot: string,
  runtime: Runtime,
  runtimeHome: string,
  expectedRuntimeRootIdentitySha256?: string,
): LegacyPointerClassificationV1 {
  const binding = inspectRuntimeGatewayBinding({
    assetRoot,
    runtime,
    runtimeHome,
    ...(expectedRuntimeRootIdentitySha256 ? { expectedRuntimeRootIdentitySha256 } : {}),
  })
  const read = safeReadBoundedFile(runtimeHome, AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH, MAX_LEGACY_POINTER_BYTES)
  const base = {
    schemaVersion: 1 as const,
    runtime,
    runtimeHomeId: agentAssetsRuntimeHomeId(runtime, runtimeHome),
    relativePath: AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH as typeof AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
    bindingState: binding.state,
  }
  if (read.state === 'unsafe-path') {
    return Object.freeze({
      ...base,
      state: 'unsafe-path' as const,
      eligible: false,
      reasons: Object.freeze([read.reason]),
    })
  }
  if (read.state === 'absent') {
    return Object.freeze({
      ...base,
      state: 'absent' as const,
      eligible: false,
      reasons: Object.freeze(['gateway-absent']),
    })
  }
  const contentSha256 = sha256(read.bytes)
  if (
    contentSha256 === AOPS_AGENT_ASSETS_GATEWAY_SHA256
    && read.bytes.equals(Buffer.from(AOPS_AGENT_ASSETS_GATEWAY, 'utf8'))
  ) {
    const managedReady = binding.state === 'ready'
    return Object.freeze({
      ...base,
      state: managedReady ? 'managed-ready' as const : 'ownership-conflict' as const,
      eligible: false,
      contentSha256,
      reasons: Object.freeze(managedReady ? [] : ['canonical-gateway-without-ready-binding']),
    })
  }
  const legacy = parseRecognizedLegacyAopsPointer(read.bytes)
  if (!legacy) {
    return Object.freeze({
      ...base,
      state: 'unknown-user-owned' as const,
      eligible: false,
      contentSha256,
      reasons: Object.freeze(['content-does-not-match-a-frozen-generated-template']),
    })
  }
  const eligible = (
    binding.storeBinding === 'absent'
    && binding.ownerMarker === 'absent'
  ) || (
    binding.storeBinding === 'ready'
    && (binding.ownerMarker === 'absent' || binding.ownerMarker === 'ready')
  )
  return Object.freeze({
    ...base,
    state: 'recognized-legacy' as const,
    eligible,
    contentSha256,
    legacyTemplate: legacy.template,
    reasons: Object.freeze(eligible ? [] : [...binding.reasons]),
  })
}

export function inspectLegacyAopsPointers(
  options: InspectLegacyPointersOptionsV1,
): readonly LegacyPointerClassificationV1[] {
  const classifications: LegacyPointerClassificationV1[] = []
  for (const runtime of ['codex', 'claude'] as const) {
    const selected = options.runtimeHomes[runtime]
    if (!selected) continue
    classifications.push(classifyRuntime(
      path.resolve(options.assetRoot),
      runtime,
      path.resolve(selected),
      options.expectedRuntimeRootIdentitySha256?.[runtime],
    ))
  }
  return Object.freeze(classifications)
}

function nearestExistingAnchor(assetRoot: string): string {
  let cursor = path.resolve(assetRoot)
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) throw migrationError('atomic_primitive_unavailable', 'No trusted bootstrap anchor exists.')
    cursor = parent
  }
  const stat = lstatSync(cursor)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw migrationError('link_unsafe_path', 'The nearest bootstrap anchor is not a real directory.')
  }
  return realpathSync.native(cursor)
}

function publicationCapability(capability: AgentAssetsNativeCapabilityV1): PublicationCapabilityV1 {
  switch (capability.capabilityClass) {
    case 'linux-posix-durable-v1': return 'posix-durable-v1'
    case 'macos-exclusive-durable-v1': return 'macos-durable-v1'
    case 'windows-ntfs-crash-recoverable-v1': return 'windows-ntfs-crash-recoverable-v1'
  }
}

function assertAuthorityMatchesCapability(
  authority: StoreAuthorityV1,
  capability: AgentAssetsNativeCapabilityV1,
): void {
  if (authority.boundMachineId !== capability.machineIdentitySha256) {
    throw migrationError('different_machine_store', 'The agent-assets store is bound to another machine.')
  }
  if (authority.rootIdentitySha256 !== capability.rootIdentitySha256) {
    throw migrationError('store_identity_mismatch', 'The agent-assets store root identity changed.')
  }
  if (
    authority.publicationCapability !== publicationCapability(capability)
    || authority.capabilityEvidenceSha256 !== capability.capabilityEvidenceSha256
  ) {
    throw migrationError('durability_unavailable', 'The native publication capability does not match store authority.')
  }
}

async function ensureDirectory(
  root: string,
  relativePath: string,
  create: (relativePath: string) => Promise<void>,
): Promise<void> {
  let cursor = path.resolve(root)
  let current = ''
  for (const segment of relativePath.split('/')) {
    current = current ? `${current}/${segment}` : segment
    cursor = path.join(cursor, segment)
    if (!existsSync(cursor)) {
      await create(current)
      continue
    }
    const stat = lstatSync(cursor)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw migrationError('link_unsafe_path', 'A migration directory is not a plain directory.', { relativePath: current })
    }
  }
}

function requireSafeFile(root: string, relativePath: string, maximumBytes = MAX_MANAGED_STATE_BYTES): Buffer {
  const read = safeReadBoundedFile(root, relativePath, maximumBytes)
  if (read.state === 'ready') return read.bytes
  if (read.state === 'unsafe-path') {
    throw migrationError('link_unsafe_path', 'A managed migration file is unsafe.', { relativePath, reason: read.reason })
  }
  throw migrationError('not_found', 'A managed migration file is missing.', { relativePath })
}

async function publishNoReplaceOrVerify(
  publish: (relativePath: string, content: Uint8Array) => Promise<void>,
  root: string,
  relativePath: string,
  content: Uint8Array,
): Promise<void> {
  try {
    await publish(relativePath, content)
  } catch (error) {
    if (!(error instanceof AgentAssetsError) || error.code !== 'publication_conflict') throw error
    if (!requireSafeFile(root, relativePath).equals(Buffer.from(content))) throw error
  }
}

async function issueWriterFence(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  authority: StoreAuthorityV1,
  now: string,
): Promise<StoreAuthorityV1> {
  await ensureDirectory(assetRoot, 'state/authorities', (relativePath) => session.createDirectory(relativePath))
  const authorityBytes = jsonBytes(authority)
  const authoritySha256 = canonicalJsonSha256V1(authority)
  await publishNoReplaceOrVerify(
    (relativePath, content) => session.publishFileNoReplace(relativePath, content),
    assetRoot,
    `state/authorities/${authority.authorityRevision}-${authoritySha256}.json`,
    authorityBytes,
  )
  const next: StoreAuthorityV1 = {
    ...authority,
    authorityRevision: authority.authorityRevision + 1,
    lastIssuedFenceEpoch: authority.lastIssuedFenceEpoch + 1,
    previousAuthoritySha256: authoritySha256,
    updatedAt: now,
  }
  const current = requireSafeFile(assetRoot, 'state/store-authority.json')
  await session.publishFileReplace('state/store-authority.json', sha256(current), jsonBytes(next))
  return next
}

function markerFor(binding: RuntimeBindingV1 | RuntimeBindingReceiptV1): RuntimeGatewayOwnerMarkerV1 {
  return {
    schemaVersion: 1,
    owner: 'aops-cli-agent-assets',
    storeId: binding.storeId,
    runtime: binding.runtime,
    bindingId: binding.bindingId,
    bindingGeneration: binding.bindingGeneration,
    relativePath: binding.relativePath,
    contentSha256: binding.contentSha256,
  }
}

function readCurrentBinding(assetRoot: string, runtime: Runtime): RuntimeBindingV1 {
  try {
    return parseRuntimeBindingV1(JSON.parse(
      requireSafeFile(assetRoot, `state/bindings/${runtime}.json`).toString('utf8'),
    ) as unknown)
  } catch (error) {
    if (error instanceof AgentAssetsError) throw error
    throw migrationError('schema_incompatible', `${runtime} binding is not valid JSON.`)
  }
}

function assertRecoverableBinding(
  binding: RuntimeBindingV1,
  prepared: PreparedRuntime,
  storeId: string,
): void {
  if (
    !prepared.legacy
    || binding.storeId !== storeId
    || binding.runtime !== prepared.runtime
    || binding.runtimeHomeId !== agentAssetsRuntimeHomeId(prepared.runtime, prepared.runtimeHome)
    || binding.runtimeRootIdentitySha256 !== prepared.nativeRoot.rootIdentitySha256
    || binding.contentSha256 !== AOPS_AGENT_ASSETS_GATEWAY_SHA256
    || binding.previousContentSha256 !== prepared.legacy.sha256
  ) {
    throw migrationError('binding_conflict', `${prepared.runtime} has an unrelated managed binding.`, {
      runtime: prepared.runtime,
    })
  }
}

function assertMarkerMatches(binding: RuntimeBindingV1, marker: RuntimeGatewayOwnerMarkerV1): void {
  if (canonicalJsonV1(markerFor(binding)) !== canonicalJsonV1(marker)) {
    throw migrationError('binding_conflict', `${binding.runtime} ownership marker belongs to another binding.`)
  }
}

async function publishMarker(
  prepared: PreparedRuntime,
  binding: RuntimeBindingV1,
): Promise<void> {
  const marker = markerFor(binding)
  const read = safeReadBoundedFile(prepared.runtimeHome, OWNER_MARKER_RELATIVE_PATH, MAX_LEGACY_POINTER_BYTES)
  if (read.state === 'unsafe-path') {
    throw migrationError('link_unsafe_path', `${prepared.runtime} ownership marker path is unsafe.`)
  }
  if (read.state === 'ready') {
    try {
      assertMarkerMatches(binding, parseRuntimeGatewayOwnerMarkerV1(JSON.parse(read.bytes.toString('utf8')) as unknown))
      return
    } catch (error) {
      if (error instanceof AgentAssetsError) throw error
      throw migrationError('binding_conflict', `${prepared.runtime} ownership marker is not recognized.`)
    }
  }
  await prepared.nativeRoot.publishFileNoReplace(OWNER_MARKER_RELATIVE_PATH, jsonBytes(marker))
}

async function createBinding(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  prepared: PreparedRuntime,
  authority: StoreAuthorityV1,
  active: ActivePointerV1,
  now: string,
  randomId: () => string,
): Promise<RuntimeBindingV1> {
  if (!prepared.legacy) throw migrationError('schema_incompatible', 'Legacy pointer bytes are required for migration.')
  const bindingGeneration = 1
  const bindingId = `binding-${prepared.runtime}-legacy-${randomId()}`
  const bindingReceiptId = `binding-receipt-${prepared.runtime}-${bindingGeneration}-${authority.lastIssuedFenceEpoch}-${randomId()}`
  const draft: Omit<RuntimeBindingReceiptV1, 'ownerMarkerSha256'> = {
    schemaVersion: 1,
    storeId: authority.storeId,
    bindingId,
    bindingGeneration,
    runtime: prepared.runtime,
    runtimeHomeId: agentAssetsRuntimeHomeId(prepared.runtime, prepared.runtimeHome),
    runtimeRootIdentitySha256: prepared.nativeRoot.rootIdentitySha256,
    gatewayName: 'aops',
    relativePath: AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
    ownerMarkerRelativePath: OWNER_MARKER_RELATIVE_PATH,
    contentSha256: AOPS_AGENT_ASSETS_GATEWAY_SHA256,
    activationReceiptId: active.receiptId,
    activationReceiptSha256: active.receiptSha256,
    bindingReceiptId,
    previousContentSha256: prepared.legacy.sha256,
    installedAt: now,
    writerFenceEpoch: authority.lastIssuedFenceEpoch,
    authorityRevision: authority.authorityRevision,
  }
  const marker = markerFor(draft as RuntimeBindingReceiptV1)
  const receipt: RuntimeBindingReceiptV1 = {
    ...draft,
    ownerMarkerSha256: canonicalJsonSha256V1(marker),
  }
  const binding: RuntimeBindingV1 = {
    ...receipt,
    bindingReceiptSha256: canonicalJsonSha256V1(receipt),
  }
  await ensureDirectory(assetRoot, `state/bindings/receipts/${prepared.runtime}`, (relativePath) => (
    session.createDirectory(relativePath)
  ))
  await session.publishFileNoReplace(
    `state/bindings/receipts/${prepared.runtime}/${bindingGeneration}-${bindingReceiptId}.json`,
    jsonBytes(receipt),
  )
  await session.publishFileNoReplace(`state/bindings/${prepared.runtime}.json`, jsonBytes(binding))
  return binding
}

async function prepareRuntimes(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  runtimeHomes: Readonly<Partial<Record<Runtime, string>>>,
): Promise<readonly PreparedRuntime[]> {
  const prepared: PreparedRuntime[] = []
  for (const runtime of ['codex', 'claude'] as const) {
    const selected = runtimeHomes[runtime]
    if (!selected) continue
    const runtimeHome = path.resolve(selected)
    const nativeRoot = await session.registerRuntimeRoot(runtimeHome)
    const classification = classifyRuntime(assetRoot, runtime, runtimeHome, nativeRoot.rootIdentitySha256)
    const gateway = safeReadBoundedFile(runtimeHome, AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH, MAX_LEGACY_POINTER_BYTES)
    const legacy = gateway.state === 'ready' ? parseRecognizedLegacyAopsPointer(gateway.bytes) : null
    prepared.push(Object.freeze({
      runtime,
      runtimeHome,
      nativeRoot,
      classification,
      ...(legacy ? { legacy } : {}),
    }))
  }
  return Object.freeze(prepared)
}

export async function migrateLegacyAopsPointers(
  options: MigrateLegacyPointersOptionsV1,
): Promise<MigrateLegacyPointersResultV1> {
  const assetRoot = path.resolve(options.assetRoot)
  const openNative = options.openNative ?? openAgentAssetsNativePublicationSession
  const now = (options.now ?? (() => new Date()))().toISOString()
  const randomId = options.randomId ?? randomUUID
  const session = await openNative({
    agentAssetsRoot: assetRoot,
    bootstrapAnchor: options.bootstrapAnchor ?? nearestExistingAnchor(assetRoot),
    requiredDurability: 'process-crash',
  })
  try {
    const snapshot = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!snapshot?.active || !snapshot.receipt) {
      throw migrationError('not_found', 'Install the verified AOPS core before migrating legacy runtime pointers.')
    }
    assertAuthorityMatchesCapability(snapshot.authority, session.capability)
    const prepared = await prepareRuntimes(session, assetRoot, options.runtimeHomes)
    const conflicts = prepared.filter((item) => (
      item.classification.state !== 'recognized-legacy'
      && item.classification.state !== 'managed-ready'
      && item.classification.state !== 'absent'
    ) || (item.classification.state === 'recognized-legacy' && !item.classification.eligible))
    if (conflicts.length > 0) {
      throw migrationError('binding_conflict', 'Legacy pointer migration found an unknown or conflicting runtime file.', {
        runtimes: conflicts.map((item) => item.runtime),
        states: conflicts.map((item) => item.classification.state),
      })
    }
    const candidates = prepared.filter((item) => item.classification.state === 'recognized-legacy')
    if (candidates.length === 0) {
      return {
        idempotent: true,
        migrated: Object.freeze([]),
        unchanged: Object.freeze(prepared.map((item) => item.runtime)),
        authority: snapshot.authority,
        active: snapshot.active,
        receipt: snapshot.receipt,
        capability: session.capability,
        classifications: inspectLegacyAopsPointers({ assetRoot, runtimeHomes: options.runtimeHomes }),
      }
    }

    await ensureDirectory(assetRoot, 'state/bindings', (relativePath) => session.createDirectory(relativePath))
    let authority = snapshot.authority
    const requireNewBinding = candidates.some((item) => item.classification.bindingState === 'ownership-conflict'
      && inspectRuntimeGatewayBinding({
        assetRoot,
        runtime: item.runtime,
        runtimeHome: item.runtimeHome,
        expectedRuntimeRootIdentitySha256: item.nativeRoot.rootIdentitySha256,
      }).storeBinding === 'absent')
    if (requireNewBinding) authority = await issueWriterFence(session, assetRoot, authority, now)

    for (const preparedRuntime of candidates) {
      const inspection = inspectRuntimeGatewayBinding({
        assetRoot,
        runtime: preparedRuntime.runtime,
        runtimeHome: preparedRuntime.runtimeHome,
        expectedRuntimeRootIdentitySha256: preparedRuntime.nativeRoot.rootIdentitySha256,
      })
      let binding: RuntimeBindingV1
      if (inspection.storeBinding === 'ready') {
        binding = readCurrentBinding(assetRoot, preparedRuntime.runtime)
        assertRecoverableBinding(binding, preparedRuntime, authority.storeId)
      } else if (inspection.storeBinding === 'absent') {
        binding = await createBinding(
          session,
          assetRoot,
          preparedRuntime,
          authority,
          snapshot.active,
          now,
          randomId,
        )
      } else {
        throw migrationError('binding_conflict', `${preparedRuntime.runtime} store binding cannot be migrated safely.`)
      }
      await ensureDirectory(
        preparedRuntime.runtimeHome,
        'skills/aops',
        (relativePath) => preparedRuntime.nativeRoot.createDirectory(relativePath),
      )
      await publishMarker(preparedRuntime, binding)
      const currentGateway = requireSafeFile(
        preparedRuntime.runtimeHome,
        AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
        MAX_LEGACY_POINTER_BYTES,
      )
      const legacy = parseRecognizedLegacyAopsPointer(currentGateway)
      if (!legacy || legacy.sha256 !== binding.previousContentSha256) {
        throw migrationError('binding_conflict', `${preparedRuntime.runtime} pointer changed after migration preflight.`)
      }
      await preparedRuntime.nativeRoot.publishFileReplace(
        AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
        legacy.sha256,
        Buffer.from(AOPS_AGENT_ASSETS_GATEWAY, 'utf8'),
      )
      const after = inspectRuntimeGatewayBinding({
        assetRoot,
        runtime: preparedRuntime.runtime,
        runtimeHome: preparedRuntime.runtimeHome,
        expectedRuntimeRootIdentitySha256: preparedRuntime.nativeRoot.rootIdentitySha256,
      })
      if (after.state !== 'ready') {
        throw migrationError('atomic_replace_blocked', `${preparedRuntime.runtime} gateway did not become ready.`, {
          state: after.state,
          reasons: after.reasons,
        })
      }
    }

    const afterSnapshot = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!afterSnapshot?.active || !afterSnapshot.receipt) {
      throw migrationError('atomic_replace_blocked', 'Migration lost the active verified core chain.')
    }
    return {
      idempotent: false,
      migrated: Object.freeze(candidates.map((item) => item.runtime)),
      unchanged: Object.freeze(prepared
        .filter((item) => item.classification.state !== 'recognized-legacy')
        .map((item) => item.runtime)),
      authority: afterSnapshot.authority,
      active: afterSnapshot.active,
      receipt: afterSnapshot.receipt,
      capability: session.capability,
      classifications: inspectLegacyAopsPointers({ assetRoot, runtimeHomes: options.runtimeHomes }),
    }
  } finally {
    await session.close()
  }
}

function unlinkVerifiedPointerFile(
  root: string,
  relativePath: string,
  expectedSha256: string,
): void {
  const read = safeReadBoundedFile(root, relativePath, MAX_MANAGED_STATE_BYTES)
  if (read.state !== 'ready') {
    throw migrationError(
      read.state === 'unsafe-path' ? 'link_unsafe_path' : 'not_found',
      'A global AOPS gateway file changed after removal preflight.',
      { relativePath, state: read.state },
    )
  }
  if (sha256(read.bytes) !== expectedSha256) {
    throw migrationError('binding_conflict', 'A global AOPS gateway file changed after removal preflight.', {
      relativePath,
    })
  }
  unlinkSync(path.join(path.resolve(root), ...relativePath.split('/')))
}

/**
 * Removes only an exact recognized legacy pointer or a fully proven managed
 * gateway. The verified local core, immutable receipts, and managed binding
 * history are intentionally retained so an explicit repair can restore a
 * removed runtime pointer without reconstructing trust.
 */
export function removeAopsGatewayPointers(
  options: RemoveAopsGatewayPointersOptionsV1,
): RemoveAopsGatewayPointersResultV1 {
  const assetRoot = path.resolve(options.assetRoot)
  const before = inspectLegacyAopsPointers({ assetRoot, runtimeHomes: options.runtimeHomes })
  const conflicts = before.filter((item) => (
    item.state !== 'absent'
    && item.state !== 'recognized-legacy'
    && item.state !== 'managed-ready'
  ) || (item.state === 'recognized-legacy' && !item.eligible))
  if (conflicts.length > 0) {
    throw migrationError('binding_conflict', 'Gateway removal found an unknown, unsafe, or unowned runtime file.', {
      runtimes: conflicts.map((item) => item.runtime),
      states: conflicts.map((item) => item.state),
    })
  }

  const removed: Runtime[] = []
  const unchanged: Runtime[] = []
  const retainedManagedBindings: Runtime[] = []
  for (const classification of before) {
    if (classification.state === 'absent') {
      unchanged.push(classification.runtime)
      continue
    }
    const runtimeHome = options.runtimeHomes[classification.runtime]
    if (!runtimeHome || !classification.contentSha256) {
      throw migrationError('schema_incompatible', 'Gateway removal lost its selected runtime context.')
    }
    if (classification.state === 'managed-ready') {
      const binding = readCurrentBinding(assetRoot, classification.runtime)
      const marker = safeReadBoundedFile(runtimeHome, binding.ownerMarkerRelativePath, MAX_LEGACY_POINTER_BYTES)
      if (marker.state !== 'ready' || sha256(marker.bytes) !== binding.ownerMarkerSha256) {
        throw migrationError('binding_conflict', `${classification.runtime} ownership marker changed after preflight.`)
      }
      unlinkVerifiedPointerFile(runtimeHome, binding.relativePath, binding.contentSha256)
      unlinkVerifiedPointerFile(runtimeHome, binding.ownerMarkerRelativePath, binding.ownerMarkerSha256)
      retainedManagedBindings.push(classification.runtime)
    } else {
      unlinkVerifiedPointerFile(runtimeHome, classification.relativePath, classification.contentSha256)
    }
    removed.push(classification.runtime)
  }

  return Object.freeze({
    removed: Object.freeze(removed),
    unchanged: Object.freeze(unchanged),
    retainedManagedBindings: Object.freeze(retainedManagedBindings),
    classifications: inspectLegacyAopsPointers({ assetRoot, runtimeHomes: options.runtimeHomes }),
  })
}
