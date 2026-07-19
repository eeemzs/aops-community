import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { createHash } from 'node:crypto'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type {
  IRepositoryPortProject,
  IRepositoryPortResource,
  IRepositoryPortScope,
  IRepositoryPortSkill,
  IRepositoryPortSkillVersion,
} from '../ports/repository-ports/index.js'
import {
  CANONICAL_SKILL_PACKAGE_ENTRY_FILE,
  CANONICAL_SKILL_PACKAGE_STANDARD,
  SKILL_DISCOVERY_MAX_BYTES,
  SKILL_DISCOVERY_MAX_RESULTS,
  type ISkillServicePort,
  type SkillAskResult,
  type SkillDiscoveryCandidate,
  type SkillDiscoveryMatchField,
  type SkillListFilter,
  type SkillSearchResult,
  type OfficialCatalogReceiptV1,
  type OfficialCatalogReconcilePlanV1,
  type OfficialCatalogRollbackRequestV1,
  type OfficialCatalogScopeV1,
  type OfficialCatalogSnapshotV1,
} from '../ports/inbound/index.js'
import { SkillServiceError } from '../errors/SkillServiceError.js'
import { IbmSkill, IbmSkillInsert, IbmSkillVersion, skillZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, type IUnitOfWork, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'
import type { ScopeResolution } from '../../domain/types.js'
import { OfficialCatalogService } from './service.officialCatalog.js'

export interface SkillServiceDependencies {}

export interface SkillServiceOptions {
  skillRepository: IRepositoryPortSkill
  skillVersionRepository?: IRepositoryPortSkillVersion
  scopeRepository?: IRepositoryPortScope
  projectRepository?: IRepositoryPortProject
  resourceRepository?: IRepositoryPortResource
  unitOfWork?: IUnitOfWork
  serviceDependencies?: Partial<SkillServiceDependencies>
  logger?: XfLogger
  locale?: string
}

const SKILL_DISCOVERY_QUERY_MAX_LENGTH = 256
const SKILL_DISCOVERY_SCAN_LIMIT = 10_000
const SKILL_PACKAGE_MANIFEST_META_KEY = 'packageManifestV1'
const SHA256_RE = /^[a-f0-9]{64}$/
const SKILL_DISCOVERY_META_FIELD_RE = /^meta\.[A-Za-z0-9_.-]+$/
const SKILL_DISCOVERY_META_KEYS = new Set([
  'aliases',
  'capabilities',
  'clifamilies',
  'domains',
  'keywords',
  'tags',
  'triggers',
])

const SKILL_DISCOVERY_FIELD_WEIGHT: Record<string, number> = {
  name: 120,
  tags: 70,
  shortDescription: 55,
  description: 35,
  version: 30,
  skillStandard: 24,
  entryFile: 16,
  meta: 60,
}

function normalizeDiscoveryText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function sha256PackageRecords(files: ReadonlyArray<{ path: string; sha256: string }>): string {
  const records = files
    .map((file) => ({ path: file.path.normalize('NFC'), sha256: file.sha256.toLowerCase() }))
    .sort((left, right) => compareUtf8(left.path, right.path))
  return createHash('sha256')
    .update(Buffer.concat(records.map((file) => Buffer.from(`${file.path}\0${file.sha256}\n`, 'utf8'))))
    .digest('hex')
}

function truncateDiscoveryText(value: unknown, maxLength: number): string | undefined {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!normalized) return undefined
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

function toDiscoveryTokens(query: string): string[] {
  return [...new Set(normalizeDiscoveryText(query).split(' ').filter(Boolean))].sort(compareUtf8)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectApprovedMetaFields(
  value: unknown,
  path: string[] = [],
  depth = 0,
): Array<{ field: SkillDiscoveryMatchField; value: string }> {
  if (!isRecord(value) || depth > 3) return []
  const out: Array<{ field: SkillDiscoveryMatchField; value: string }> = []
  const entries = Object.entries(value).sort(([left], [right]) => compareUtf8(left, right))

  for (const [key, raw] of entries) {
    const nextPath = [...path, key]
    const normalizedKey = normalizeDiscoveryText(key).replace(/\s+/g, '')
    if (SKILL_DISCOVERY_META_KEYS.has(normalizedKey)) {
      const values = Array.isArray(raw) ? raw : [raw]
      for (const item of values) {
        if (typeof item !== 'string' && typeof item !== 'number') continue
        const field = `meta.${nextPath.join('.')}` as SkillDiscoveryMatchField
        if (field.length > 96 || !SKILL_DISCOVERY_META_FIELD_RE.test(field)) continue
        out.push({ field, value: String(item) })
      }
      continue
    }
    if (isRecord(raw)) out.push(...collectApprovedMetaFields(raw, nextPath, depth + 1))
  }

  return out
}

type SkillDiscoveryIntegrity = {
  packageSha256: string
  contentSha256: string
  computedTrustClass: 'verified-hosted-package'
}

function readSkillDiscoveryIntegrity(skill: IbmSkill, version: IbmSkillVersion): SkillDiscoveryIntegrity | null {
  const skillName = typeof skill.name === 'string' ? skill.name.trim() : ''
  const versionId = String(version.id ?? '').trim()
  const meta = isRecord(version.meta) ? version.meta : null
  const manifest = meta && isRecord(meta[SKILL_PACKAGE_MANIFEST_META_KEY])
    ? meta[SKILL_PACKAGE_MANIFEST_META_KEY]
    : null
  if (!skillName || !versionId || !manifest) return null

  const entryFile = typeof version.entryFile === 'string' && version.entryFile.trim()
    ? version.entryFile.trim()
    : CANONICAL_SKILL_PACKAGE_ENTRY_FILE
  const skillStandard = typeof version.skillStandard === 'string' && version.skillStandard.trim()
    ? version.skillStandard.trim()
    : CANONICAL_SKILL_PACKAGE_STANDARD
  const packageSha256 = typeof manifest.packageSha256 === 'string' ? manifest.packageSha256 : ''
  const provenance = isRecord(manifest.provenance) ? manifest.provenance : null
  const compatibility = isRecord(manifest.compatibility) ? manifest.compatibility : null

  if (
    manifest.schemaVersion !== 1 ||
    manifest.assetKind !== 'skill-package' ||
    manifest.name !== skillName ||
    manifest.version !== String(version.version) ||
    manifest.versionId !== versionId ||
    manifest.entryFile !== entryFile ||
    manifest.standard !== skillStandard ||
    entryFile !== CANONICAL_SKILL_PACKAGE_ENTRY_FILE ||
    skillStandard !== CANONICAL_SKILL_PACKAGE_STANDARD ||
    !SHA256_RE.test(packageSha256) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length < 1 ||
    manifest.files.length > 256 ||
    !compatibility ||
    typeof compatibility.minCliVersion !== 'string' ||
    !compatibility.minCliVersion.trim() ||
    compatibility.maxSchemaVersion !== 1 ||
    !provenance ||
    provenance.trustClass !== 'verified-hosted-package' ||
    provenance.expectedDigestSource !== 'immutable-hosted-metadata' ||
    provenance.reference !== `skill-version:${versionId}`
  ) return null

  const files: Array<{ path: string; sha256: string }> = []
  const paths = new Set<string>()
  let contentSha256: string | null = null
  for (const row of manifest.files) {
    if (!isRecord(row)) return null
    const path = typeof row.path === 'string' ? row.path.trim().normalize('NFC') : ''
    const sha256 = typeof row.sha256 === 'string' ? row.sha256 : ''
    if (
      !path ||
      paths.has(path) ||
      !SHA256_RE.test(sha256) ||
      !Number.isSafeInteger(row.byteLength) ||
      Number(row.byteLength) < 0
    ) return null
    paths.add(path)
    files.push({ path, sha256 })
    if (path === entryFile) {
      if (contentSha256 !== null) return null
      contentSha256 = sha256
    }
  }
  if (!contentSha256 || sha256PackageRecords(files) !== packageSha256) return null

  return {
    packageSha256,
    contentSha256,
    computedTrustClass: 'verified-hosted-package',
  }
}

function buildDiscoveryRationale(matchedBy: readonly SkillDiscoveryMatchField[], score: number): string {
  const value = `Matched raw metadata: ${matchedBy.join(', ')}; score ${score}.`
  return truncateDiscoveryText(value, 160) ?? `Matched raw metadata; score ${score}.`
}

function fitDiscoveryCandidates(
  query: string,
  normalizedQuery: string,
  ranked: readonly SkillDiscoveryCandidate[],
): SkillDiscoveryCandidate[] {
  const selected: SkillDiscoveryCandidate[] = []
  for (const candidate of ranked) {
    const next = [...selected, candidate]
    const result = { query, normalizedQuery, count: next.length, candidates: next }
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > SKILL_DISCOVERY_MAX_BYTES) break
    selected.push(candidate)
  }
  return selected
}

function scoreDiscoveryField(
  rawValue: unknown,
  query: string,
  tokens: readonly string[],
  weight: number,
): number {
  const value = normalizeDiscoveryText(rawValue)
  if (!value) return 0
  let score = value === query ? weight * 3 : value.includes(query) ? weight * 2 : 0
  for (const token of tokens) {
    if (value === token) score += weight * 2
    else if (value.split(' ').includes(token)) score += weight
    else if (value.includes(token)) score += Math.max(1, Math.floor(weight / 2))
  }
  return score
}

function buildDiscoveryCandidate(
  skill: IbmSkill,
  version: IbmSkillVersion,
  normalizedQuery: string,
  tokens: readonly string[],
): SkillDiscoveryCandidate | null {
  const skillId = String(skill.id ?? '').trim()
  const versionId = String(version.id ?? '').trim()
  const name = truncateDiscoveryText(skill.name, 80)
  if (
    !skillId ||
    skillId.length > 160 ||
    !versionId ||
    versionId.length > 160 ||
    !name ||
    version.status !== 'published'
  ) return null
  const integrity = readSkillDiscoveryIntegrity(skill, version)
  if (!integrity) return null

  const fields: Array<{ field: SkillDiscoveryMatchField; value: unknown; weight: number }> = [
    { field: 'name', value: skill.name, weight: SKILL_DISCOVERY_FIELD_WEIGHT.name },
    { field: 'shortDescription', value: skill.shortDescription, weight: SKILL_DISCOVERY_FIELD_WEIGHT.shortDescription },
    { field: 'description', value: skill.description, weight: SKILL_DISCOVERY_FIELD_WEIGHT.description },
    { field: 'tags', value: (skill.tags ?? []).join(' '), weight: SKILL_DISCOVERY_FIELD_WEIGHT.tags },
    { field: 'version', value: String(version.version ?? ''), weight: SKILL_DISCOVERY_FIELD_WEIGHT.version },
    { field: 'entryFile', value: version.entryFile, weight: SKILL_DISCOVERY_FIELD_WEIGHT.entryFile },
    { field: 'skillStandard', value: version.skillStandard, weight: SKILL_DISCOVERY_FIELD_WEIGHT.skillStandard },
    ...collectApprovedMetaFields(version.meta).map((entry) => ({
      field: entry.field,
      value: entry.value,
      weight: SKILL_DISCOVERY_FIELD_WEIGHT.meta,
    })),
  ]

  let score = 0
  const matchedBy: SkillDiscoveryMatchField[] = []
  for (const field of fields) {
    const fieldScore = scoreDiscoveryField(field.value, normalizedQuery, tokens, field.weight)
    if (fieldScore <= 0) continue
    score += fieldScore
    if (!matchedBy.includes(field.field)) matchedBy.push(field.field)
  }
  if (score <= 0) return null

  const entryFile = truncateDiscoveryText(version.entryFile, 80) ?? 'SKILL.md'
  const skillStandard = truncateDiscoveryText(version.skillStandard, 80) ?? 'aops-skill-package-v1'
  const boundedMatchedBy = matchedBy.slice(0, 5)
  return {
    skillId,
    versionId,
    exactRef: `skill-version:${versionId}`,
    name,
    ...(truncateDiscoveryText(skill.shortDescription, 96)
      ? { shortDescription: truncateDiscoveryText(skill.shortDescription, 96) }
      : {}),
    version: String(version.version),
    entryFile,
    skillStandard,
    packageSha256: integrity.packageSha256,
    contentSha256: integrity.contentSha256,
    origin: 'hosted',
    computedTrustClass: integrity.computedTrustClass,
    score,
    matchedBy: boundedMatchedBy,
    rationale: buildDiscoveryRationale(boundedMatchedBy, score),
  }
}

export class SkillService implements ISkillServicePort {
  private readonly skillRepository: IRepositoryPortSkill
  private readonly skillVersionRepository?: IRepositoryPortSkillVersion
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly officialCatalogService?: OfficialCatalogService
  private readonly logger?: XfLogger

  constructor(options: SkillServiceOptions) {
    this.skillRepository = options.skillRepository
    this.skillVersionRepository = options.skillVersionRepository
    this.scopeRepository = options.scopeRepository
    if (
      options.skillVersionRepository &&
      options.scopeRepository &&
      options.projectRepository &&
      options.resourceRepository
    ) {
      this.officialCatalogService = new OfficialCatalogService({
        skillRepository: options.skillRepository,
        skillVersionRepository: options.skillVersionRepository,
        scopeRepository: options.scopeRepository,
        projectRepository: options.projectRepository,
        resourceRepository: options.resourceRepository,
        unitOfWork: options.unitOfWork,
      })
    }
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  inspectOfficialCatalog(scope: OfficialCatalogScopeV1): Effect.Effect<OfficialCatalogSnapshotV1, SkillServiceError> {
    return this.officialCatalogService
      ? this.officialCatalogService.inspect(scope)
      : Effect.fail(XfErrorFactory.createFailed({
        stage: 'SkillService::inspectOfficialCatalog',
        message: 'official_catalog_store_unavailable',
      }))
  }

  reconcileOfficialCatalog(plan: OfficialCatalogReconcilePlanV1): Effect.Effect<OfficialCatalogReceiptV1, SkillServiceError> {
    return this.officialCatalogService
      ? this.officialCatalogService.reconcile(plan)
      : Effect.fail(XfErrorFactory.createFailed({
        stage: 'SkillService::reconcileOfficialCatalog',
        message: 'official_catalog_store_unavailable',
      }))
  }

  rollbackOfficialCatalog(request: OfficialCatalogRollbackRequestV1): Effect.Effect<OfficialCatalogReceiptV1, SkillServiceError> {
    return this.officialCatalogService
      ? this.officialCatalogService.rollback(request)
      : Effect.fail(XfErrorFactory.createFailed({
        stage: 'SkillService::rollbackOfficialCatalog',
        message: 'official_catalog_store_unavailable',
      }))
  }

  getById(id: string, options?: DbQueryOptions<IbmSkill>): Effect.Effect<IbmSkill | null, SkillServiceError> {
    const stage = 'SkillService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.skillRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmSkillInsert): Effect.Effect<IbmSkill, SkillServiceError> {
    const stage = 'SkillService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: skillZodSchemaInsert,
          stage,
          operation: 'SkillService::create.skillZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.skillRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  getSkill(id: string, options?: DbQueryOptions<IbmSkill>): Effect.Effect<IbmSkill | null, SkillServiceError> {
    return this.getById(id, options)
  }

  listSkills(
    filter: SkillListFilter = {},
    options?: DbQueryOptions<IbmSkill>
  ): Effect.Effect<IbmSkill[], SkillServiceError> {
    const stage = 'SkillService::listSkills'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.skillRepository as any, this.scopeRepository, value, options, {
        stage,
        defaultResolution: 'cascade',
        dedupeKey: (item) => String(item?.name ?? '').trim().toLowerCase() || undefined,
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listSkills')
      }))
    )
  }

  searchSkills(
    query: string,
    scopeId?: string,
    scopeResolution?: ScopeResolution,
    limit?: number,
  ): Effect.Effect<SkillSearchResult, SkillServiceError> {
    const stage = 'SkillService::searchSkills'
    const self = this
    return Effect.gen(function* (_) {
      const normalizedRawQuery = typeof query === 'string' ? query.trim() : ''
      if (!normalizedRawQuery) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'query', stage })))
      }
      if (normalizedRawQuery.length > SKILL_DISCOVERY_QUERY_MAX_LENGTH) {
        return yield* _(
          Effect.fail(XfErrorFactory.createFailed({
            stage,
            message: `skill_discovery_query_too_long:${normalizedRawQuery.length}`,
          }))
        )
      }
      if (Buffer.byteLength(normalizedRawQuery, 'utf8') > SKILL_DISCOVERY_QUERY_MAX_LENGTH) {
        return yield* _(
          Effect.fail(XfErrorFactory.createFailed({
            stage,
            message: `skill_discovery_query_bytes_too_long:${Buffer.byteLength(normalizedRawQuery, 'utf8')}`,
          }))
        )
      }

      const normalizedQuery = normalizeDiscoveryText(normalizedRawQuery)
      const tokens = toDiscoveryTokens(normalizedRawQuery)
      if (!normalizedQuery || tokens.length === 0) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'query', stage })))
      }

      const requestedLimit = limit ?? SKILL_DISCOVERY_MAX_RESULTS
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > SKILL_DISCOVERY_MAX_RESULTS) {
        return yield* _(
          Effect.fail(XfErrorFactory.createFailed({
            stage,
            message: `skill_discovery_limit_out_of_range:${String(requestedLimit)}`,
          }))
        )
      }

      const versionRepository = self.skillVersionRepository
      if (!versionRepository) {
        return yield* _(
          Effect.fail(XfErrorFactory.createFailed({
            stage,
            message: 'skill_discovery_version_repository_required',
          }))
        )
      }

      const normalizedScopeId = typeof scopeId === 'string' ? scopeId.trim() : ''
      const filter: SkillListFilter = normalizedScopeId
        ? { scopeId: normalizedScopeId, scopeResolution: scopeResolution ?? 'explicit' }
        : {}
      const skills = yield* _(
        self.listSkills(filter, { limit: SKILL_DISCOVERY_SCAN_LIMIT } as DbQueryOptions<IbmSkill>)
      )

      const candidates = yield* _(
        Effect.all(
          skills.map((skill) => {
            const currentVersionId = String(skill.currentVersionId ?? '').trim()
            if (!currentVersionId) return Effect.succeed<SkillDiscoveryCandidate | null>(null)
            return versionRepository.findById(currentVersionId).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'skillVersionRepository.findById', factory: XfErrorFactory.notFound })),
              Effect.map((version) => {
                if (!version || version.id !== currentVersionId || version.skillId !== skill.id || version.status !== 'published') {
                  return null
                }
                return buildDiscoveryCandidate(skill, version, normalizedQuery, tokens)
              })
            )
          }),
          { concurrency: 16 },
        )
      )

      const ranked = candidates
        .filter((candidate): candidate is SkillDiscoveryCandidate => candidate !== null)
        .sort((left, right) =>
          right.score - left.score ||
          compareUtf8(normalizeDiscoveryText(left.name), normalizeDiscoveryText(right.name)) ||
          compareUtf8(left.versionId, right.versionId)
        )
        .slice(0, requestedLimit)
      const selected = fitDiscoveryCandidates(normalizedRawQuery, normalizedQuery, ranked)

      return {
        query: normalizedRawQuery,
        normalizedQuery,
        count: selected.length,
        candidates: selected,
      }
    }).pipe(
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        self.logger?.error({ error: info.unwrapped, stage }, 'Error in searchSkills')
      }))
    )
  }

  askSkills(
    query: string,
    scopeId?: string,
    scopeResolution?: ScopeResolution,
    limit?: number,
  ): Effect.Effect<SkillAskResult, SkillServiceError> {
    return this.searchSkills(query, scopeId, scopeResolution, limit).pipe(
      Effect.map((result) => {
        const candidates = [...result.candidates]
        while (true) {
          const answer = candidates.length === 0
            ? `No published hosted skill matched "${result.query}".`
            : candidates
              .map((candidate, index) => `${index + 1}. ${candidate.name} (${candidate.exactRef}); ${candidate.rationale}`)
              .join('\n')
          const projected = { ...result, count: candidates.length, candidates, answer }
          if (Buffer.byteLength(JSON.stringify(projected), 'utf8') <= SKILL_DISCOVERY_MAX_BYTES) return projected
          candidates.pop()
        }
      })
    )
  }

  updateSkill(id: string, patch: Partial<IbmSkill>): Effect.Effect<IbmSkill, SkillServiceError> {
    const stage = 'SkillService::updateSkill'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: skillZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SkillService::updateSkill.skillZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((skillId) =>
        this.skillRepository.patchById(skillId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSkill')
      }))
    )
  }

  removeSkill(id: string): Effect.Effect<void, SkillServiceError> {
    const stage = 'SkillService::removeSkill'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((skillId) =>
        this.skillRepository.deleteById(skillId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}
