import { createHash, randomUUID } from 'node:crypto'

import type { IRepositoryBase, IRepositoryContext, IUnitOfWork } from '@aopslab/xf-db'
import { runInTransactionEffect } from '@aopslab/xf-db'
import { Effect } from 'effect'

import type {
  IRepositoryPortProject,
  IRepositoryPortResource,
  IRepositoryPortScope,
  IRepositoryPortSkill,
  IRepositoryPortSkillVersion,
} from '../ports/repository-ports/index.js'
import {
  OFFICIAL_CATALOG_SCOPE_SLUG,
  type OfficialCatalogPackageV1,
  type OfficialCatalogReceiptV1,
  type OfficialCatalogReconcileActionV1,
  type OfficialCatalogReconcilePlanV1,
  type OfficialCatalogRollbackRequestV1,
  type OfficialCatalogScopeV1,
  type OfficialCatalogSnapshotV1,
  type OfficialCatalogVersionSnapshotV1,
} from '../ports/inbound/IOfficialCatalogServicePort.js'
import type { SkillServiceError } from '../errors/SkillServiceError.js'
import type {
  IbmProject,
  IbmResource,
  IbmScope,
  IbmSkill,
  IbmSkillVersion,
} from '../../domain/models/index.js'

const CATALOG_PROJECT_TYPE = 'aops-official-catalog'
const CATALOG_OWNER = 'aops-community-setup'
const CATALOG_STATE_REF_TYPE = 'aops-official-catalog-state-v1'
const CATALOG_RECEIPT_REF_TYPE = 'aops-official-catalog-receipt-v1'
const CATALOG_STATE_META_KEY = 'aopsOfficialCatalogState'
const CATALOG_RECEIPT_META_KEY = 'aopsOfficialCatalogReceipt'
const CATALOG_VERSION_META_KEY = 'aopsOfficialCatalog'
const PACKAGE_MANIFEST_META_KEY = 'packageManifestV1'
const SHA256_RE = /^[a-f0-9]{64}$/
const MAX_PACKAGE_FILES = 256
const MAX_PACKAGE_FILE_BYTES = 512 * 1024
const MAX_PACKAGE_BYTES = 4 * 1024 * 1024

type CurrentVersionMap = Record<string, string | null>

type CatalogStateMeta = {
  schemaVersion: 1
  scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_SLUG
  catalogRevision: number
  currentVersionMap: CurrentVersionMap
  lastReceiptId: string | null
}

type CatalogVersionMeta = {
  schemaVersion: 1
  scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_SLUG
  source: 'signed-community-release'
  releaseSetSha256: string
  manifestSha256: string
  packageSha256: string
  versionId: string
  inert: true
}

type ReceiptResourceMeta = {
  schemaVersion: 1
  idempotencyKey: string
  requestSha256: string
  targetReceiptId?: string
  receipt: OfficialCatalogReceiptV1
}

type FindSingleRepository<T> = {
  findSingle?: (params: {
    matchEq: Record<string, unknown>
    options?: Record<string, unknown>
    forUpdate?: boolean
  }) => Effect.Effect<T | null, unknown>
}

type ExplicitIdRepository<T> = {
  createPreservingId?: (data: T) => Effect.Effect<T, unknown>
}

type CatalogRepositories = {
  projectRepository: IRepositoryPortProject
  scopeRepository: IRepositoryPortScope
  resourceRepository: IRepositoryPortResource
  skillRepository: IRepositoryPortSkill
  skillVersionRepository: IRepositoryPortSkillVersion
}

export type OfficialCatalogServiceOptions = CatalogRepositories & {
  unitOfWork?: IUnitOfWork
}

function catalogError(code: string, details?: string): Error {
  return new Error(`agentspace.conflict:official_catalog_${code}${details ? `:${details}` : ''}`)
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw catalogError('invalid_input', label)
  return value.trim()
}

