import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'

import { AgentAssetsError } from './envelope.js'
import {
  openAgentAssetsNativePublicationSession,
  type AgentAssetsNativeCapabilityV1,
  type AgentAssetsNativePublicationSession,
  type AgentAssetsNativeRuntimeRoot,
  type OpenAgentAssetsNativeSessionOptions,
} from './native-fs.js'
import type { VerifiedCommunityCoreReleaseInputV1 } from './release-input.js'
import type { PackageManifestV1, PackageTransferFileV1 } from './types.js'
import {
  agentAssetsRuntimeHomeId,
  inspectRuntimeGatewayBinding,
  parseRuntimeBindingV1,
  type RuntimeBindingInspectionV1,
} from './runtime-binding-reader.js'
import {
  AOPS_AGENT_ASSETS_GATEWAY,
  AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
  AOPS_AGENT_ASSETS_GATEWAY_SHA256,
} from './gateway.js'
import { validatePortablePackageV1 } from './package-manifest.js'
import {
  canonicalJsonSha256V1,
  canonicalJsonV1,
  parseExactVersionPinV1,
  parseMaintenanceReceiptV1,
  readAgentAssetsRollbackTarget,
  readAgentAssetsMaintenanceHead,
  readAgentAssetsPrunePlan,
  readAgentAssetsStagingCleanupPlan,
  readResolvedAgentAssetPackage,
  readAgentAssetsStoreStatus,
  readAgentAssetsStoreSnapshot,
  verifyAgentAssetsPackageAtRoot,
} from './store-reader.js'
import type {
  ActivationReceiptV1,
  ActivePointerV1,
  ExactVersionPinV1,
  MaintenancePointerV1,
  MaintenanceReceiptV1,
  PackageRefV1,
  PublicationCapabilityV1,
  RuntimeBindingReceiptV1,
  RuntimeBindingV1,
  RuntimeGatewayOwnerMarkerV1,
  StoreAuthorityV1,
} from './store-types.js'

const MAX_MANAGED_READ_BYTES = 1024 * 1024
const MAX_MANAGED_DIRECTORY_ENTRIES = 10_000
const SHA256_HEX = /^[a-f0-9]{64}$/
type Runtime = 'codex' | 'claude'

type PreparedRuntime = Readonly<{
  runtime: Runtime
  runtimeHome: string
  nativeRoot: AgentAssetsNativeRuntimeRoot
  inspection: RuntimeBindingInspectionV1
}>

export type ApplyCommunityCoreResultV1 = Readonly<{
  idempotent: boolean
  packageInstalled: boolean
  authority: StoreAuthorityV1
  active: ActivePointerV1
  receipt: ActivationReceiptV1
  capability: AgentAssetsNativeCapabilityV1
  bindings: Readonly<Partial<Record<Runtime, RuntimeBindingInspectionV1>>>
}>

export type ApplyCommunityCoreOptionsV1 = Readonly<{
  assetRoot: string
  release: VerifiedCommunityCoreReleaseInputV1
  requestedOperation: 'install' | 'update'
  idempotencyKey?: string
  runtimeHomes?: Readonly<Partial<Record<Runtime, string>>>
  bootstrapAnchor?: string
  now?: () => Date
  randomId?: () => string
  openNative?: (
    options: OpenAgentAssetsNativeSessionOptions,
  ) => Promise<AgentAssetsNativePublicationSession>
}>

export type RepairRuntimeBindingsResultV1 = Readonly<{
  idempotent: boolean
  authority: StoreAuthorityV1
  active: ActivePointerV1
  receipt: ActivationReceiptV1
  capability: AgentAssetsNativeCapabilityV1
  bindings: Readonly<Partial<Record<Runtime, RuntimeBindingInspectionV1>>>
}>

export type RepairRuntimeBindingsOptionsV1 = Readonly<{
  assetRoot: string
  runtimeHomes: Readonly<Partial<Record<Runtime, string>>>
  bootstrapAnchor?: string
  now?: () => Date
  randomId?: () => string
  openNative?: (
    options: OpenAgentAssetsNativeSessionOptions,
  ) => Promise<AgentAssetsNativePublicationSession>
}>

export type RollbackAgentAssetsOptionsV1 = Readonly<{
  assetRoot: string
  toReceiptId?: string
  idempotencyKey?: string
  bootstrapAnchor?: string
  now?: () => Date
  randomId?: () => string
  openNative?: (
    options: OpenAgentAssetsNativeSessionOptions,
  ) => Promise<AgentAssetsNativePublicationSession>
}>

export type RollbackAgentAssetsResultV1 = Readonly<{
  idempotent: boolean
  authority: StoreAuthorityV1
  active: ActivePointerV1
  receipt: ActivationReceiptV1
  rolledBackToReceiptId: string
}>

export type PinAgentAssetsOptionsV1 = Readonly<{
  assetRoot: string
  versionId: string
  leaseId: string
  expiresAt: string
  owner?: string
  bootstrapAnchor?: string
  now?: () => Date
  randomId?: () => string
  openNative?: (
    options: OpenAgentAssetsNativeSessionOptions,
  ) => Promise<AgentAssetsNativePublicationSession>
}>

export type PinAgentAssetsResultV1 = Readonly<{
  idempotent: boolean
  authority: StoreAuthorityV1
  pin: ExactVersionPinV1
  maintenanceReceipt: MaintenanceReceiptV1 | null
}>

export type PruneAgentAssetsOptionsV1 = Readonly<{
  assetRoot: string
  bootstrapAnchor?: string
  now?: () => Date
  randomId?: () => string
  openNative?: (
    options: OpenAgentAssetsNativeSessionOptions,
  ) => Promise<AgentAssetsNativePublicationSession>
}>

export type PruneAgentAssetsResultV1 = Readonly<{
  idempotent: boolean
  authority: StoreAuthorityV1
  protectedPackageSha256s: readonly string[]
  removedPackageSha256s: readonly string[]
  maintenanceReceipt: MaintenanceReceiptV1 | null
}>

export type CleanupAgentAssetsStagingOptionsV1 = Readonly<{
  assetRoot: string
  bootstrapAnchor?: string
  now?: () => Date
  openNative?: (
    options: OpenAgentAssetsNativeSessionOptions,
  ) => Promise<AgentAssetsNativePublicationSession>
}>

export type CleanupAgentAssetsStagingResultV1 = Readonly<{
  idempotent: boolean
  authority: StoreAuthorityV1
  active: ActivePointerV1 | null
  receipt: ActivationReceiptV1 | null
  capability: AgentAssetsNativeCapabilityV1 | null
  removedManagedPaths: readonly string[]
}>

export type ApplyHostedSkillPackageOptionsV1 = Readonly<{
  assetRoot: string
  manifest: PackageManifestV1
  transferFiles?: readonly PackageTransferFileV1[]
  bootstrapAnchor?: string
  now?: () => Date
  randomId?: () => string
  openNative?: (
    options: OpenAgentAssetsNativeSessionOptions,
  ) => Promise<AgentAssetsNativePublicationSession>
}>

export type ApplyHostedSkillPackageResultV1 = Readonly<{
  idempotent: boolean
  packageInstalled: boolean
  authority: StoreAuthorityV1
  active: ActivePointerV1
  receipt: ActivationReceiptV1
  packageRef: PackageRefV1
}>

function writerError(
  code: ConstructorParameters<typeof AgentAssetsError>[0],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AgentAssetsError {
  return new AgentAssetsError(code, message, {
    nextActions: ['Run `aops-cli assets status --verify full --json` before retrying the mutation.'],
    ...(details === undefined ? {} : { details }),
  })
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalJsonV1(value), 'utf8')
}

function publicationCapability(capability: AgentAssetsNativeCapabilityV1): PublicationCapabilityV1 {
  switch (capability.capabilityClass) {
    case 'linux-posix-durable-v1': return 'posix-durable-v1'
    case 'macos-exclusive-durable-v1': return 'macos-durable-v1'
    case 'windows-ntfs-crash-recoverable-v1': return 'windows-ntfs-crash-recoverable-v1'
  }
}

function operationIdentity(options: ApplyCommunityCoreOptionsV1): string {
  if (!options.idempotencyKey?.trim()) return (options.randomId ?? randomUUID)()
  const keyIdentity = operationKeyIdentity(options)
  const runtimeIntent = Object.entries(options.runtimeHomes ?? {})
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([runtime, runtimeHome]) => `${runtime}:${sha256(path.resolve(runtimeHome).toLowerCase())}`)
    .join(',')
  const intentIdentity = sha256(
    `aops-agent-assets-core-intent-v1\0${options.requestedOperation}\0${options.release.packageRef.packageSha256}\0${runtimeIntent}`,
  ).slice(0, 40)
  return `${keyIdentity}.${intentIdentity}`
}

function operationKeyIdentity(options: ApplyCommunityCoreOptionsV1): string | null {
  return options.idempotencyKey?.trim()
    ? sha256(`aops-agent-assets-core-key-v1\0${options.idempotencyKey.trim()}`).slice(0, 40)
    : null
}

function nearestExistingAnchor(assetRoot: string): string {
  let cursor = path.resolve(assetRoot)
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) throw writerError('atomic_primitive_unavailable', 'No trusted bootstrap anchor exists.')
    cursor = parent
  }
  const stat = lstatSync(cursor)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw writerError('link_unsafe_path', 'The nearest bootstrap anchor is not a real directory.')
  }
  return realpathSync.native(cursor)
}

function readManagedBytes(assetRoot: string, relativePath: string): Uint8Array {
  const root = path.resolve(assetRoot)
  const rootStat = lstatSync(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw writerError('link_unsafe_path', 'The opened agent-assets root is unsafe.')
  }
  const realRoot = realpathSync.native(root)
  const segments = relativePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
    throw writerError('invalid_package_path', 'Managed state read contains an unsafe path segment.')
  }
  let cursor = root
  for (const segment of segments) {
    cursor = path.join(cursor, segment)
    const stat = lstatSync(cursor)
    if (stat.isSymbolicLink()) throw writerError('link_unsafe_path', 'Managed state read traverses a link.')
  }
  const stat = lstatSync(cursor)
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_MANAGED_READ_BYTES) {
    throw writerError('schema_incompatible', 'Managed state read has an invalid file type or size.')
  }
  const realFile = realpathSync.native(cursor)
  const relative = path.relative(realRoot, realFile)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw writerError('link_unsafe_path', 'Managed state read escaped the store root.')
  }
  return readFileSync(cursor)
}

async function publishNoReplaceOrVerify(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  relativePath: string,
  content: Uint8Array,
): Promise<void> {
  try {
    await session.publishFileNoReplace(relativePath, content)
  } catch (error) {
    if (!(error instanceof AgentAssetsError) || error.code !== 'publication_conflict') throw error
    const existing = readManagedBytes(assetRoot, relativePath)
    if (!Buffer.from(existing).equals(Buffer.from(content))) throw error
  }
}

async function ensureStoreDirectories(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
): Promise<void> {
  for (const relativePath of [
    'core',
    'staging',
    'state',
    'state/authorities',
    'state/receipts',
    'state/maintenance-receipts',
    'state/pins',
    'state/bindings',
    'state/bindings/receipts',
  ]) {
    await ensureNativeDirectory(assetRoot, relativePath, (next) => session.createDirectory(next))
  }
}

async function ensureNativeDirectory(
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
      throw writerError('link_unsafe_path', 'Managed directory path is not a plain directory.', {
        relativePath: current,
      })
    }
  }
}

async function prepareRuntimeBindings(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  runtimeHomes: Readonly<Partial<Record<Runtime, string>>> | undefined,
  options: Readonly<{ repairManagedContent?: boolean }> = {},
): Promise<readonly PreparedRuntime[]> {
  const prepared: PreparedRuntime[] = []
  for (const runtime of ['codex', 'claude'] as const) {
    const selected = runtimeHomes?.[runtime]
    if (!selected) continue
    const runtimeHome = path.resolve(selected)
    const nativeRoot = await session.registerRuntimeRoot(runtimeHome)
    const inspection = inspectRuntimeGatewayBinding({
      assetRoot,
      runtime,
      runtimeHome,
      expectedRuntimeRootIdentitySha256: nativeRoot.rootIdentitySha256,
    })
    if (inspection.state === 'ownership-conflict' || inspection.state === 'unsafe-path') {
      throw writerError(
        inspection.state === 'unsafe-path' ? 'link_unsafe_path' : 'publication_conflict',
        `${runtime} gateway ownership could not be established safely.`,
        { runtime, state: inspection.state, reasons: inspection.reasons },
      )
    }
    const interruptedPublication = inspection.bindingProof === 'verified'
      && inspection.gateway === 'absent'
      && (inspection.ownerMarkerProof === 'absent' || inspection.ownerMarkerProof === 'verified')
    const explicitManagedRepair = options.repairManagedContent === true
      && inspection.bindingProof === 'verified'
      && (
        (inspection.ownerMarkerProof === 'verified'
          && (inspection.gateway === 'absent' || inspection.gateway === 'tampered'))
        || (inspection.ownerMarkerProof === 'absent'
          && (inspection.gateway === 'absent' || inspection.gateway === 'canonical'))
      )
    if (inspection.state === 'managed-drift' && !interruptedPublication && !explicitManagedRepair) {
      throw writerError('schema_incompatible', `${runtime} gateway has drift that install/update cannot adopt.`, {
        runtime,
        state: inspection.state,
        reasons: inspection.reasons,
      })
    }
    prepared.push(Object.freeze({ runtime, runtimeHome, nativeRoot, inspection }))
  }
  return Object.freeze(prepared)
}

function readCurrentRuntimeBinding(assetRoot: string, runtime: Runtime): RuntimeBindingV1 {
  const bytes = readManagedBytes(assetRoot, `state/bindings/${runtime}.json`)
  try {
    return parseRuntimeBindingV1(JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown)
  } catch (error) {
    if (error instanceof AgentAssetsError) throw error
    throw writerError('schema_incompatible', `${runtime} binding is not valid JSON.`, { runtime })
  }
}