function assertSha256(value: unknown, label: string): string {
  const normalized = nonEmpty(value, label).toLowerCase()
  if (!SHA256_RE.test(normalized)) throw catalogError('invalid_digest', label)
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function stableObject(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableObject).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort(compareUtf8).map((key) => `${JSON.stringify(key)}:${stableObject(record[key])}`).join(',')}}`
}

function sha256Bytes(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function packageSha256(files: ReadonlyArray<{ path: string; sha256: string }>): string {
  const records = files
    .map((file) => ({ path: file.path.normalize('NFC'), sha256: file.sha256.toLowerCase() }))
    .sort((left, right) => compareUtf8(left.path, right.path))
  return createHash('sha256')
    .update(Buffer.concat(records.map((file) => Buffer.from(`${file.path}\0${file.sha256}\n`, 'utf8'))))
    .digest('hex')
}

function sortedMap(value: Readonly<Record<string, string | null>>): CurrentVersionMap {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareUtf8(left, right)))
}

function assertCurrentVersionMap(value: unknown, label: string): asserts value is CurrentVersionMap {
  if (!isRecord(value)) throw catalogError('invalid_current_map', label)
  for (const [name, recordId] of Object.entries(value)) {
    nonEmpty(name, `${label}.name`)
    if (recordId !== null) nonEmpty(recordId, `${label}.${name}`)
  }
}

function assertExactScope(scope: unknown): asserts scope is OfficialCatalogScopeV1 {
  if (!isRecord(scope) || stableObject(scope) !== stableObject({
    schemaVersion: 1,
    slug: OFFICIAL_CATALOG_SCOPE_SLUG,
    kind: 'agentspace-skill-catalog',
    owner: CATALOG_OWNER,
    reserved: true,
  })) throw catalogError('scope_conflict')
}

function normalizePackagePath(value: unknown): string {
  const input = nonEmpty(value, 'package.files.path')
  const normalized = input.normalize('NFC')
  if (
    input !== normalized ||
    input.includes('\\') ||
    input.startsWith('/') ||
    /^[a-zA-Z]:/.test(input) ||
    input.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) throw catalogError('invalid_package_path', input)
  return input
}

function validatePackage(input: OfficialCatalogPackageV1, releaseSetSha256: string): OfficialCatalogPackageV1 {
  if (!isRecord(input) || !isRecord(input.manifest) || !isRecord(input.meta)) {
    throw catalogError('invalid_package')
  }
  const name = nonEmpty(input.name, 'package.name')
  const version = nonEmpty(input.version, 'package.version')
  const versionId = nonEmpty(input.versionId, 'package.versionId')
  const manifest = input.manifest
  const manifestSha256 = assertSha256(input.manifestSha256, 'package.manifestSha256')
  const expectedPackageSha256 = assertSha256(input.packageSha256, 'package.packageSha256')
  if (
    input.entryFile !== 'SKILL.md' ||
    manifest.schemaVersion !== 1 ||
    manifest.assetKind !== 'skill-package' ||
    manifest.standard !== 'aops-skill-package-v1' ||
    manifest.entryFile !== 'SKILL.md' ||
    manifest.name !== name ||
    manifest.version !== version ||
    manifest.versionId !== versionId ||
    manifest.packageSha256 !== expectedPackageSha256 ||
    !isRecord(manifest.provenance) ||
    manifest.provenance.trustClass !== 'verified-hosted-package' ||
    manifest.provenance.expectedDigestSource !== 'immutable-hosted-metadata' ||
    !nonEmpty(manifest.provenance.reference, 'manifest.provenance.reference')
  ) throw catalogError('invalid_manifest', name)
  if (manifest.compatibility && (
    manifest.compatibility.maxSchemaVersion !== 1 ||
    !nonEmpty(manifest.compatibility.minCliVersion, 'manifest.compatibility.minCliVersion')
  )) throw catalogError('invalid_manifest_compatibility', name)

  const provenance = input.meta.aopsOfficialCatalog
  if (!isRecord(provenance) || stableObject(provenance) !== stableObject({
    schemaVersion: 1,
    scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
    source: 'signed-community-release',
    releaseSetSha256,
    manifestSha256,
    packageSha256: expectedPackageSha256,
    inert: true,
  })) throw catalogError('invalid_signed_provenance', name)

  if (!Array.isArray(input.files) || !Array.isArray(manifest.files) || input.files.length === 0) {
    throw catalogError('invalid_package_files', name)
  }
  if (input.files.length > MAX_PACKAGE_FILES || input.files.length !== manifest.files.length) {
    throw catalogError('invalid_package_file_count', name)
  }
  const manifestByPath = new Map<string, { path: string; sha256: string; byteLength: number }>()
  const foldedPaths = new Set<string>()
  for (const row of manifest.files) {
    if (!isRecord(row)) throw catalogError('invalid_manifest_file', name)
    const path = normalizePackagePath(row.path)
    const folded = path.toLocaleLowerCase('en-US')
    if (manifestByPath.has(path) || foldedPaths.has(folded)) throw catalogError('duplicate_package_path', path)
    const digest = assertSha256(row.sha256, `${name}/${path}`)
    if (!Number.isSafeInteger(row.byteLength) || row.byteLength < 0 || row.byteLength > MAX_PACKAGE_FILE_BYTES) {
      throw catalogError('invalid_package_file_size', path)
    }
    manifestByPath.set(path, { path, sha256: digest, byteLength: row.byteLength })
    foldedPaths.add(folded)
  }
  let totalBytes = 0
  const seen = new Set<string>()
  for (const file of input.files) {
    if (!isRecord(file)) throw catalogError('invalid_package_file', name)
    const path = normalizePackagePath(file.path)
    const row = manifestByPath.get(path)
    if (!row || seen.has(path) || typeof file.content !== 'string') throw catalogError('package_membership_mismatch', path)
    const bytes = Buffer.from(file.content, 'utf8')
    totalBytes += bytes.byteLength
    if (
      file.byteLength !== row.byteLength ||
      file.sha256 !== row.sha256 ||
      bytes.byteLength !== row.byteLength ||
      sha256Bytes(bytes) !== row.sha256
    ) throw catalogError('package_file_digest_mismatch', path)
    seen.add(path)
  }
  if (totalBytes > MAX_PACKAGE_BYTES || !seen.has('SKILL.md')) throw catalogError('invalid_package_closure', name)
  if (packageSha256([...manifestByPath.values()]) !== expectedPackageSha256) {
    throw catalogError('package_digest_mismatch', name)
  }
  return input
}

function parseStateMeta(resource: IbmResource): CatalogStateMeta {
  const root = isRecord(resource.meta) ? resource.meta[CATALOG_STATE_META_KEY] : undefined
  if (!isRecord(root)) throw catalogError('state_invalid')
  assertCurrentVersionMap(root.currentVersionMap, 'state.currentVersionMap')
  if (
    root.schemaVersion !== 1 ||
    root.scopeSlug !== OFFICIAL_CATALOG_SCOPE_SLUG ||
    !Number.isSafeInteger(root.catalogRevision) ||
    Number(root.catalogRevision) < 0 ||
    (root.lastReceiptId !== null && typeof root.lastReceiptId !== 'string')
  ) throw catalogError('state_invalid')
  return {
    schemaVersion: 1,
    scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
    catalogRevision: Number(root.catalogRevision),
    currentVersionMap: sortedMap(root.currentVersionMap),
    lastReceiptId: root.lastReceiptId ? nonEmpty(root.lastReceiptId, 'state.lastReceiptId') : null,
  }
}

function parseCatalogVersionMeta(version: IbmSkillVersion): CatalogVersionMeta | null {
  const value = isRecord(version.meta) ? version.meta[CATALOG_VERSION_META_KEY] : undefined
  if (!isRecord(value)) return null
  const parsed: CatalogVersionMeta = {
    schemaVersion: 1,
    scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
    source: 'signed-community-release',
    releaseSetSha256: assertSha256(value.releaseSetSha256, 'version.releaseSetSha256'),
    manifestSha256: assertSha256(value.manifestSha256, 'version.manifestSha256'),
    packageSha256: assertSha256(value.packageSha256, 'version.packageSha256'),
    versionId: nonEmpty(value.versionId, 'version.versionId'),
    inert: true,
  }
  if (
    value.schemaVersion !== 1 ||
    value.scopeSlug !== OFFICIAL_CATALOG_SCOPE_SLUG ||
    value.source !== 'signed-community-release' ||
    value.inert !== true
  ) throw catalogError('version_provenance_invalid', String(version.id))
  return parsed
}

function assertPersistedCatalogVersion(
  version: IbmSkillVersion,
  skill: IbmSkill,
  meta: CatalogVersionMeta,
): void {
  if (
    version.status !== 'published' ||
    version.entryFile !== 'SKILL.md' ||
    version.skillStandard !== 'aops-skill-package-v1' ||
    version.refType !== 'aops-official-catalog-version' ||
    version.refId !== meta.versionId ||
    !Array.isArray(version.files) ||
    version.files.length === 0 ||
    !isRecord(version.meta)
  ) throw catalogError('version_graph_invalid', String(version.id))
  const files: Array<{ path: string; sha256: string; byteLength: number }> = []
  const seen = new Set<string>()
  for (const raw of version.files) {
    if (!isRecord(raw) || typeof raw.content !== 'string') throw catalogError('version_files_invalid', String(version.id))
    const path = normalizePackagePath(raw.path)
    if (seen.has(path)) throw catalogError('version_files_invalid', path)
    const bytes = Buffer.from(raw.content, 'utf8')
    const digest = assertSha256(raw.sha256, `version/${path}`)
    if (raw.sizeBytes !== bytes.byteLength || digest !== sha256Bytes(bytes)) {
      throw catalogError('version_file_digest_mismatch', path)
    }
    files.push({ path, sha256: digest, byteLength: bytes.byteLength })
    seen.add(path)
  }
  if (!seen.has('SKILL.md') || packageSha256(files) !== meta.packageSha256) {
    throw catalogError('version_package_digest_mismatch', String(version.id))
  }
  const manifest = version.meta[PACKAGE_MANIFEST_META_KEY]
  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.assetKind !== 'skill-package' ||
    manifest.name !== skill.name ||
    manifest.version !== String(version.version) ||
    manifest.versionId !== version.id ||
    manifest.entryFile !== 'SKILL.md' ||
    manifest.standard !== 'aops-skill-package-v1' ||
    manifest.packageSha256 !== meta.packageSha256 ||
    !isRecord(manifest.provenance) ||
    manifest.provenance.trustClass !== 'verified-hosted-package' ||
    manifest.provenance.expectedDigestSource !== 'immutable-hosted-metadata' ||
    manifest.provenance.reference !== `skill-version:${version.id}` ||
    !Array.isArray(manifest.files) ||
    stableObject([...manifest.files].sort((left, right) => compareUtf8(String((left as any).path), String((right as any).path)))) !==
      stableObject(files.sort((left, right) => compareUtf8(left.path, right.path)))
  ) throw catalogError('version_manifest_invalid', String(version.id))
}

function parseReceiptResource(resource: IbmResource): ReceiptResourceMeta {
  const value = isRecord(resource.meta) ? resource.meta[CATALOG_RECEIPT_META_KEY] : undefined
  if (!isRecord(value) || !isRecord(value.receipt)) throw catalogError('receipt_invalid', String(resource.id))
  const receipt = value.receipt as unknown as OfficialCatalogReceiptV1
  assertCurrentVersionMap(receipt.priorCurrentVersionMap, 'receipt.priorCurrentVersionMap')
  assertCurrentVersionMap(receipt.currentVersionMap, 'receipt.currentVersionMap')
  if (
    value.schemaVersion !== 1 ||
    typeof value.idempotencyKey !== 'string' ||
    !SHA256_RE.test(String(value.requestSha256 ?? '')) ||
    receipt.schemaVersion !== 1 ||
    receipt.kind !== 'aops-official-catalog-receipt-v1' ||
    receipt.scopeSlug !== OFFICIAL_CATALOG_SCOPE_SLUG ||
    receipt.receiptId !== resource.refId ||
    receipt.scopeId !== resource.scopeId ||
    (receipt.operation !== 'reconcile' && receipt.operation !== 'rollback') ||
    !Number.isSafeInteger(receipt.catalogRevision) ||
    receipt.catalogRevision < 1 ||
    !SHA256_RE.test(receipt.releaseSetSha256) ||
    !Number.isFinite(Date.parse(receipt.createdAt)) ||
    typeof receipt.projectId !== 'string' ||
    !receipt.projectId.trim() ||
    (receipt.previousReceiptId !== null && (typeof receipt.previousReceiptId !== 'string' || !receipt.previousReceiptId.trim())) ||
    receipt.historyDeleteCount !== 0 ||
    !Array.isArray(receipt.activationEffects) ||
    receipt.activationEffects.length !== 0 ||
    !Array.isArray(receipt.packageSha256) ||
    receipt.packageSha256.some((digest) => !SHA256_RE.test(digest))
  ) throw catalogError('receipt_invalid', String(resource.id))
  return {
    schemaVersion: 1,
    idempotencyKey: nonEmpty(value.idempotencyKey, 'receipt.idempotencyKey'),
    requestSha256: String(value.requestSha256),
    ...(typeof value.targetReceiptId === 'string' ? { targetReceiptId: value.targetReceiptId } : {}),
    receipt,
  }
}

function receiptIdFor(idempotencyKey: string): string {
  return `official-catalog-receipt-${sha256Bytes(idempotencyKey)}`
}

function toServiceEffect<T>(effect: Effect.Effect<T, unknown, unknown>): Effect.Effect<T, SkillServiceError> {
  return effect as unknown as Effect.Effect<T, SkillServiceError>
}

export class OfficialCatalogService {
  private readonly repositories: CatalogRepositories
  private readonly unitOfWork?: IUnitOfWork

  constructor(options: OfficialCatalogServiceOptions) {
    this.repositories = options
    this.unitOfWork = options.unitOfWork
  }

  private bindContext(ctx: IRepositoryContext): IRepositoryBase[] {
    const bound: IRepositoryBase[] = []
    for (const repository of Object.values(this.repositories)) {
      const candidate = repository as unknown as IRepositoryBase
      if (typeof candidate.setCtx !== 'function' || typeof candidate.clearCtx !== 'function') continue
      candidate.setCtx(ctx)
      bound.push(candidate)
    }
    return bound
  }

  private runAtomic<T>(program: () => Effect.Effect<T, unknown>): Effect.Effect<T, SkillServiceError> {
    if (!this.unitOfWork) return toServiceEffect(Effect.fail(catalogError('atomic_store_required')))
    return toServiceEffect(runInTransactionEffect(this.unitOfWork, (ctx) =>
      Effect.acquireUseRelease(
        Effect.sync(() => this.bindContext(ctx)),
        () => program(),
        (bound) => Effect.sync(() => bound.forEach((repository) => repository.clearCtx())),
      )
    ))
  }

  private findProjects(): Effect.Effect<IbmProject[], unknown> {
    return this.repositories.projectRepository.find({
      matchEq: { slug: OFFICIAL_CATALOG_SCOPE_SLUG },
      options: { limit: 2 },
    } as never)
  }

  private findState(scopeId: string, forUpdate = false): Effect.Effect<IbmResource | null, unknown> {
    const repository = this.repositories.resourceRepository as IRepositoryPortResource & FindSingleRepository<IbmResource>
    const params = {
      matchEq: { scopeId, refType: CATALOG_STATE_REF_TYPE, refId: OFFICIAL_CATALOG_SCOPE_SLUG },
      options: { limit: 1 },
      forUpdate,
    }
    if (typeof repository.findSingle === 'function') return repository.findSingle(params)
    if (forUpdate) return Effect.fail(catalogError('atomic_lock_required'))
    return repository.find(params as never).pipe(Effect.map((rows) => rows[0] ?? null))
  }

  private findReceipt(scopeId: string, receiptId: string): Effect.Effect<IbmResource | null, unknown> {
    return this.repositories.resourceRepository.find({
      matchEq: { scopeId, refType: CATALOG_RECEIPT_REF_TYPE, refId: receiptId },
      options: { limit: 1 },
    } as never).pipe(Effect.map((rows) => rows[0] ?? null))
  }

  private inspectInternal(forUpdate = false): Effect.Effect<OfficialCatalogSnapshotV1, unknown> {
    return Effect.gen(this, function* (_) {
      const projects = yield* _(this.findProjects())
      if (projects.length === 0) {
        return {
          schemaVersion: 1,
          scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
          state: 'absent',
          scopeId: null,
          projectId: null,
          catalogRevision: 0,
          currentVersionMap: {},
          versions: [],
          lastReceiptId: null,
        }
      }
      if (projects.length !== 1) throw catalogError('scope_conflict', 'duplicate_project')
      const project = projects[0]!
      if (
        project.projectType !== CATALOG_PROJECT_TYPE ||
        project.slug !== OFFICIAL_CATALOG_SCOPE_SLUG ||
        project.ownerId !== CATALOG_OWNER ||
        project.visibility !== 'private'
      ) {
        throw catalogError('scope_conflict', 'project_owner')
      }
      const projectId = nonEmpty(project.id, 'project.id')
      const scopeId = nonEmpty(project.scopeId, 'project.scopeId')
      const scope = yield* _(this.repositories.scopeRepository.findById(scopeId))
      if (!scope || scope.type !== 'project') throw catalogError('scope_conflict', 'scope_owner')
      const stateResource = yield* _(this.findState(scopeId, forUpdate))
      if (!stateResource) throw catalogError('state_missing')
      const state = parseStateMeta(stateResource)
      const skills = yield* _(this.repositories.skillRepository.find({ matchEq: { scopeId } } as never))
      const versions = yield* _(this.repositories.skillVersionRepository.find({ matchEq: { projectId } } as never))
      const skillById = new Map(skills.map((skill) => [String(skill.id), skill]))
      const snapshotVersions: OfficialCatalogVersionSnapshotV1[] = []
      const identities = new Set<string>()
      for (const version of versions) {
        const meta = parseCatalogVersionMeta(version)
        if (!meta) throw catalogError('scope_conflict', 'non_catalog_version')
        const skill = skillById.get(String(version.skillId))
        if (!skill || version.status !== 'published') throw catalogError('version_graph_invalid', String(version.id))
        assertPersistedCatalogVersion(version, skill, meta)
        const identity = `${skill.name}\0${meta.versionId}`
        if (identities.has(identity)) throw catalogError('version_identity_conflict', identity)
        identities.add(identity)
        snapshotVersions.push({
          recordId: nonEmpty(version.id, 'version.id'),
          skillId: nonEmpty(skill.id, 'skill.id'),
          name: nonEmpty(skill.name, 'skill.name'),
          versionId: meta.versionId,
          packageSha256: meta.packageSha256,
          releaseSetSha256: meta.releaseSetSha256,
          status: 'published',
          inert: true,
        })
      }
      snapshotVersions.sort((left, right) => compareUtf8(`${left.name}\0${left.versionId}`, `${right.name}\0${right.versionId}`))
      const versionById = new Map(snapshotVersions.map((version) => [version.recordId, version]))
      for (const skill of skills) {
        const name = nonEmpty(skill.name, 'skill.name')
        const expected = state.currentVersionMap[name]
        const actual = skill.currentVersionId ?? null
        if ((expected ?? null) !== actual) throw catalogError('current_map_drift', name)
      }
      for (const [name, recordId] of Object.entries(state.currentVersionMap)) {
        if (recordId === null) continue
        const selected = versionById.get(recordId)
        if (!selected || selected.name !== name) throw catalogError('current_map_scope_conflict', name)
      }
      if (state.lastReceiptId) {
        const receiptResource = yield* _(this.findReceipt(scopeId, state.lastReceiptId))
        if (!receiptResource) throw catalogError('receipt_chain_missing', state.lastReceiptId)
        const stored = parseReceiptResource(receiptResource).receipt
        if (
          stored.projectId !== projectId ||
          stored.catalogRevision !== state.catalogRevision ||
          stableObject(sortedMap(stored.currentVersionMap)) !== stableObject(sortedMap(state.currentVersionMap))
        ) throw catalogError('receipt_chain_invalid', state.lastReceiptId)
      }
      return {
        schemaVersion: 1,
        scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
        state: 'ready',
        scopeId,
        projectId,
        catalogRevision: state.catalogRevision,
        currentVersionMap: sortedMap(state.currentVersionMap),
        versions: snapshotVersions,
        lastReceiptId: state.lastReceiptId,
      }
    })
  }

  inspect(scope: OfficialCatalogScopeV1): Effect.Effect<OfficialCatalogSnapshotV1, SkillServiceError> {
    return toServiceEffect(Effect.try({
      try: () => assertExactScope(scope),
      catch: (error) => error,
    }).pipe(Effect.flatMap(() => this.inspectInternal(false))))
  }

  private createReservedProject(): Effect.Effect<{ projectId: string; scopeId: string }, unknown> {
    return Effect.gen(this, function* (_) {
      const id = randomUUID()
      const scopeRepository = this.repositories.scopeRepository as IRepositoryPortScope & ExplicitIdRepository<IbmScope>
      const projectRepository = this.repositories.projectRepository as IRepositoryPortProject & ExplicitIdRepository<IbmProject>
      if (typeof scopeRepository.createPreservingId !== 'function' || typeof projectRepository.createPreservingId !== 'function') {
        throw catalogError('explicit_id_repository_required')
      }
      const scope = yield* _(scopeRepository.createPreservingId({
        id,
        type: 'project',
        parentScopeId: null,
        createdBy: CATALOG_OWNER,
        updatedBy: CATALOG_OWNER,
      } as IbmScope))
      const scopeId = nonEmpty(scope.id, 'created.scopeId')
      const project = yield* _(projectRepository.createPreservingId({
        id,
        scopeId,
        name: 'AOPS Official Catalog',
        description: 'Reserved inert catalog managed atomically by AOPS Community setup.',
        slug: OFFICIAL_CATALOG_SCOPE_SLUG,
        status: 'active',
        visibility: 'private',
        projectType: CATALOG_PROJECT_TYPE,
        ownerId: CATALOG_OWNER,
        createdBy: CATALOG_OWNER,
        updatedBy: CATALOG_OWNER,
      } as IbmProject))
      const projectId = nonEmpty(project.id, 'created.projectId')
      yield* _(this.repositories.resourceRepository.create({
        scopeId,
        name: 'AOPS Official Catalog State',
        resourceType: 'reference',
        refType: CATALOG_STATE_REF_TYPE,
        refId: OFFICIAL_CATALOG_SCOPE_SLUG,
        tags: ['aops-official-catalog', 'managed-state'],
        createdBy: CATALOG_OWNER,
        updatedBy: CATALOG_OWNER,
        meta: {
          [CATALOG_STATE_META_KEY]: {
            schemaVersion: 1,
            scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
            catalogRevision: 0,
            currentVersionMap: {},
            lastReceiptId: null,
          } satisfies CatalogStateMeta,
        },
      } as IbmResource))
      return { projectId, scopeId }
    })
  }

  private validatePlan(plan: OfficialCatalogReconcilePlanV1, snapshot: OfficialCatalogSnapshotV1): OfficialCatalogPackageV1[] {
    assertExactScope(plan.scope)
    const releaseSetSha256 = assertSha256(plan.releaseSetSha256, 'plan.releaseSetSha256')
    nonEmpty(plan.idempotencyKey, 'plan.idempotencyKey')
    assertCurrentVersionMap(plan.expectedCurrentVersionMap, 'plan.expectedCurrentVersionMap')
    assertCurrentVersionMap(plan.desiredPackageVersionMap, 'plan.desiredPackageVersionMap')
    if (
      plan.schemaVersion !== 1 ||
      plan.kind !== 'aops-official-catalog-reconcile-plan-v1' ||
      plan.historyDeleteCount !== 0 ||
      !Array.isArray(plan.activationEffects) ||
      plan.activationEffects.length !== 0 ||
      !Array.isArray(plan.packages) ||
      plan.packages.length === 0 ||
      !Array.isArray(plan.actions) ||
      plan.expectedCatalogRevision !== snapshot.catalogRevision ||
      plan.expectedPreviousReceiptId !== snapshot.lastReceiptId ||
      stableObject(sortedMap(plan.expectedCurrentVersionMap)) !== stableObject(sortedMap(snapshot.currentVersionMap))
    ) throw catalogError('compare_and_swap_conflict')

    const packages = plan.packages.map((entry) => validatePackage(entry, releaseSetSha256))
      .sort((left, right) => compareUtf8(`${left.name}\0${left.versionId}`, `${right.name}\0${right.versionId}`))
    const identity = new Set<string>()
    const digest = new Set<string>()
    for (const entry of packages) {
      const key = `${entry.name}\0${entry.versionId}`
      if (identity.has(key) || digest.has(entry.packageSha256)) throw catalogError('duplicate_package_identity', key)
      identity.add(key)
      digest.add(entry.packageSha256)
    }

    const existing = new Map(snapshot.versions.map((entry) => [`${entry.name}\0${entry.versionId}`, entry]))
    const desired: CurrentVersionMap = {}
    const actions: OfficialCatalogReconcileActionV1[] = []
    for (const entry of packages) {
      desired[entry.name] = entry.versionId
      const found = existing.get(`${entry.name}\0${entry.versionId}`)
      if (found && (found.packageSha256 !== entry.packageSha256 || found.releaseSetSha256 !== releaseSetSha256)) {
        throw catalogError('package_identity_conflict', `${entry.name}/${entry.versionId}`)
      }
      actions.push({
        name: entry.name,
        action: !found ? 'append-version' : snapshot.currentVersionMap[entry.name] === found.recordId ? 'unchanged' : 'set-current',
        versionId: entry.versionId,
        packageSha256: entry.packageSha256,
        existingRecordId: found?.recordId ?? null,
      })
    }
    for (const name of Object.keys(snapshot.currentVersionMap).sort(compareUtf8)) {
      if (Object.prototype.hasOwnProperty.call(desired, name)) continue
      desired[name] = null
      actions.push({
        name,
        action: snapshot.currentVersionMap[name] === null ? 'unchanged' : 'clear-current',
        versionId: null,
        packageSha256: null,
        existingRecordId: snapshot.currentVersionMap[name] ?? null,
      })
    }
    actions.sort((left, right) => compareUtf8(`${left.name}\0${left.action}`, `${right.name}\0${right.action}`))
    if (
      stableObject(sortedMap(plan.desiredPackageVersionMap)) !== stableObject(sortedMap(desired)) ||
      stableObject(plan.actions) !== stableObject(actions) ||
      plan.mutationRequired !== actions.some((entry) => entry.action !== 'unchanged')
    ) throw catalogError('plan_tampered')
    return packages
  }

  private findIdempotentReceipt(
    scopeId: string,
    idempotencyKey: string,
    requestSha256: string,
  ): Effect.Effect<OfficialCatalogReceiptV1 | null, unknown> {
    return this.findReceipt(scopeId, receiptIdFor(idempotencyKey)).pipe(
      Effect.map((resource) => {
        if (!resource) return null
        const stored = parseReceiptResource(resource)
        if (stored.idempotencyKey !== idempotencyKey || stored.requestSha256 !== requestSha256) {
          throw catalogError('idempotency_conflict')
        }
        return stored.receipt
      }),
    )
  }

  private persistReceipt(options: {
    scopeId: string
    idempotencyKey: string
    requestSha256: string
    receipt: OfficialCatalogReceiptV1
    targetReceiptId?: string
  }): Effect.Effect<IbmResource, unknown> {
    return this.repositories.resourceRepository.create({
      scopeId: options.scopeId,
      name: `AOPS Official Catalog Receipt ${options.receipt.catalogRevision}`,
      resourceType: 'reference',
      refType: CATALOG_RECEIPT_REF_TYPE,
      refId: options.receipt.receiptId,
      tags: ['aops-official-catalog', 'append-only-receipt', options.receipt.operation],
      createdBy: CATALOG_OWNER,
      updatedBy: CATALOG_OWNER,
      meta: {
        [CATALOG_RECEIPT_META_KEY]: {
          schemaVersion: 1,
          idempotencyKey: options.idempotencyKey,
          requestSha256: options.requestSha256,
          ...(options.targetReceiptId ? { targetReceiptId: options.targetReceiptId } : {}),
          receipt: options.receipt,
        } satisfies ReceiptResourceMeta,
      },
    } as IbmResource)
  }

  private updateState(scopeId: string, current: CatalogStateMeta, receipt: OfficialCatalogReceiptV1): Effect.Effect<void, unknown> {
    return this.findState(scopeId, true).pipe(
      Effect.flatMap((stateResource) => {
        if (!stateResource) return Effect.fail(catalogError('state_missing'))
        const locked = parseStateMeta(stateResource)
        if (stableObject(locked) !== stableObject(current)) return Effect.fail(catalogError('compare_and_swap_conflict'))
        return this.repositories.resourceRepository.patchById(String(stateResource.id), {
          updatedBy: CATALOG_OWNER,
          meta: {
            [CATALOG_STATE_META_KEY]: {
              schemaVersion: 1,
              scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
              catalogRevision: receipt.catalogRevision,
              currentVersionMap: receipt.currentVersionMap,
              lastReceiptId: receipt.receiptId,
            } satisfies CatalogStateMeta,
          },
        }).pipe(Effect.map(() => undefined))
      }),
    )
  }

  private normalizedHostedManifest(input: OfficialCatalogPackageV1, recordId: string, numericVersion: number) {
    return {
      ...input.manifest,
      version: String(numericVersion),
      versionId: recordId,
      files: input.manifest.files.map((file) => ({ ...file })),
      compatibility: input.manifest.compatibility ?? {
        minCliVersion: '0.1.0',
        maxSchemaVersion: 1 as const,
      },
      provenance: {
        trustClass: 'verified-hosted-package' as const,
        expectedDigestSource: 'immutable-hosted-metadata' as const,
        reference: `skill-version:${recordId}`,
      },
    }
  }

  private appendPackage(
    snapshot: OfficialCatalogSnapshotV1,
    input: OfficialCatalogPackageV1,
    projectId: string,
    scopeId: string,
  ): Effect.Effect<{ skill: IbmSkill; version: IbmSkillVersion }, unknown> {
    return Effect.gen(this, function* (_) {
      const existingSnapshot = snapshot.versions.find((entry) => entry.name === input.name && entry.versionId === input.versionId)
      if (existingSnapshot) {
        const skill = yield* _(this.repositories.skillRepository.findById(existingSnapshot.skillId))
        const version = yield* _(this.repositories.skillVersionRepository.findById(existingSnapshot.recordId))
        if (!skill || !version) throw catalogError('version_graph_invalid', input.name)
        return { skill, version }
      }

      const skillRows = yield* _(this.repositories.skillRepository.find({ matchEq: { scopeId, name: input.name }, options: { limit: 2 } } as never))
      if (skillRows.length > 1) throw catalogError('skill_identity_conflict', input.name)
      const skill = skillRows[0] ?? (yield* _(this.repositories.skillRepository.create({
        scopeId,
        name: input.name,
        description: `Official AOPS catalog skill ${input.name}.`,
        shortDescription: `Inert official catalog skill ${input.name}.`,
        tags: ['aops-official-catalog', 'inert'],
        currentVersionId: null,
        createdBy: CATALOG_OWNER,
        updatedBy: CATALOG_OWNER,
      } as IbmSkill)))
      const priorVersions = yield* _(this.repositories.skillVersionRepository.find({ matchEq: { projectId, skillId: skill.id } } as never))
      const numericVersion = priorVersions.reduce((max, row) => Math.max(max, Number(row.version) || 0), 0) + 1
      const entryContent = input.files.find((file) => file.path === 'SKILL.md')?.content
      if (entryContent === undefined) throw catalogError('entry_file_missing', input.name)
      let version = yield* _(this.repositories.skillVersionRepository.create({
        projectId,
        skillId: skill.id,
        version: numericVersion,
        status: 'published',
        content: entryContent,
        entryFile: 'SKILL.md',
        skillStandard: 'aops-skill-package-v1',
        files: input.files.map((file) => ({
          path: file.path,
          content: file.content,
          sizeBytes: file.byteLength,
          sha256: file.sha256,
        })),
        meta: {
          [CATALOG_VERSION_META_KEY]: {
            ...input.meta.aopsOfficialCatalog,
            versionId: input.versionId,
          } satisfies CatalogVersionMeta,
          sourceManifestV1: input.manifest,
          package: { metadata: { officialCatalog: true, sourceVersionId: input.versionId } },
        },
        refType: 'aops-official-catalog-version',
        refId: input.versionId,
        createdBy: CATALOG_OWNER,
        updatedBy: CATALOG_OWNER,
        publishedAt: new Date(),
      } as IbmSkillVersion))
      version = yield* _(this.repositories.skillVersionRepository.patchById(String(version.id), {
        meta: {
          ...(isRecord(version.meta) ? version.meta : {}),
          [PACKAGE_MANIFEST_META_KEY]: this.normalizedHostedManifest(input, String(version.id), numericVersion),
        },
      }))
      return { skill, version }
    })
  }

  reconcile(plan: OfficialCatalogReconcilePlanV1): Effect.Effect<OfficialCatalogReceiptV1, SkillServiceError> {
    return this.runAtomic(() => Effect.gen(this, function* (_) {
      assertExactScope(plan.scope)
      let snapshot = yield* _(this.inspectInternal(true))
      if (snapshot.state === 'absent') {
        if (
          plan.expectedCatalogRevision !== 0 ||
          plan.expectedPreviousReceiptId !== null ||
          Object.keys(plan.expectedCurrentVersionMap ?? {}).length !== 0
        ) throw catalogError('compare_and_swap_conflict')
        yield* _(this.createReservedProject())
        snapshot = yield* _(this.inspectInternal(true))
      }
      if (snapshot.state !== 'ready' || !snapshot.scopeId || !snapshot.projectId) throw catalogError('state_invalid')
      const requestSha256 = sha256Bytes(stableObject(plan))
      const existingReceipt = yield* _(this.findIdempotentReceipt(
        snapshot.scopeId,
        nonEmpty(plan.idempotencyKey, 'plan.idempotencyKey'),
        requestSha256,
      ))
      if (existingReceipt) {
        if (existingReceipt.operation !== 'reconcile' || existingReceipt.releaseSetSha256 !== plan.releaseSetSha256) {
          throw catalogError('idempotency_conflict')
        }
        return existingReceipt
      }
      const packages = this.validatePlan(plan, snapshot)
      const currentState: CatalogStateMeta = {
        schemaVersion: 1,
        scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
        catalogRevision: snapshot.catalogRevision,
        currentVersionMap: sortedMap(snapshot.currentVersionMap),
        lastReceiptId: snapshot.lastReceiptId,
      }
      const desiredActual: CurrentVersionMap = {}
      for (const input of packages) {
        const persisted = yield* _(this.appendPackage(snapshot, input, snapshot.projectId, snapshot.scopeId))
        desiredActual[input.name] = nonEmpty(persisted.version.id, 'persisted.version.id')
        if (persisted.skill.currentVersionId !== persisted.version.id) {
          yield* _(this.repositories.skillRepository.patchById(String(persisted.skill.id), {
            currentVersionId: persisted.version.id,
            updatedBy: CATALOG_OWNER,
          }))
        }
      }
      const skills = yield* _(this.repositories.skillRepository.find({ matchEq: { scopeId: snapshot.scopeId } } as never))
      for (const skill of skills) {
        if (Object.prototype.hasOwnProperty.call(desiredActual, skill.name)) continue
        desiredActual[skill.name] = null
        if (skill.currentVersionId !== null) {
          yield* _(this.repositories.skillRepository.patchById(String(skill.id), {
            currentVersionId: null,
            updatedBy: CATALOG_OWNER,
          }))
        }
      }
      const receipt: OfficialCatalogReceiptV1 = {
        schemaVersion: 1,
        kind: 'aops-official-catalog-receipt-v1',
        receiptId: receiptIdFor(plan.idempotencyKey),
        operation: 'reconcile',
        scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
        scopeId: snapshot.scopeId,
        projectId: snapshot.projectId,
        catalogRevision: snapshot.catalogRevision + 1,
        releaseSetSha256: plan.releaseSetSha256,
        priorCurrentVersionMap: sortedMap(snapshot.currentVersionMap),
        currentVersionMap: sortedMap(desiredActual),
        packageSha256: [...new Set(packages.map((entry) => entry.packageSha256))].sort(compareUtf8),
        historyDeleteCount: 0,
        activationEffects: [],
        previousReceiptId: snapshot.lastReceiptId,
        createdAt: new Date().toISOString(),
      }
      yield* _(this.persistReceipt({
        scopeId: snapshot.scopeId,
        idempotencyKey: plan.idempotencyKey,
        requestSha256,
        receipt,
      }))
      yield* _(this.updateState(snapshot.scopeId, currentState, receipt))
      return receipt
    }))
  }

  rollback(request: OfficialCatalogRollbackRequestV1): Effect.Effect<OfficialCatalogReceiptV1, SkillServiceError> {
    return this.runAtomic(() => Effect.gen(this, function* (_) {
      assertExactScope(request.scope)
      if (
        request.schemaVersion !== 1 ||
        request.kind !== 'aops-official-catalog-rollback-request-v1' ||
        request.deleteHistory !== false ||
        !Array.isArray(request.activationEffects) ||
        request.activationEffects.length !== 0
      ) throw catalogError('rollback_request_invalid')
      const idempotencyKey = nonEmpty(request.idempotencyKey, 'request.idempotencyKey')
      const targetReceiptId = nonEmpty(request.receiptId, 'request.receiptId')
      const requestSha256 = sha256Bytes(stableObject(request))
      const snapshot = yield* _(this.inspectInternal(true))
      if (snapshot.state !== 'ready' || !snapshot.scopeId || !snapshot.projectId) throw catalogError('state_missing')
      const existing = yield* _(this.findIdempotentReceipt(snapshot.scopeId, idempotencyKey, requestSha256))
      if (existing) {
        if (existing.operation !== 'rollback') throw catalogError('idempotency_conflict')
        return existing
      }
      if (request.expectedCatalogRevision !== snapshot.catalogRevision) throw catalogError('compare_and_swap_conflict')
      const targetResource = yield* _(this.findReceipt(snapshot.scopeId, targetReceiptId))
      if (!targetResource) throw catalogError('rollback_receipt_not_found', targetReceiptId)
      const target = parseReceiptResource(targetResource).receipt
      if (target.scopeId !== snapshot.scopeId || target.projectId !== snapshot.projectId) {
        throw catalogError('rollback_receipt_scope_conflict', targetReceiptId)
      }
      const versionById = new Map(snapshot.versions.map((entry) => [entry.recordId, entry]))
      for (const [name, recordId] of Object.entries(target.priorCurrentVersionMap)) {
        const version = recordId === null ? null : versionById.get(recordId)
        if (recordId !== null && (!version || version.name !== name)) {
          throw catalogError('rollback_version_missing', recordId)
        }
      }
      const skills = yield* _(this.repositories.skillRepository.find({ matchEq: { scopeId: snapshot.scopeId } } as never))
      const skillByName = new Map(skills.map((skill) => [skill.name, skill]))
      for (const name of Object.keys(target.priorCurrentVersionMap)) {
        if (!skillByName.has(name)) throw catalogError('rollback_skill_missing', name)
      }
      for (const skill of skills) {
        const desired = target.priorCurrentVersionMap[skill.name] ?? null
        if ((skill.currentVersionId ?? null) === desired) continue
        yield* _(this.repositories.skillRepository.patchById(String(skill.id), {
          currentVersionId: desired,
          updatedBy: CATALOG_OWNER,
        }))
      }
      const currentState: CatalogStateMeta = {
        schemaVersion: 1,
        scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
        catalogRevision: snapshot.catalogRevision,
        currentVersionMap: sortedMap(snapshot.currentVersionMap),
        lastReceiptId: snapshot.lastReceiptId,
      }
      const receipt: OfficialCatalogReceiptV1 = {
        schemaVersion: 1,
        kind: 'aops-official-catalog-receipt-v1',
        receiptId: receiptIdFor(idempotencyKey),
        operation: 'rollback',
        scopeSlug: OFFICIAL_CATALOG_SCOPE_SLUG,
        scopeId: snapshot.scopeId,
        projectId: snapshot.projectId,
        catalogRevision: snapshot.catalogRevision + 1,
        releaseSetSha256: target.releaseSetSha256,
        priorCurrentVersionMap: sortedMap(snapshot.currentVersionMap),
        currentVersionMap: sortedMap(target.priorCurrentVersionMap),
        packageSha256: [...target.packageSha256].sort(compareUtf8),
        historyDeleteCount: 0,
        activationEffects: [],
        previousReceiptId: snapshot.lastReceiptId,
        createdAt: new Date().toISOString(),
      }
      yield* _(this.persistReceipt({
        scopeId: snapshot.scopeId,
        idempotencyKey,
        requestSha256,
        targetReceiptId,
        receipt,
      }))
      yield* _(this.updateState(snapshot.scopeId, currentState, receipt))
      return receipt
    }))
  }
}