function ownerMarker(binding: RuntimeBindingV1 | RuntimeBindingReceiptV1): RuntimeGatewayOwnerMarkerV1 {
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

async function completeRuntimeFiles(
  prepared: PreparedRuntime,
  binding: RuntimeBindingV1,
): Promise<void> {
  if (
    prepared.inspection.bindingProof !== 'verified'
    || binding.runtimeHomeId !== agentAssetsRuntimeHomeId(prepared.runtime, prepared.runtimeHome)
    || binding.runtimeRootIdentitySha256 !== prepared.nativeRoot.rootIdentitySha256
    || binding.contentSha256 !== AOPS_AGENT_ASSETS_GATEWAY_SHA256
  ) {
    throw writerError('store_identity_mismatch', `${prepared.runtime} binding does not match the qualified runtime root.`)
  }
  await ensureNativeDirectory(
    prepared.runtimeHome,
    'skills/aops',
    (relativePath) => prepared.nativeRoot.createDirectory(relativePath),
  )
  if (prepared.inspection.ownerMarker === 'absent') {
    await prepared.nativeRoot.publishFileNoReplace(
      'skills/aops/.aops-gateway-owner.json',
      jsonBytes(ownerMarker(binding)),
    )
  }
  if (prepared.inspection.gateway === 'absent') {
    await prepared.nativeRoot.publishFileNoReplace(
      AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
      Buffer.from(AOPS_AGENT_ASSETS_GATEWAY, 'utf8'),
    )
  }
  if (prepared.inspection.gateway === 'tampered') {
    if (
      prepared.inspection.ownerMarkerProof !== 'verified'
      || !prepared.inspection.gatewayContentSha256
    ) {
      throw writerError('binding_conflict', `${prepared.runtime} tampered gateway has no immutable ownership proof.`)
    }
    await prepared.nativeRoot.publishFileReplace(
      AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
      prepared.inspection.gatewayContentSha256,
      Buffer.from(AOPS_AGENT_ASSETS_GATEWAY, 'utf8'),
    )
  }
}

async function createRuntimeBinding(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  prepared: PreparedRuntime,
  authority: StoreAuthorityV1,
  active: ActivePointerV1,
  activation: ActivationReceiptV1,
  installedAt: string,
  randomId: () => string,
): Promise<void> {
  const bindingGeneration = 1
  const bindingId = `binding-${prepared.runtime}-${randomId()}`
  const bindingReceiptId = `binding-receipt-${prepared.runtime}-${bindingGeneration}-${authority.lastIssuedFenceEpoch}-${randomId()}`
  const marker: RuntimeGatewayOwnerMarkerV1 = {
    schemaVersion: 1,
    owner: 'aops-cli-agent-assets',
    storeId: authority.storeId,
    runtime: prepared.runtime,
    bindingId,
    bindingGeneration,
    relativePath: AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
    contentSha256: AOPS_AGENT_ASSETS_GATEWAY_SHA256,
  }
  const receipt: RuntimeBindingReceiptV1 = {
    schemaVersion: 1,
    storeId: authority.storeId,
    bindingId,
    bindingGeneration,
    runtime: prepared.runtime,
    runtimeHomeId: agentAssetsRuntimeHomeId(prepared.runtime, prepared.runtimeHome),
    runtimeRootIdentitySha256: prepared.nativeRoot.rootIdentitySha256,
    gatewayName: 'aops',
    relativePath: AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
    ownerMarkerRelativePath: 'skills/aops/.aops-gateway-owner.json',
    contentSha256: AOPS_AGENT_ASSETS_GATEWAY_SHA256,
    ownerMarkerSha256: canonicalJsonSha256V1(marker),
    activationReceiptId: activation.receiptId,
    activationReceiptSha256: active.receiptSha256,
    bindingReceiptId,
    installedAt,
    writerFenceEpoch: authority.lastIssuedFenceEpoch,
    authorityRevision: authority.authorityRevision,
  }
  const binding: RuntimeBindingV1 = {
    ...receipt,
    bindingReceiptSha256: canonicalJsonSha256V1(receipt),
  }
  await ensureNativeDirectory(
    assetRoot,
    `state/bindings/receipts/${prepared.runtime}`,
    (relativePath) => session.createDirectory(relativePath),
  )
  await session.publishFileNoReplace(
    `state/bindings/receipts/${prepared.runtime}/${bindingGeneration}-${bindingReceiptId}.json`,
    jsonBytes(receipt),
  )
  await session.publishFileNoReplace(`state/bindings/${prepared.runtime}.json`, jsonBytes(binding))
  await ensureNativeDirectory(
    prepared.runtimeHome,
    'skills/aops',
    (relativePath) => prepared.nativeRoot.createDirectory(relativePath),
  )
  await prepared.nativeRoot.publishFileNoReplace('skills/aops/.aops-gateway-owner.json', jsonBytes(marker))
  await prepared.nativeRoot.publishFileNoReplace(
    AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
    Buffer.from(AOPS_AGENT_ASSETS_GATEWAY, 'utf8'),
  )
}

function inspectPreparedBindings(
  assetRoot: string,
  prepared: readonly PreparedRuntime[],
): Readonly<Partial<Record<Runtime, RuntimeBindingInspectionV1>>> {
  const result: Partial<Record<Runtime, RuntimeBindingInspectionV1>> = {}
  for (const item of prepared) {
    result[item.runtime] = inspectRuntimeGatewayBinding({
      assetRoot,
      runtime: item.runtime,
      runtimeHome: item.runtimeHome,
      expectedRuntimeRootIdentitySha256: item.nativeRoot.rootIdentitySha256,
    })
  }
  return Object.freeze(result)
}

function assertAuthorityMatchesCapability(
  authority: StoreAuthorityV1,
  capability: AgentAssetsNativeCapabilityV1,
): void {
  if (authority.boundMachineId !== capability.machineIdentitySha256) {
    throw writerError('different_machine_store', 'The agent-assets store is bound to another machine.')
  }
  if (authority.rootIdentitySha256 !== capability.rootIdentitySha256) {
    throw writerError('store_identity_mismatch', 'The agent-assets root identity changed.')
  }
  if (
    authority.publicationCapability !== publicationCapability(capability)
    || authority.capabilityEvidenceSha256 !== capability.capabilityEvidenceSha256
  ) {
    throw writerError('durability_unavailable', 'The current native publication capability does not match store authority.')
  }
}

async function ensureGenesisAuthority(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  now: string,
  randomId: () => string,
): Promise<StoreAuthorityV1> {
  const existing = readAgentAssetsStoreSnapshot({
    assetRoot,
    expectedMachineId: session.capability.machineIdentitySha256,
    expectedRootIdentitySha256: session.capability.rootIdentitySha256,
  })
  if (existing) {
    assertAuthorityMatchesCapability(existing.authority, session.capability)
    return existing.authority
  }
  const authority: StoreAuthorityV1 = {
    schemaVersion: 1,
    storeId: `store-${randomId()}`,
    authorityRevision: 1,
    boundMachineId: session.capability.machineIdentitySha256,
    rootIdentitySha256: session.capability.rootIdentitySha256,
    publicationCapability: publicationCapability(session.capability),
    capabilityEvidenceSha256: session.capability.capabilityEvidenceSha256,
    lastIssuedFenceEpoch: 0,
    previousAuthoritySha256: null,
    createdAt: now,
    updatedAt: now,
  }
  await session.publishFileNoReplace('state/store-authority.json', jsonBytes(authority))
  return authority
}

async function materializePackage(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  operationId: string,
  packageInput: Readonly<{
    packageRef: PackageRefV1
    manifest: PackageManifestV1
    transferFiles: readonly PackageTransferFileV1[]
  }>,
): Promise<boolean> {
  try {
    verifyAgentAssetsPackageAtRoot({ assetRoot, packageRef: packageInput.packageRef, verify: 'full' })
    return false
  } catch (error) {
    if (!(error instanceof AgentAssetsError) || error.code !== 'not_found') throw error
  }

  const stage = `staging/${operationId}`
  await session.removeManagedTree(stage)
  await session.createDirectory(stage)
  await session.createDirectory(`${stage}/files`)
  for (const file of packageInput.transferFiles) {
    const parent = path.posix.dirname(file.path)
    if (parent !== '.') {
      await ensureNativeDirectory(
        assetRoot,
        `${stage}/files/${parent}`,
        (relativePath) => session.createDirectory(relativePath),
      )
    }
    await session.publishFileNoReplace(`${stage}/files/${file.path}`, file.bytes)
  }
  await session.publishFileNoReplace(`${stage}/manifest.json`, jsonBytes(packageInput.manifest))
  try {
    await session.promoteDirectoryNoReplace(stage, `core/${packageInput.packageRef.packageSha256}`)
  } catch (error) {
    if (!(error instanceof AgentAssetsError) || error.code !== 'publication_conflict') throw error
    verifyAgentAssetsPackageAtRoot({ assetRoot, packageRef: packageInput.packageRef, verify: 'full' })
    await session.removeManagedTree(stage)
    return false
  }
  verifyAgentAssetsPackageAtRoot({ assetRoot, packageRef: packageInput.packageRef, verify: 'full' })
  return true
}

async function issueWriterFence(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  authority: StoreAuthorityV1,
  now: string,
): Promise<StoreAuthorityV1> {
  const authorityBytes = jsonBytes(authority)
  const authoritySha256 = canonicalJsonSha256V1(authority)
  await publishNoReplaceOrVerify(
    session,
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
  const rawCurrentSha256 = sha256(readManagedBytes(assetRoot, 'state/store-authority.json'))
  await session.publishFileReplace('state/store-authority.json', rawCurrentSha256, jsonBytes(next))
  return next
}

export async function applyVerifiedCommunityCore(
  options: ApplyCommunityCoreOptionsV1,
): Promise<ApplyCommunityCoreResultV1> {
  const assetRoot = path.resolve(options.assetRoot)
  const preflight = readAgentAssetsStoreSnapshot({ assetRoot })
  if (options.requestedOperation === 'update' && !preflight?.active) {
    throw writerError('not_found', 'No active core exists; use `assets install` for the first activation.')
  }
  if (
    options.requestedOperation === 'install'
    && preflight?.active
    && preflight.receipt.core.packageSha256 !== options.release.packageRef.packageSha256
  ) {
    throw writerError('publication_conflict', 'A different core is already installed; use `assets update` for a new release.')
  }
  const nowFactory = options.now ?? (() => new Date())
  const randomId = options.randomId ?? randomUUID
  const operationId = operationIdentity(options)
  const openNative = options.openNative ?? openAgentAssetsNativePublicationSession
  const session = await openNative({
    agentAssetsRoot: assetRoot,
    bootstrapAnchor: options.bootstrapAnchor ?? nearestExistingAnchor(assetRoot),
    requiredDurability: 'process-crash',
  })
  try {
    await ensureStoreDirectories(session, assetRoot)
    const preparedBindings = await prepareRuntimeBindings(
      session,
      assetRoot,
      options.runtimeHomes,
    )
    const now = nowFactory().toISOString()
    let authority = await ensureGenesisAuthority(session, assetRoot, now, randomId)
    const before = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!before) throw writerError('schema_incompatible', 'Store authority publication was not observable.')
    const keyIdentity = operationKeyIdentity(options)
    if (
      keyIdentity
      && before.receipt?.operationId.startsWith(`${keyIdentity}.`)
      && before.receipt.operationId !== operationId
    ) {
      throw writerError('publication_conflict', 'The install/update idempotency key is already bound to another release or target intent.')
    }
    const coreAlreadyActive = before.active !== null
      && before.receipt.core.packageSha256 === options.release.packageRef.packageSha256
    if (options.requestedOperation === 'install' && before.active !== null && !coreAlreadyActive) {
      throw writerError('publication_conflict', 'A different core is already installed; use `assets update` for a new release.')
    }
    if (options.requestedOperation === 'update' && before.active === null) {
      throw writerError('not_found', 'No active core exists; use `assets install` for the first activation.')
    }
    if (coreAlreadyActive) {
      verifyAgentAssetsPackageAtRoot({ assetRoot, packageRef: options.release.packageRef, verify: 'full' })
    }
    const newBindings = preparedBindings.filter((item) => item.inspection.state === 'absent')
    const recoverableBindings = preparedBindings.filter((item) => item.inspection.state === 'managed-drift')
    if (coreAlreadyActive && newBindings.length === 0 && recoverableBindings.length === 0) {
      return {
        idempotent: true,
        packageInstalled: false,
        authority: before.authority,
        active: before.active,
        receipt: before.receipt,
        capability: session.capability,
        bindings: inspectPreparedBindings(assetRoot, preparedBindings),
      }
    }

    const packageInstalled = coreAlreadyActive
      ? false
      : await materializePackage(session, assetRoot, operationId, options.release)
    if (!coreAlreadyActive || newBindings.length > 0) {
      authority = await issueWriterFence(session, assetRoot, authority, now)
    }

    let active = before.active
    let receipt = before.receipt
    if (!coreAlreadyActive) {
      const generation = (before.active?.generation ?? 0) + 1
      const receiptId = `receipt-${generation}-${authority.lastIssuedFenceEpoch}-${randomId()}`
      receipt = {
        schemaVersion: 1,
        storeId: authority.storeId,
        receiptId,
        operationId,
        operation: before.active === null ? 'install' : 'update',
        generation,
        createdAt: now,
        writerFenceEpoch: authority.lastIssuedFenceEpoch,
        authorityRevision: authority.authorityRevision,
        previousReceiptId: before.receipt?.receiptId ?? null,
        previousReceiptSha256: before.receipt === null ? null : canonicalJsonSha256V1(before.receipt),
        core: options.release.packageRef,
        assets: before.receipt?.assets ?? [],
      }
      const receiptSha256 = canonicalJsonSha256V1(receipt)
      await session.publishFileNoReplace(
        `state/receipts/${generation}-${receiptId}.json`,
        jsonBytes(receipt),
      )
      active = {
        schemaVersion: 1,
        storeId: authority.storeId,
        generation,
        receiptId,
        receiptSha256,
        writerFenceEpoch: authority.lastIssuedFenceEpoch,
        authorityRevision: authority.authorityRevision,
        updatedAt: now,
      }
      if (before.active === null) {
        await session.publishFileNoReplace('state/active.json', jsonBytes(active))
      } else {
        const priorActiveSha256 = sha256(readManagedBytes(assetRoot, 'state/active.json'))
        await session.publishFileReplace('state/active.json', priorActiveSha256, jsonBytes(active))
      }
    }
    if (!active || !receipt) throw writerError('schema_incompatible', 'Runtime binding requires an active core receipt.')

    for (const prepared of recoverableBindings) {
      await completeRuntimeFiles(prepared, readCurrentRuntimeBinding(assetRoot, prepared.runtime))
    }
    for (const prepared of newBindings) {
      await createRuntimeBinding(session, assetRoot, prepared, authority, active, receipt, now, randomId)
    }

    const after = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!after?.active || after.active.receiptSha256 !== active.receiptSha256) {
      throw writerError('atomic_replace_blocked', 'Activation pointer did not publish the exact receipt.')
    }
    const bindings = inspectPreparedBindings(assetRoot, preparedBindings)
    for (const [runtime, binding] of Object.entries(bindings)) {
      if (binding?.state !== 'ready') {
        throw writerError('atomic_replace_blocked', `${runtime} gateway binding did not become ready.`, {
          runtime,
          state: binding?.state,
          reasons: binding?.reasons,
        })
      }
    }
    return {
      idempotent: false,
      packageInstalled,
      authority: after.authority,
      active: after.active,
      receipt: after.receipt,
      capability: session.capability,
      bindings,
    }
  } finally {
    await session.close()
  }
}

export async function applyVerifiedHostedSkillPackage(
  options: ApplyHostedSkillPackageOptionsV1,
): Promise<ApplyHostedSkillPackageResultV1> {
  if (
    options.manifest.assetKind !== 'skill-package'
    || options.manifest.provenance.trustClass !== 'verified-hosted-package'
    || options.manifest.provenance.expectedDigestSource !== 'immutable-hosted-metadata'
  ) {
    throw writerError('untrusted_origin', 'Hosted activation requires an immutable verified skill-package manifest.')
  }
  if (options.transferFiles) {
    const validation = validatePortablePackageV1(options.manifest, options.transferFiles)
    if (!validation.ok) {
      throw writerError('hash_mismatch', 'Hosted package bytes failed portable validation before staging.', {
        issues: validation.issues,
      })
    }
  }
  const packageRef: PackageRefV1 = {
    name: options.manifest.name,
    version: options.manifest.version,
    versionId: options.manifest.versionId,
    packageSha256: options.manifest.packageSha256,
    entryFile: options.manifest.entryFile,
    origin: 'hosted-cache',
    trustClass: 'verified-hosted-package',
  }
  const assetRoot = path.resolve(options.assetRoot)
  const now = (options.now ?? (() => new Date()))().toISOString()
  const randomId = options.randomId ?? randomUUID
  const openNative = options.openNative ?? openAgentAssetsNativePublicationSession
  const session = await openNative({
    agentAssetsRoot: assetRoot,
    bootstrapAnchor: options.bootstrapAnchor ?? nearestExistingAnchor(assetRoot),
    requiredDurability: 'process-crash',
  })
  try {
    await ensureStoreDirectories(session, assetRoot)
    let before = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!before?.active || !before.receipt) {
      throw writerError('not_found', 'Install the signed Community core before activating hosted skills.')
    }
    assertAuthorityMatchesCapability(before.authority, session.capability)
    const activeExact = before.receipt.assets.some((entry) => entry.packageSha256 === packageRef.packageSha256)
    if (activeExact) {
      verifyAgentAssetsPackageAtRoot({ assetRoot, packageRef, verify: 'full' })
      return {
        idempotent: true,
        packageInstalled: false,
        authority: before.authority,
        active: before.active,
        receipt: before.receipt,
        packageRef,
      }
    }
    const operationId = sha256(
      `aops-agent-assets-hosted-package-v1\0${packageRef.packageSha256}\0${randomId()}`,
    ).slice(0, 40)
    let packageInstalled = false
    try {
      verifyAgentAssetsPackageAtRoot({ assetRoot, packageRef, verify: 'full' })
    } catch (error) {
      if (!(error instanceof AgentAssetsError) || error.code !== 'not_found') throw error
      if (!options.transferFiles) {
        throw writerError('not_found', 'Exact hosted package bytes are not present in the verified local store.')
      }
      packageInstalled = await materializePackage(session, assetRoot, operationId, {
        packageRef,
        manifest: options.manifest,
        transferFiles: options.transferFiles,
      })
    }
    let authority = await issueWriterFence(session, assetRoot, before.authority, now)
    before = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!before?.active || !before.receipt) throw writerError('not_found', 'The active core disappeared during hosted activation.')
    authority = before.authority
    const assets = [
      ...before.receipt.assets.filter((entry) => entry.name !== packageRef.name),
      packageRef,
    ].sort((left, right) => {
      return left.name.localeCompare(right.name, 'en')
        || left.versionId.localeCompare(right.versionId, 'en')
        || left.packageSha256.localeCompare(right.packageSha256, 'en')
    })
    const generation = before.active.generation + 1
    const receiptId = `receipt-${generation}-${authority.lastIssuedFenceEpoch}-${randomId()}`
    const receipt: ActivationReceiptV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      receiptId,
      operationId,
      operation: 'update',
      generation,
      createdAt: now,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
      previousReceiptId: before.receipt.receiptId,
      previousReceiptSha256: canonicalJsonSha256V1(before.receipt),
      core: before.receipt.core,
      assets,
    }
    const receiptSha256 = canonicalJsonSha256V1(receipt)
    await session.publishFileNoReplace(`state/receipts/${generation}-${receiptId}.json`, jsonBytes(receipt))
    const active: ActivePointerV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      generation,
      receiptId,
      receiptSha256,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
      updatedAt: now,
    }
    await session.publishFileReplace(
      'state/active.json',
      sha256(readManagedBytes(assetRoot, 'state/active.json')),
      jsonBytes(active),
    )
    const after = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!after?.active || after.active.receiptSha256 !== receiptSha256) {
      throw writerError('atomic_replace_blocked', 'Hosted package activation did not publish the exact receipt.')
    }
    verifyAgentAssetsPackageAtRoot({ assetRoot, packageRef, verify: 'full' })
    return {
      idempotent: false,
      packageInstalled,
      authority: after.authority,
      active: after.active,
      receipt: after.receipt,
      packageRef,
    }
  } finally {
    await session.close()
  }
}

export async function repairAgentAssetRuntimeBindings(
  options: RepairRuntimeBindingsOptionsV1,
): Promise<RepairRuntimeBindingsResultV1> {
  const assetRoot = path.resolve(options.assetRoot)
  if (!readAgentAssetsStoreSnapshot({ assetRoot })) {
    throw writerError('not_found', 'Agent assets are not installed; repair cannot synthesize core trust.')
  }
  const now = (options.now ?? (() => new Date()))().toISOString()
  const randomId = options.randomId ?? randomUUID
  const openNative = options.openNative ?? openAgentAssetsNativePublicationSession
  const session = await openNative({
    agentAssetsRoot: assetRoot,
    bootstrapAnchor: options.bootstrapAnchor ?? nearestExistingAnchor(assetRoot),
    requiredDurability: 'process-crash',
  })
  try {
    await ensureStoreDirectories(session, assetRoot)
    const prepared = await prepareRuntimeBindings(session, assetRoot, options.runtimeHomes, {
      repairManagedContent: true,
    })
    const before = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!before?.active || !before.receipt) {
      throw writerError('not_found', 'Agent assets have no active verified core to repair.')
    }
    const recoverable = prepared.filter((item) => item.inspection.state === 'managed-drift')
    const missing = prepared.filter((item) => item.inspection.state === 'absent')
    if (recoverable.length === 0 && missing.length === 0) {
      return {
        idempotent: true,
        authority: before.authority,
        active: before.active,
        receipt: before.receipt,
        capability: session.capability,
        bindings: inspectPreparedBindings(assetRoot, prepared),
      }
    }
    let authority = before.authority
    if (missing.length > 0) authority = await issueWriterFence(session, assetRoot, authority, now)
    for (const item of recoverable) {
      await completeRuntimeFiles(item, readCurrentRuntimeBinding(assetRoot, item.runtime))
    }
    for (const item of missing) {
      await createRuntimeBinding(
        session,
        assetRoot,
        item,
        authority,
        before.active,
        before.receipt,
        now,
        randomId,
      )
    }
    const after = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!after?.active || !after.receipt) {
      throw writerError('atomic_replace_blocked', 'Runtime repair lost the active core chain.')
    }
    const bindings = inspectPreparedBindings(assetRoot, prepared)
    for (const [runtime, binding] of Object.entries(bindings)) {
      if (binding?.state !== 'ready') {
        throw writerError('atomic_replace_blocked', `${runtime} gateway repair did not become ready.`, {
          runtime,
          state: binding?.state,
          reasons: binding?.reasons,
        })
      }
    }
    return {
      idempotent: false,
      authority: after.authority,
      active: after.active,
      receipt: after.receipt,
      capability: session.capability,
      bindings,
    }
  } finally {
    await session.close()
  }
}

function pinFileName(leaseId: string): string {
  return `${sha256(`aops-agent-assets-pin-v1\0${leaseId}`)}.json`
}

function maintenanceReceiptFileName(receiptId: string): string {
  return `${sha256(`aops-agent-assets-maintenance-receipt-v1\0${receiptId}`)}.json`
}

type RecoverablePruneReceiptV1 = Readonly<{
  receipt: MaintenanceReceiptV1
  receiptSha256: string
  priorMaintenance: ReturnType<typeof readAgentAssetsMaintenanceHead>
}>

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function strictMaintenanceReceiptEntries(assetRoot: string): readonly MaintenanceReceiptV1[] {
  const root = path.resolve(assetRoot)
  const rootStat = lstatSync(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw writerError('link_unsafe_path', 'The opened agent-assets root is unsafe.')
  }
  const realRoot = realpathSync.native(root)
  let directory = root
  for (const segment of ['state', 'maintenance-receipts']) {
    directory = path.join(directory, segment)
    const stat = lstatSync(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw writerError('link_unsafe_path', 'The managed maintenance receipt directory is unsafe.')
    }
  }
  const realDirectory = realpathSync.native(directory)
  const relativeDirectory = path.relative(realRoot, realDirectory)
  if (relativeDirectory.startsWith('..') || path.isAbsolute(relativeDirectory)) {
    throw writerError('link_unsafe_path', 'The managed maintenance receipt directory escaped the store root.')
  }
  const entries = readdirSync(directory).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
  if (entries.length > MAX_MANAGED_DIRECTORY_ENTRIES) {
    throw writerError('schema_incompatible', 'The managed maintenance receipt directory exceeds the bounded entry count.')
  }
  const receipts: MaintenanceReceiptV1[] = []
  for (const name of entries) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) {
      throw writerError('schema_incompatible', 'Unknown entry exists in the managed maintenance receipt directory.', {
        name,
      })
    }
    let value: unknown
    try {
      value = JSON.parse(Buffer.from(readManagedBytes(assetRoot, `state/maintenance-receipts/${name}`)).toString('utf8'))
    } catch (error) {
      if (error instanceof AgentAssetsError) throw error
      throw writerError('schema_incompatible', 'A maintenance receipt is not valid JSON.', { name })
    }
    const receipt = parseMaintenanceReceiptV1(value)
    if (name !== maintenanceReceiptFileName(receipt.receiptId)) {
      throw writerError('hash_mismatch', 'A maintenance receipt is stored under the wrong immutable identity.', {
        name,
        receiptId: receipt.receiptId,
      })
    }
    receipts.push(receipt)
  }
  return receipts
}

/**
 * Finds the only recoverable receipt beyond the authenticated maintenance
 * head. Historical receipts must form exactly one complete lineage; any
 * branch, malformed record, or foreign orphan stops mutation.
 */
function readRecoverablePruneReceipt(
  assetRoot: string,
  authority: StoreAuthorityV1,
  expectedIdentity: Readonly<{
    expectedMachineId?: string
    expectedRootIdentitySha256?: string
  }> = {},
): RecoverablePruneReceiptV1 | null {
  const current = readAgentAssetsStoreSnapshot({ assetRoot, ...expectedIdentity })
  if (!current || canonicalJsonSha256V1(current.authority) !== canonicalJsonSha256V1(authority)) {
    throw writerError('concurrent_writer', 'Writer authority changed during maintenance recovery inspection.')
  }
  const priorMaintenance = readAgentAssetsMaintenanceHead({ assetRoot, ...expectedIdentity })
  const receipts = strictMaintenanceReceiptEntries(assetRoot)
  const byId = new Map<string, MaintenanceReceiptV1>()
  for (const receipt of receipts) {
    if (byId.has(receipt.receiptId)) {
      throw writerError('schema_incompatible', 'Multiple maintenance receipts claim the same immutable identity.')
    }
    if (receipt.storeId !== authority.storeId) {
      throw writerError('store_identity_mismatch', 'A maintenance receipt belongs to another store.')
    }
    byId.set(receipt.receiptId, receipt)
  }

  const lineage = new Set<string>()
  let cursor = priorMaintenance?.receipt ?? null
  while (cursor) {
    if (lineage.has(cursor.receiptId)) {
      throw writerError('schema_incompatible', 'The maintenance receipt lineage contains a cycle.')
    }
    const stored = byId.get(cursor.receiptId)
    if (!stored || canonicalJsonSha256V1(stored) !== canonicalJsonSha256V1(cursor)) {
      throw writerError('hash_mismatch', 'The maintenance head is not present exactly in the immutable ledger.')
    }
    lineage.add(cursor.receiptId)
    if (cursor.previousReceiptId === null || cursor.previousReceiptSha256 === null) {
      cursor = null
      continue
    }
    const previous = byId.get(cursor.previousReceiptId)
    if (!previous || canonicalJsonSha256V1(previous) !== cursor.previousReceiptSha256) {
      throw writerError('hash_mismatch', 'The maintenance receipt lineage does not match its previous receipt digest.')
    }
    if (
      previous.authorityRevision >= cursor.authorityRevision
      || previous.writerFenceEpoch >= cursor.writerFenceEpoch
    ) {
      throw writerError('schema_incompatible', 'The maintenance receipt lineage does not advance authority and fence epochs.')
    }
    cursor = previous
  }

  const orphans = receipts.filter((receipt) => !lineage.has(receipt.receiptId))
  if (orphans.length === 0) return null
  if (orphans.length !== 1) {
    throw writerError('concurrent_writer', 'The maintenance ledger contains ambiguous orphan receipts.', {
      orphanReceiptIds: orphans.map((receipt) => receipt.receiptId),
    })
  }
  const receipt = orphans[0]!
  const expectedPreviousId = priorMaintenance?.receipt.receiptId ?? null
  const expectedPreviousSha256 = priorMaintenance ? canonicalJsonSha256V1(priorMaintenance.receipt) : null
  if (
    receipt.operation !== 'prune'
    || receipt.previousReceiptId !== expectedPreviousId
    || receipt.previousReceiptSha256 !== expectedPreviousSha256
  ) {
    throw writerError('concurrent_writer', 'The orphan maintenance receipt is not the unique next prune operation.')
  }
  if (
    receipt.authorityRevision !== authority.authorityRevision
    || receipt.writerFenceEpoch !== authority.lastIssuedFenceEpoch
  ) {
    throw writerError('concurrent_writer', 'The orphan prune receipt is stale for the current writer authority.', {
      receiptAuthorityRevision: receipt.authorityRevision,
      currentAuthorityRevision: authority.authorityRevision,
      receiptWriterFenceEpoch: receipt.writerFenceEpoch,
      currentWriterFenceEpoch: authority.lastIssuedFenceEpoch,
    })
  }
  const protectedPackageSha256s = [...receipt.protectedPackageSha256s].sort()
  const removedPackageSha256s = [...receipt.removedPackageSha256s].sort()
  const expectedPaths = removedPackageSha256s.map((digest) => `core/${digest}`)
  if (
    !receipt.receiptId.startsWith(`maintenance-${authority.lastIssuedFenceEpoch}-`)
    || receipt.createdAt !== authority.updatedAt
    || !sameStrings(receipt.protectedPackageSha256s, protectedPackageSha256s)
    || !sameStrings(receipt.removedPackageSha256s, removedPackageSha256s)
    || !sameStrings(receipt.affectedManagedPaths, expectedPaths)
    || new Set([...protectedPackageSha256s, ...removedPackageSha256s]).size
      !== protectedPackageSha256s.length + removedPackageSha256s.length
    || protectedPackageSha256s.some((digest) => !SHA256_HEX.test(digest))
    || removedPackageSha256s.some((digest) => !SHA256_HEX.test(digest))
  ) {
    throw writerError('schema_incompatible', 'The orphan prune receipt does not describe one canonical immutable prune set.')
  }
  const expectedOperationId = sha256(
    `aops-agent-assets-prune-operation-v1\0${protectedPackageSha256s.join(',')}\0${removedPackageSha256s.join(',')}`,
  ).slice(0, 40)
  if (receipt.operationId !== expectedOperationId) {
    throw writerError('hash_mismatch', 'The orphan prune receipt operation digest is invalid.')
  }
  return {
    receipt,
    receiptSha256: canonicalJsonSha256V1(receipt),
    priorMaintenance,
  }
}

async function recoverInterruptedPrune(
  session: AgentAssetsNativePublicationSession,
  assetRoot: string,
  nowDate: Date,
  recovery: RecoverablePruneReceiptV1,
): Promise<PruneAgentAssetsResultV1> {
  const expectedMachineId = session.capability.machineIdentitySha256
  const expectedRootIdentitySha256 = session.capability.rootIdentitySha256
  let plan = readAgentAssetsPrunePlan({ assetRoot, now: nowDate, expectedMachineId, expectedRootIdentitySha256 })
  const currentRecovery = readRecoverablePruneReceipt(assetRoot, plan.authority, {
    expectedMachineId,
    expectedRootIdentitySha256,
  })
  if (!currentRecovery || currentRecovery.receiptSha256 !== recovery.receiptSha256) {
    throw writerError('concurrent_writer', 'The interrupted prune receipt changed before native recovery acquired the store.')
  }
  const receipt = currentRecovery.receipt
  if (plan.protectedPackageSha256s.some((digest) => !receipt.protectedPackageSha256s.includes(digest))) {
    throw writerError('concurrent_writer', 'The protected package set changed after the interrupted prune receipt was published.')
  }
  const receiptTargets = new Set(receipt.removedPackageSha256s)
  if (plan.protectedPackageSha256s.some((digest) => receiptTargets.has(digest))) {
    throw writerError('concurrent_writer', 'An interrupted prune target is now protected and cannot be removed.')
  }

  for (const digest of receipt.removedPackageSha256s) {
    plan = readAgentAssetsPrunePlan({ assetRoot, now: nowDate, expectedMachineId, expectedRootIdentitySha256 })
    if (
      plan.authority.authorityRevision !== receipt.authorityRevision
      || plan.authority.lastIssuedFenceEpoch !== receipt.writerFenceEpoch
    ) {
      throw writerError('concurrent_writer', 'Writer authority advanced while recovering an interrupted prune.')
    }
    if (plan.protectedPackageSha256s.includes(digest)) {
      throw writerError('concurrent_writer', 'An interrupted prune target became protected during recovery.', {
        packageSha256: digest,
      })
    }
    if (!plan.removablePackageSha256s.includes(digest)) continue
    const relativePath = `core/${digest}`
    const removed = await session.removeManagedTree(relativePath)
    if (removed !== 'removed') {
      throw writerError('atomic_replace_blocked', 'A verified recovery target disappeared during managed removal.', {
        relativePath,
      })
    }
  }

  const pointer: MaintenancePointerV1 = {
    schemaVersion: 1,
    storeId: plan.authority.storeId,
    receiptId: receipt.receiptId,
    receiptSha256: currentRecovery.receiptSha256,
    writerFenceEpoch: receipt.writerFenceEpoch,
    authorityRevision: receipt.authorityRevision,
    updatedAt: receipt.createdAt,
  }
  if (currentRecovery.priorMaintenance) {
    await session.publishFileReplace(
      'state/maintenance.json',
      sha256(readManagedBytes(assetRoot, 'state/maintenance.json')),
      jsonBytes(pointer),
    )
  } else {
    await session.publishFileNoReplace('state/maintenance.json', jsonBytes(pointer))
  }
  const afterPlan = readAgentAssetsPrunePlan({ assetRoot, now: nowDate, expectedMachineId, expectedRootIdentitySha256 })
  const afterMaintenance = readAgentAssetsMaintenanceHead({ assetRoot, expectedMachineId, expectedRootIdentitySha256 })
  if (
    receipt.removedPackageSha256s.some((digest) => afterPlan.removablePackageSha256s.includes(digest))
    || afterMaintenance?.pointer.receiptSha256 !== currentRecovery.receiptSha256
  ) {
    throw writerError('atomic_replace_blocked', 'Interrupted prune recovery did not publish the exact maintenance result.')
  }
  return {
    idempotent: true,
    authority: afterPlan.authority,
    protectedPackageSha256s: afterPlan.protectedPackageSha256s,
    removedPackageSha256s: receipt.removedPackageSha256s,
    maintenanceReceipt: afterMaintenance.receipt,
  }
}

export async function pinAgentAssetsExactVersion(
  options: PinAgentAssetsOptionsV1,
): Promise<PinAgentAssetsResultV1> {
  const assetRoot = path.resolve(options.assetRoot)
  const versionId = options.versionId.trim()
  const leaseId = options.leaseId.trim()
  const owner = options.owner?.trim() || 'aops-cli'
  const nowDate = (options.now ?? (() => new Date()))()
  const expiresAtMs = Date.parse(options.expiresAt)
  if (!versionId || !leaseId || leaseId.length > 512 || !owner || owner.length > 512) {
    throw writerError('schema_incompatible', 'Pin identity fields are missing or exceed the v1 bound.')
  }
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowDate.getTime()) {
    throw writerError('schema_incompatible', 'Pin expiry must be a finite future date-time.')
  }
  const resolved = readResolvedAgentAssetPackage({ assetRoot, versionId, now: nowDate })
  const relativePath = `state/pins/${pinFileName(leaseId)}`
  const absolutePath = path.join(assetRoot, ...relativePath.split('/'))
  const initial = readAgentAssetsStoreSnapshot({ assetRoot })
  if (!initial) throw writerError('not_found', 'Agent assets are not installed.')
  let currentPin: ExactVersionPinV1 | null = null
  if (existsSync(absolutePath)) {
    currentPin = parseExactVersionPinV1(JSON.parse(readFileSync(absolutePath, 'utf8')) as unknown)
    if (currentPin.storeId !== initial.authority.storeId || currentPin.leaseId !== leaseId) {
      throw writerError('store_identity_mismatch', 'The exact-version pin path contains a foreign identity.')
    }
    if (currentPin.packageSha256 !== resolved.resolved.packageSha256) {
      throw writerError('publication_conflict', 'The lease is already bound to another immutable package.')
    }
    if (currentPin.expiresAt === options.expiresAt) {
      return {
        idempotent: true,
        authority: initial.authority,
        pin: currentPin,
        maintenanceReceipt: readAgentAssetsMaintenanceHead({ assetRoot })?.receipt ?? null,
      }
    }
  }

  const now = nowDate.toISOString()
  const randomId = options.randomId ?? randomUUID
  const openNative = options.openNative ?? openAgentAssetsNativePublicationSession
  const session = await openNative({
    agentAssetsRoot: assetRoot,
    bootstrapAnchor: options.bootstrapAnchor ?? nearestExistingAnchor(assetRoot),
    requiredDurability: 'process-crash',
  })
  try {
    await ensureStoreDirectories(session, assetRoot)
    const selected = readResolvedAgentAssetPackage({
      assetRoot,
      versionId,
      now: nowDate,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    let snapshot = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!snapshot) throw writerError('not_found', 'Agent assets are not installed.')
    let authority = await issueWriterFence(session, assetRoot, snapshot.authority, now)
    snapshot = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!snapshot) throw writerError('not_found', 'Agent assets are not installed.')
    authority = snapshot.authority
    const priorMaintenance = readAgentAssetsMaintenanceHead({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    const receiptId = `maintenance-${authority.lastIssuedFenceEpoch}-${randomId()}`
    const operationId = sha256(
      `aops-agent-assets-pin-operation-v1\0${leaseId}\0${selected.resolved.packageSha256}\0${options.expiresAt}`,
    ).slice(0, 40)
    const receipt: MaintenanceReceiptV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      receiptId,
      operationId,
      operation: 'pin',
      createdAt: now,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
      previousReceiptId: priorMaintenance?.receipt.receiptId ?? null,
      previousReceiptSha256: priorMaintenance ? canonicalJsonSha256V1(priorMaintenance.receipt) : null,
      protectedPackageSha256s: [selected.resolved.packageSha256],
      removedPackageSha256s: [],
      affectedManagedPaths: [relativePath],
    }
    const receiptSha256 = canonicalJsonSha256V1(receipt)
    await session.publishFileNoReplace(
      `state/maintenance-receipts/${maintenanceReceiptFileName(receiptId)}`,
      jsonBytes(receipt),
    )
    const pin: ExactVersionPinV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      leaseId,
      packageSha256: selected.resolved.packageSha256,
      owner,
      createdAt: currentPin?.createdAt ?? now,
      expiresAt: options.expiresAt,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
    }
    if (currentPin) {
      await session.publishFileReplace(relativePath, sha256(readManagedBytes(assetRoot, relativePath)), jsonBytes(pin))
    } else {
      await session.publishFileNoReplace(relativePath, jsonBytes(pin))
    }
    const pointer: MaintenancePointerV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      receiptId,
      receiptSha256,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
      updatedAt: now,
    }
    if (priorMaintenance) {
      await session.publishFileReplace(
        'state/maintenance.json',
        sha256(readManagedBytes(assetRoot, 'state/maintenance.json')),
        jsonBytes(pointer),
      )
    } else {
      await session.publishFileNoReplace('state/maintenance.json', jsonBytes(pointer))
    }
    const after = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    const afterMaintenance = readAgentAssetsMaintenanceHead({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!after || !afterMaintenance || afterMaintenance.pointer.receiptSha256 !== receiptSha256) {
      throw writerError('atomic_replace_blocked', 'Pin maintenance pointer did not publish the exact receipt.')
    }
    return { idempotent: false, authority: after.authority, pin, maintenanceReceipt: afterMaintenance.receipt }
  } finally {
    await session.close()
  }
}

export async function pruneAgentAssets(
  options: PruneAgentAssetsOptionsV1,
): Promise<PruneAgentAssetsResultV1> {
  const assetRoot = path.resolve(options.assetRoot)
  const nowDate = (options.now ?? (() => new Date()))()
  const initialPlan = readAgentAssetsPrunePlan({ assetRoot, now: nowDate })
  const initialRecovery = readRecoverablePruneReceipt(assetRoot, initialPlan.authority)
  if (initialPlan.removablePackageSha256s.length === 0 && !initialRecovery) {
    return {
      idempotent: true,
      authority: initialPlan.authority,
      protectedPackageSha256s: initialPlan.protectedPackageSha256s,
      removedPackageSha256s: [],
      maintenanceReceipt: readAgentAssetsMaintenanceHead({ assetRoot })?.receipt ?? null,
    }
  }
  const now = nowDate.toISOString()
  const randomId = options.randomId ?? randomUUID
  const openNative = options.openNative ?? openAgentAssetsNativePublicationSession
  const session = await openNative({
    agentAssetsRoot: assetRoot,
    bootstrapAnchor: options.bootstrapAnchor ?? nearestExistingAnchor(assetRoot),
    requiredDurability: 'process-crash',
  })
  try {
    await ensureStoreDirectories(session, assetRoot)
    let plan = readAgentAssetsPrunePlan({
      assetRoot,
      now: nowDate,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    const recovery = readRecoverablePruneReceipt(assetRoot, plan.authority, {
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (recovery) return await recoverInterruptedPrune(session, assetRoot, nowDate, recovery)
    let authority = await issueWriterFence(session, assetRoot, plan.authority, now)
    plan = readAgentAssetsPrunePlan({
      assetRoot,
      now: nowDate,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    authority = plan.authority
    if (plan.removablePackageSha256s.length === 0) {
      return {
        idempotent: true,
        authority,
        protectedPackageSha256s: plan.protectedPackageSha256s,
        removedPackageSha256s: [],
        maintenanceReceipt: readAgentAssetsMaintenanceHead({ assetRoot })?.receipt ?? null,
      }
    }
    const priorMaintenance = readAgentAssetsMaintenanceHead({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    const receiptId = `maintenance-${authority.lastIssuedFenceEpoch}-${randomId()}`
    const receipt: MaintenanceReceiptV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      receiptId,
      operationId: sha256(
        `aops-agent-assets-prune-operation-v1\0${plan.protectedPackageSha256s.join(',')}\0${plan.removablePackageSha256s.join(',')}`,
      ).slice(0, 40),
      operation: 'prune',
      createdAt: now,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
      previousReceiptId: priorMaintenance?.receipt.receiptId ?? null,
      previousReceiptSha256: priorMaintenance ? canonicalJsonSha256V1(priorMaintenance.receipt) : null,
      protectedPackageSha256s: plan.protectedPackageSha256s,
      removedPackageSha256s: plan.removablePackageSha256s,
      affectedManagedPaths: plan.removableManagedPaths,
    }
    const receiptSha256 = canonicalJsonSha256V1(receipt)
    await session.publishFileNoReplace(
      `state/maintenance-receipts/${maintenanceReceiptFileName(receiptId)}`,
      jsonBytes(receipt),
    )
    for (const relativePath of plan.removableManagedPaths) {
      const removed = await session.removeManagedTree(relativePath)
      if (removed !== 'removed') {
        throw writerError('atomic_replace_blocked', 'A verified prune target disappeared before managed removal.', { relativePath })
      }
    }
    const pointer: MaintenancePointerV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      receiptId,
      receiptSha256,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
      updatedAt: now,
    }
    if (priorMaintenance) {
      await session.publishFileReplace(
        'state/maintenance.json',
        sha256(readManagedBytes(assetRoot, 'state/maintenance.json')),
        jsonBytes(pointer),
      )
    } else {
      await session.publishFileNoReplace('state/maintenance.json', jsonBytes(pointer))
    }
    const afterPlan = readAgentAssetsPrunePlan({
      assetRoot,
      now: nowDate,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    const afterMaintenance = readAgentAssetsMaintenanceHead({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (afterPlan.removablePackageSha256s.length > 0 || afterMaintenance?.pointer.receiptSha256 !== receiptSha256) {
      throw writerError('atomic_replace_blocked', 'Prune did not publish the exact maintenance result.')
    }
    return {
      idempotent: false,
      authority: afterPlan.authority,
      protectedPackageSha256s: afterPlan.protectedPackageSha256s,
      removedPackageSha256s: plan.removablePackageSha256s,
      maintenanceReceipt: afterMaintenance.receipt,
    }
  } finally {
    await session.close()
  }
}

export async function cleanupAgentAssetsStaging(
  options: CleanupAgentAssetsStagingOptionsV1,
): Promise<CleanupAgentAssetsStagingResultV1> {
  const assetRoot = path.resolve(options.assetRoot)
  const initialPlan = readAgentAssetsStagingCleanupPlan({ assetRoot })
  if (initialPlan.removableManagedPaths.length === 0) {
    return {
      idempotent: true,
      authority: initialPlan.authority,
      active: initialPlan.active,
      receipt: initialPlan.receipt,
      capability: null,
      removedManagedPaths: [],
    }
  }
  const now = (options.now ?? (() => new Date()))().toISOString()
  const openNative = options.openNative ?? openAgentAssetsNativePublicationSession
  const session = await openNative({
    agentAssetsRoot: assetRoot,
    bootstrapAnchor: options.bootstrapAnchor ?? nearestExistingAnchor(assetRoot),
    requiredDurability: 'process-crash',
  })
  try {
    const before = readAgentAssetsStagingCleanupPlan({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    const activeIdentity = canonicalJsonSha256V1(before.active)
    const receiptIdentity = canonicalJsonSha256V1(before.receipt)
    const fencedAuthority = await issueWriterFence(session, assetRoot, before.authority, now)
    const fenced = readAgentAssetsStagingCleanupPlan({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (
      fenced.authority.authorityRevision !== fencedAuthority.authorityRevision
      || fenced.authority.lastIssuedFenceEpoch !== fencedAuthority.lastIssuedFenceEpoch
      || fenced.treeIdentitySha256 !== before.treeIdentitySha256
      || canonicalJsonV1(fenced.removableManagedPaths) !== canonicalJsonV1(before.removableManagedPaths)
      || canonicalJsonSha256V1(fenced.active) !== activeIdentity
      || canonicalJsonSha256V1(fenced.receipt) !== receiptIdentity
    ) {
      throw writerError('concurrent_writer', 'Managed staging or activation state changed while cleanup acquired its writer fence.')
    }
    for (const relativePath of fenced.removableManagedPaths) {
      const removed = await session.removeManagedTree(relativePath)
      if (removed !== 'removed') {
        throw writerError('atomic_replace_blocked', 'A preflighted staging tree disappeared before native removal.', {
          relativePath,
        })
      }
    }
    const after = readAgentAssetsStagingCleanupPlan({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (
      after.removableManagedPaths.length !== 0
      || canonicalJsonSha256V1(after.active) !== activeIdentity
      || canonicalJsonSha256V1(after.receipt) !== receiptIdentity
    ) {
      throw writerError('atomic_replace_blocked', 'Staging cleanup did not preserve the exact activation state.')
    }
    return {
      idempotent: false,
      authority: after.authority,
      active: after.active,
      receipt: after.receipt,
      capability: session.capability,
      removedManagedPaths: fenced.removableManagedPaths,
    }
  } finally {
    await session.close()
  }
}

export async function rollbackAgentAssets(
  options: RollbackAgentAssetsOptionsV1,
): Promise<RollbackAgentAssetsResultV1> {
  const assetRoot = path.resolve(options.assetRoot)
  const keyIdentity = options.idempotencyKey?.trim()
    ? sha256(`aops-agent-assets-rollback-key-v1\0${options.idempotencyKey.trim()}`).slice(0, 40)
    : null
  const operationId = keyIdentity
    ? `${keyIdentity}.${sha256(`aops-agent-assets-rollback-intent-v1\0${options.toReceiptId?.trim() || 'previous'}`).slice(0, 40)}`
    : (options.randomId ?? randomUUID)()
  const now = (options.now ?? (() => new Date()))().toISOString()
  const randomId = options.randomId ?? randomUUID
  const openNative = options.openNative ?? openAgentAssetsNativePublicationSession
  const session = await openNative({
    agentAssetsRoot: assetRoot,
    bootstrapAnchor: options.bootstrapAnchor ?? nearestExistingAnchor(assetRoot),
    requiredDurability: 'process-crash',
  })
  try {
    const initial = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (initial?.active && initial.receipt?.operation === 'rollback' && keyIdentity) {
      if (initial.receipt.operationId.startsWith(`${keyIdentity}.`) && initial.receipt.operationId !== operationId) {
        throw writerError('publication_conflict', 'The rollback idempotency key is already bound to another target intent.')
      }
      if (initial.receipt.operationId === operationId) {
        readAgentAssetsStoreStatus({
          assetRoot,
          verify: 'full',
          expectedMachineId: session.capability.machineIdentitySha256,
          expectedRootIdentitySha256: session.capability.rootIdentitySha256,
        })
        return {
          idempotent: true,
          authority: initial.authority,
          active: initial.active,
          receipt: initial.receipt,
          rolledBackToReceiptId: options.toReceiptId ?? 'previous-selection',
        }
      }
    }
    const target = readAgentAssetsRollbackTarget({
      assetRoot,
      ...(options.toReceiptId ? { receiptId: options.toReceiptId } : {}),
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    let authority = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })?.authority
    if (!authority) throw writerError('not_found', 'Agent assets are not installed.')
    authority = await issueWriterFence(session, assetRoot, authority, now)
    const before = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!before?.active || !before.receipt) throw writerError('not_found', 'Agent assets have no active receipt.')
    const generation = before.active.generation + 1
    const receiptId = `receipt-${generation}-${authority.lastIssuedFenceEpoch}-${randomId()}`
    const receipt: ActivationReceiptV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      receiptId,
      operationId,
      operation: 'rollback',
      generation,
      createdAt: now,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
      previousReceiptId: before.receipt.receiptId,
      previousReceiptSha256: canonicalJsonSha256V1(before.receipt),
      core: target.target.core,
      assets: target.target.assets,
    }
    const receiptSha256 = canonicalJsonSha256V1(receipt)
    await session.publishFileNoReplace(`state/receipts/${generation}-${receiptId}.json`, jsonBytes(receipt))
    const active: ActivePointerV1 = {
      schemaVersion: 1,
      storeId: authority.storeId,
      generation,
      receiptId,
      receiptSha256,
      writerFenceEpoch: authority.lastIssuedFenceEpoch,
      authorityRevision: authority.authorityRevision,
      updatedAt: now,
    }
    await session.publishFileReplace(
      'state/active.json',
      sha256(readManagedBytes(assetRoot, 'state/active.json')),
      jsonBytes(active),
    )
    const after = readAgentAssetsStoreSnapshot({
      assetRoot,
      expectedMachineId: session.capability.machineIdentitySha256,
      expectedRootIdentitySha256: session.capability.rootIdentitySha256,
    })
    if (!after?.active || after.active.receiptSha256 !== receiptSha256) {
      throw writerError('atomic_replace_blocked', 'Rollback activation pointer did not publish the exact receipt.')
    }
    return {
      idempotent: false,
      authority: after.authority,
      active: after.active,
      receipt: after.receipt,
      rolledBackToReceiptId: target.target.receiptId,
    }
  } finally {
    await session.close()
  }
}
