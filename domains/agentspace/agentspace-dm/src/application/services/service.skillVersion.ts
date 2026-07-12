import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortSkillVersion } from '../ports/repository-ports/index.js'
import {
  CANONICAL_SKILL_PACKAGE_ENTRY_FILE,
  CANONICAL_SKILL_PACKAGE_FORMAT,
  CANONICAL_SKILL_PACKAGE_STANDARD,
} from '../ports/inbound/index.js'
import type {
  ExportSkillPackageResult,
  ImportSkillPackageInput,
  ImportSkillPackageResult,
  ISkillVersionServicePort,
  ISkillServicePort,
  IResourceServicePort,
  MaterializeSkillPackageInput,
  MaterializeSkillPackageResult,
  SkillPackageFileInput,
  SkillPackageMetadata,
} from '../ports/inbound/index.js'
import { SkillVersionServiceError } from '../errors/SkillVersionServiceError.js'
import { IbmResource, IbmResourceInsert, IbmSkill, IbmSkillVersion, IbmSkillVersionInsert, skillVersionZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface SkillVersionServiceDependencies {}

export interface SkillVersionServiceOptions {
  skillVersionRepository: IRepositoryPortSkillVersion
  skillService: ISkillServicePort
  resourceService?: IResourceServicePort
  serviceDependencies?: Partial<SkillVersionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

const SKILL_PACKAGE_ENTRY_FILE: typeof CANONICAL_SKILL_PACKAGE_ENTRY_FILE = 'SKILL.md'
const SKILL_PACKAGE_STANDARD: typeof CANONICAL_SKILL_PACKAGE_STANDARD = 'aops-skill-package-v1'
const SKILL_PACKAGE_FORMAT: typeof CANONICAL_SKILL_PACKAGE_FORMAT = 'filesystem-skill-package'
const SKILL_PACKAGE_TAG = 'skill-package'
const SKILL_PACKAGE_FILE_LIMIT = 256
const SKILL_PACKAGE_FILE_MAX_BYTES = 512 * 1024
const SKILL_PACKAGE_TOTAL_MAX_BYTES = 4 * 1024 * 1024

type NormalizedSkillPackageFile = SkillPackageFileInput & {
  sizeBytes: number
  sha256: string
}

type NormalizedSkillPackageBundle = {
  entryFile: string
  files: NormalizedSkillPackageFile[]
}

type ParsedFrontmatter = {
  attributes: Record<string, string>
  body: string
  hasFrontmatter: boolean
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function selectHighestSkillVersion<T extends { version?: number | null }>(versions: readonly T[] | null | undefined): T | undefined {
  let highest: T | undefined
  let highestVersion = Number.NEGATIVE_INFINITY
  for (const version of versions ?? []) {
    const numericVersion = Number(version?.version ?? 0)
    if (!Number.isFinite(numericVersion)) continue
    if (!highest || numericVersion > highestVersion) {
      highest = version
      highestVersion = numericVersion
    }
  }
  return highest
}

function inferMimeType(filePath: string): string {
  const lowered = filePath.toLowerCase()
  if (lowered.endsWith('.md')) return 'text/markdown'
  if (lowered.endsWith('.yaml') || lowered.endsWith('.yml')) return 'application/yaml'
  if (lowered.endsWith('.json')) return 'application/json'
  if (lowered.endsWith('.txt')) return 'text/plain'
  return 'text/plain'
}

function normalizeSkillFilePath(raw: unknown, stage: string): string {
  const value = normalizeNonEmpty(raw)
  if (!value) {
    throw XfErrorFactory.inputRequired({ field: 'bundle.files[].path', stage })
  }

  const normalized = value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')

  if (!normalized || normalized.startsWith('/')) {
    throw XfErrorFactory.createFailed({
      stage,
      message: `invalid_skill_file_path:${value}`,
    })
  }

  const parts = normalized.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw XfErrorFactory.createFailed({
      stage,
      message: `invalid_skill_file_path:${value}`,
    })
  }

  return parts.join('/')
}

function parseSimpleYamlMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = raw.split(/\r?\n/g)
  for (const lineRaw of lines) {
    const line = lineRaw.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if (!key) continue
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function parseMarkdownFrontmatter(markdown: string): ParsedFrontmatter {
  const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/)
  if (!frontmatterMatch) {
    return {
      attributes: {},
      body: markdown,
      hasFrontmatter: false,
    }
  }

  const raw = frontmatterMatch[1] ?? ''
  const attributes = parseSimpleYamlMap(raw)
  const body = markdown.slice(frontmatterMatch[0].length)
  return { attributes, body, hasFrontmatter: true }
}

function normalizeSkillPackageBundle(data: ImportSkillPackageInput, stage: string): NormalizedSkillPackageBundle {
  const bundle = data.bundle
  const entryFileRaw = normalizeNonEmpty(bundle?.entryFile) ?? SKILL_PACKAGE_ENTRY_FILE
  const entryFile = normalizeSkillFilePath(entryFileRaw, stage)
  if (entryFile !== SKILL_PACKAGE_ENTRY_FILE) {
    throw XfErrorFactory.createFailed({
      stage,
      message: `skill_package_entry_file_must_be_${SKILL_PACKAGE_ENTRY_FILE}`,
    })
  }

  const rawFiles = Array.isArray(bundle?.files) ? bundle.files : []
  if (rawFiles.length === 0) {
    throw XfErrorFactory.inputRequired({ field: 'bundle.files', stage })
  }
  if (rawFiles.length > SKILL_PACKAGE_FILE_LIMIT) {
    throw XfErrorFactory.createFailed({
      stage,
      message: `skill_package_file_count_exceeded:${rawFiles.length}`,
    })
  }

  const seen = new Set<string>()
  const files: NormalizedSkillPackageFile[] = []
  let totalBytes = 0

  for (const raw of rawFiles) {
    const normalizedPath = normalizeSkillFilePath(raw?.path, stage)
    const lowered = normalizedPath.toLowerCase()
    if (seen.has(lowered)) {
      throw XfErrorFactory.createFailed({
        stage,
        message: `duplicate_skill_file_path:${normalizedPath}`,
      })
    }
    seen.add(lowered)

    if (typeof raw?.content !== 'string') {
      throw XfErrorFactory.inputRequired({ field: `bundle.files[${normalizedPath}].content`, stage })
    }

    const sizeBytes = Buffer.byteLength(raw.content, 'utf8')
    totalBytes += sizeBytes
    if (sizeBytes > SKILL_PACKAGE_FILE_MAX_BYTES) {
      throw XfErrorFactory.createFailed({
        stage,
        message: `skill_package_file_too_large:${normalizedPath}:${sizeBytes}`,
      })
    }
    if (totalBytes > SKILL_PACKAGE_TOTAL_MAX_BYTES) {
      throw XfErrorFactory.createFailed({
        stage,
        message: `skill_package_bundle_too_large:${totalBytes}`,
      })
    }

    const sha256 = createHash('sha256').update(raw.content).digest('hex')
    files.push({
      path: normalizedPath,
      content: raw.content,
      kind: normalizeNonEmpty(raw.kind),
      encoding: normalizeNonEmpty(raw.encoding) ?? 'utf-8',
      mimeType: normalizeNonEmpty(raw.mimeType) ?? inferMimeType(normalizedPath),
      sizeBytes,
      sha256,
    })
  }

  if (!files.some((file) => file.path === SKILL_PACKAGE_ENTRY_FILE)) {
    throw XfErrorFactory.createFailed({
      stage,
      message: `missing_required_skill_file:${SKILL_PACKAGE_ENTRY_FILE}`,
    })
  }

  return {
    entryFile: SKILL_PACKAGE_ENTRY_FILE,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  }
}

function toSkillTags(baseTags?: string[]): string[] {
  const merged = new Set<string>()
  for (const tag of baseTags ?? []) {
    const normalized = normalizeNonEmpty(tag)
    if (normalized) merged.add(normalized)
  }
  merged.add(SKILL_PACKAGE_TAG)
  return [...merged]
}

function toSkillPackageMetadata(files: NormalizedSkillPackageFile[]): Array<Record<string, unknown>> {
  return files.map((file) => ({
    path: file.path,
    kind: file.kind,
    encoding: file.encoding,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
  }))
}

function toVersionFiles(files: NormalizedSkillPackageFile[]): SkillPackageFileInput[] {
  return files.map((file) => ({
    path: file.path,
    content: file.content,
    kind: file.kind,
    encoding: file.encoding,
    mimeType: file.mimeType,
  }))
}

function toSkillPackageFilesFromVersion(version: IbmSkillVersion): SkillPackageFileInput[] {
  const byPath = new Map<string, SkillPackageFileInput>()
  const rawFiles = Array.isArray(version.files) ? version.files : []

  for (const raw of rawFiles) {
    if (!isRecord(raw)) continue
    const maybePath = normalizeNonEmpty(raw.path)
    const maybeContent = typeof raw.content === 'string' ? raw.content : undefined
    if (!maybePath || maybeContent === undefined) continue

    byPath.set(maybePath.toLowerCase(), {
      path: maybePath,
      content: maybeContent,
      kind: normalizeNonEmpty(raw.kind),
      encoding: normalizeNonEmpty(raw.encoding),
      mimeType: normalizeNonEmpty(raw.mimeType),
    })
  }

  const entryFile = normalizeNonEmpty(version.entryFile) ?? SKILL_PACKAGE_ENTRY_FILE
  if (!byPath.has(entryFile.toLowerCase())) {
    byPath.set(entryFile.toLowerCase(), {
      path: entryFile,
      content: version.content,
      kind: 'instruction',
      encoding: 'utf-8',
      mimeType: inferMimeType(entryFile),
    })
  }

  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path))
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export class SkillVersionService implements ISkillVersionServicePort {
  private readonly skillVersionRepository: IRepositoryPortSkillVersion
  private readonly skillService: ISkillServicePort
  private readonly resourceService?: IResourceServicePort
  private readonly logger?: XfLogger

  constructor(options: SkillVersionServiceOptions) {
    this.skillVersionRepository = options.skillVersionRepository
    this.skillService = options.skillService
    this.resourceService = options.resourceService
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  private syncSkillCurrentVersion(
    skillId: string,
    updatedBy?: string | null
  ): Effect.Effect<void, SkillVersionServiceError> {
    const stage = 'SkillVersionService::syncSkillCurrentVersion'
    return pipe(
      this.skillVersionRepository.find({
        matchEq: { skillId, status: 'published' },
      } as any),
      Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
      Effect.flatMap((versions) => {
        const nextId = selectHighestSkillVersion(versions)?.id ?? null
        const patch: Partial<IbmSkill> = {
          currentVersionId: nextId,
        }
        const normalizedUpdatedBy = normalizeNonEmpty(updatedBy)
        if (normalizedUpdatedBy !== undefined) {
          patch.updatedBy = normalizedUpdatedBy
        }
        return this.skillService.updateSkill(skillId, patch).pipe(
          Effect.mapError((cause) =>
            XfErrorFactory.upsertFailed({ stage, operation: 'skillService.updateSkill', cause })
          ),
          Effect.as(undefined)
        )
      })
    )
  }

  getById(id: string, options?: DbQueryOptions<IbmSkillVersion>): Effect.Effect<IbmSkillVersion | null, SkillVersionServiceError> {
    const stage = 'SkillVersionService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.skillVersionRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmSkillVersionInsert): Effect.Effect<IbmSkillVersion, SkillVersionServiceError> {
    const stage = 'SkillVersionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: skillVersionZodSchemaInsert,
          stage,
          operation: 'SkillVersionService::create.skillVersionZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) =>
        this.skillVersionRepository.create(
          data.status === 'published' && !data.publishedAt
            ? ({ ...data, publishedAt: new Date() } as IbmSkillVersionInsert)
            : data
        ).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })),
          Effect.flatMap((created) => {
            if (created?.skillId && created.status === 'published') {
              return this.syncSkillCurrentVersion(created.skillId, created.updatedBy).pipe(
                Effect.as(created)
              )
            }
            return Effect.succeed(created)
          })
        )
      )
    )
  }

  getSkillVersion(id: string, options?: DbQueryOptions<IbmSkillVersion>): Effect.Effect<IbmSkillVersion | null, SkillVersionServiceError> {
    return this.getById(id, options)
  }

  listSkillVersions(
    filter: Partial<IbmSkillVersion> = {},
    options?: DbQueryOptions<IbmSkillVersion>
  ): Effect.Effect<IbmSkillVersion[], SkillVersionServiceError> {
    const stage = 'SkillVersionService::listSkillVersions'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.skillVersionRepository.find({ matchEq: filter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listSkillVersions')
        })
      )
    )
  }

  updateSkillVersion(id: string, patch: Partial<IbmSkillVersion>): Effect.Effect<IbmSkillVersion, SkillVersionServiceError> {
    const stage = 'SkillVersionService::updateSkillVersion'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: skillVersionZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SkillVersionService::updateSkillVersion.skillVersionZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((versionId) =>
        this.getById(versionId).pipe(
          Effect.flatMap((current) =>
            current
              ? Effect.succeed(current)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: versionId }))
          ),
          Effect.flatMap((current) => {
            const shouldSyncCurrentVersion =
              typeof patch.status === 'string' && patch.status.trim().length > 0
            const normalizedPatch: Partial<IbmSkillVersion> = { ...patch }
            if (normalizedPatch.status === 'published' && !normalizedPatch.publishedAt) {
              normalizedPatch.publishedAt = new Date()
            }
            return this.skillVersionRepository.patchById(versionId, normalizedPatch).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
              Effect.flatMap((updated) => {
                if (shouldSyncCurrentVersion && current.skillId) {
                  return this.syncSkillCurrentVersion(current.skillId, normalizedPatch.updatedBy).pipe(
                    Effect.as(updated)
                  )
                }
                return Effect.succeed(updated)
              })
            )
          })
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSkillVersion')
        })
      )
    )
  }

  removeSkillVersion(id: string): Effect.Effect<void, SkillVersionServiceError> {
    const stage = 'SkillVersionService::removeSkillVersion'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((versionId) =>
        this.getById(versionId).pipe(
          Effect.flatMap((current) =>
            current
              ? Effect.succeed(current)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: versionId }))
          ),
          Effect.flatMap((current) =>
            this.skillVersionRepository.deleteById(versionId).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed })),
              Effect.flatMap(() => {
                if (current.status === 'published' && current.skillId) {
                  return this.syncSkillCurrentVersion(current.skillId, current.updatedBy).pipe(
                    Effect.as(undefined)
                  )
                }
                return Effect.succeed(undefined)
              })
            )
          )
        )
      ),
      Effect.map(() => undefined)
    )
  }

  publishSkillVersion(id: string, updatedBy?: string): Effect.Effect<IbmSkillVersion, SkillVersionServiceError> {
    const stage = 'SkillVersionService::publishSkillVersion'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() =>
        this.getById(id).pipe(
          Effect.flatMap((version) =>
            version
              ? Effect.succeed(version)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: id }))
          )
        )
      ),
      Effect.flatMap((version) => {
        const patch: Partial<IbmSkillVersion> = {
          status: 'published',
          publishedAt: version.publishedAt ?? new Date(),
        }
        if (updatedBy !== undefined) {
          patch.updatedBy = updatedBy
        }
        return this.skillVersionRepository.patchById(id, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
          Effect.flatMap((updated) => {
            if (!version.skillId) return Effect.succeed(updated)
            return this.syncSkillCurrentVersion(version.skillId, updatedBy).pipe(
              Effect.as(updated)
            )
          })
        )
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in publishSkillVersion')
      }))
    )
  }

  private upsertSkillVersionResource(params: {
    skill: IbmSkill
    skillVersion: IbmSkillVersion
    description: string
    files: NormalizedSkillPackageFile[]
    createdBy?: string
    updatedBy?: string
  }): Effect.Effect<IbmResource | undefined, SkillVersionServiceError> {
    const stage = 'SkillVersionService::upsertSkillVersionResource'
    const resourceService = this.resourceService
    if (!resourceService) return Effect.succeed(undefined)

    const { skill, skillVersion, description, files, createdBy, updatedBy } = params
    const skillId = normalizeNonEmpty(skill.id)
    const skillVersionId = normalizeNonEmpty(skillVersion.id)
    if (!skillId || !skillVersionId) {
      return Effect.fail(
        XfErrorFactory.createFailed({
          stage,
          message: 'missing_skill_or_version_id',
        })
      )
    }

    const resourceName = `${skill.name} v${skillVersion.version}`
    const resourceScopeId = normalizeNonEmpty(skill.scopeId)
    const resourceMeta = {
      skillId,
      skillVersionId,
      skillStandard: normalizeNonEmpty(skillVersion.skillStandard) ?? SKILL_PACKAGE_STANDARD,
      entryFile: normalizeNonEmpty(skillVersion.entryFile) ?? SKILL_PACKAGE_ENTRY_FILE,
      packageFormat: SKILL_PACKAGE_FORMAT,
      fileCount: files.length,
      files: toSkillPackageMetadata(files),
      updatedAt: new Date().toISOString(),
    }

    if (!resourceScopeId) {
      return Effect.fail(
        XfErrorFactory.createFailed({
          stage,
          message: 'missing_skill_scope_id',
        })
      )
    }

    const resourceFilter: Partial<IbmResource> = {
      scopeId: resourceScopeId,
      refType: 'skill-version',
      refId: skillVersionId,
    }

    return Effect.gen(function* (_) {
      const existing = yield* _(
        resourceService.listResources(resourceFilter, { limit: 1 } as any).pipe(
          Effect.mapError((cause): SkillVersionServiceError =>
            XfErrorFactory.upsertFailed({
              stage,
              operation: 'resourceService.listResources',
              cause,
            })
          )
        )
      )

      const currentId = normalizeNonEmpty(existing?.[0]?.id)
      if (currentId) {
        return yield* _(
          resourceService.updateResource(currentId, {
            scopeId: resourceScopeId,
            name: resourceName,
            description,
            resourceType: 'skill',
            uri: `skill://${skillId}/versions/${skillVersion.version}`,
            tags: toSkillTags(skill.tags),
            refType: 'skill-version',
            refId: skillVersionId,
            meta: resourceMeta,
            updatedBy,
          }).pipe(
            Effect.mapError((cause): SkillVersionServiceError =>
              XfErrorFactory.upsertFailed({
                stage,
                operation: 'resourceService.updateResource',
                cause,
              })
            )
          )
        )
      }

      const insertPayload: IbmResourceInsert = {
        scopeId: resourceScopeId,
        name: resourceName,
        description,
        resourceType: 'skill',
        uri: `skill://${skillId}/versions/${skillVersion.version}`,
        tags: toSkillTags(skill.tags),
        refType: 'skill-version',
        refId: skillVersionId,
        meta: resourceMeta,
        createdBy,
        updatedBy,
      }

      return yield* _(
        resourceService.createResource(insertPayload).pipe(
          Effect.mapError((cause): SkillVersionServiceError =>
            XfErrorFactory.createFailed({
              stage,
              operation: 'resourceService.createResource',
              cause,
            })
          )
        )
      )
    })
  }

  importSkillPackage(data: ImportSkillPackageInput): Effect.Effect<ImportSkillPackageResult, SkillVersionServiceError> {
    const stage = 'SkillVersionService::importSkillPackage'
    const self = this
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) =>
        Effect.gen(function* (_) {
          const projectId = normalizeNonEmpty(payload.projectId) ?? normalizeNonEmpty(payload.scopeId)
          const scopeType = payload.scopeType
          if (scopeType !== 'project') {
            return yield* _(Effect.fail(XfErrorFactory.createFailed({ stage, message: 'scope_type_project_required' })))
          }
          if (!projectId) {
            return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'projectId', stage })))
          }

          const scopeId = normalizeNonEmpty(payload.scopeId) ?? projectId
          if (!scopeId) {
            return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'scopeId', stage })))
          }

          const normalizedBundle = yield* _(
            Effect.try({
              try: () => normalizeSkillPackageBundle(payload, stage),
              catch: (cause) =>
                XfErrorFactory.createFailed({
                  stage,
                  operation: 'normalizeSkillPackageBundle',
                  cause,
                }),
            })
          )

          const entryFile = normalizedBundle.files.find((file) => file.path === SKILL_PACKAGE_ENTRY_FILE)
          if (!entryFile) {
            return yield* _(
              Effect.fail(
                XfErrorFactory.createFailed({
                  stage,
                  message: `missing_required_skill_file:${SKILL_PACKAGE_ENTRY_FILE}`,
                })
              )
            )
          }

          const frontmatter = parseMarkdownFrontmatter(entryFile.content)
          const frontmatterName = normalizeNonEmpty(frontmatter.attributes.name)
          const frontmatterDescription = normalizeNonEmpty(frontmatter.attributes.description)

          const skillName = normalizeNonEmpty(payload.name) ?? frontmatterName
          if (!skillName) {
            return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'name', stage })))
          }

          const skillDescription = normalizeNonEmpty(payload.description) ?? frontmatterDescription
          if (!skillDescription) {
            return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'description', stage })))
          }

          const shortDescription =
            normalizeNonEmpty(payload.shortDescription) ??
            normalizeNonEmpty(frontmatter.body.split(/\r?\n/g).find((line) => line.trim().length > 0))

          const sourcePath = normalizeNonEmpty(payload.bundle.sourcePath)
          const bundleMetadata = isRecord(payload.bundle.metadata) ? payload.bundle.metadata : {}
          const tags = toSkillTags(payload.tags)

          let skill: IbmSkill
          const requestedSkillId = normalizeNonEmpty(payload.skillId)
          if (requestedSkillId) {
            const existing = yield* _(
              self.skillService.getById(requestedSkillId).pipe(
                Effect.mapError((cause) =>
                  XfErrorFactory.notFound({
                    stage,
                    operation: 'skillService.getById',
                    identifier: requestedSkillId,
                    cause,
                  })
                ),
              )
            )
            if (!existing) {
              return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: requestedSkillId })))
            }
            skill = existing
          } else {
            const skillFilter: Partial<IbmSkill> = {
              scopeId,
              name: skillName,
            }

            const existingSkills = yield* _(
              self.skillService.listSkills(skillFilter, { limit: 1 } as any).pipe(
                Effect.mapError((cause) =>
                  XfErrorFactory.upsertFailed({
                    stage,
                    operation: 'skillService.listSkills',
                    cause,
                  })
                )
              )
            )
            const existing = existingSkills?.[0]
            if (existing) {
              skill = existing
            } else {
              skill = yield* _(
                self.skillService.create({
                  scopeId,
                  name: skillName,
                  description: skillDescription,
                  shortDescription,
                  tags,
                  createdBy: normalizeNonEmpty(payload.createdBy),
                  updatedBy: normalizeNonEmpty(payload.updatedBy),
                }).pipe(
                  Effect.mapError((cause) =>
                    XfErrorFactory.createFailed({
                      stage,
                      operation: 'skillService.create',
                      cause,
                    })
                  ),
                )
              )
            }
          }

          const skillId = normalizeNonEmpty(skill.id)
          if (!skillId) {
            return yield* _(
              Effect.fail(
                XfErrorFactory.createFailed({
                  stage,
                  message: 'skill_id_missing_after_create_or_load',
                })
              )
            )
          }

          const skillPatch: Partial<IbmSkill> = {}
          if (skill.name !== skillName) skillPatch.name = skillName
          if (skill.description !== skillDescription) skillPatch.description = skillDescription
          if (shortDescription && skill.shortDescription !== shortDescription) {
            skillPatch.shortDescription = shortDescription
          }

          const mergedTags = toSkillTags([...(skill.tags ?? []), ...tags])
          const currentTags = JSON.stringify((skill.tags ?? []).slice().sort())
          const nextTags = JSON.stringify(mergedTags.slice().sort())
          if (currentTags !== nextTags) {
            skillPatch.tags = mergedTags
          }
          const updatedBy = normalizeNonEmpty(payload.updatedBy)
          if (updatedBy) {
            skillPatch.updatedBy = updatedBy
          }
          if (Object.keys(skillPatch).length > 0) {
            skill = yield* _(
              self.skillService.updateSkill(skillId, skillPatch).pipe(
                Effect.mapError((cause) =>
                  XfErrorFactory.upsertFailed({
                    stage,
                    operation: 'skillService.updateSkill',
                    cause,
                  })
                )
              )
            )
          }

          const latestVersions = yield* _(
            self.skillVersionRepository.find({
              matchEq: { skillId },
            } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
            )
          )
          const nextVersion = Number(selectHighestSkillVersion(latestVersions)?.version ?? 0) + 1
          const status = payload.publish === true ? 'published' : (payload.status ?? 'draft')

          const versionInsert: IbmSkillVersionInsert = {
            projectId,
            skillId,
            version: nextVersion,
            status,
            content: entryFile.content,
            entryFile: SKILL_PACKAGE_ENTRY_FILE,
            skillStandard: SKILL_PACKAGE_STANDARD,
            files: toVersionFiles(normalizedBundle.files),
            meta: {
              packageFormat: SKILL_PACKAGE_FORMAT,
              frontmatter: frontmatter.attributes,
              package: {
                entryFile: normalizedBundle.entryFile,
                standard: SKILL_PACKAGE_STANDARD,
                sourcePath: sourcePath ?? null,
                metadata: bundleMetadata,
                fileCount: normalizedBundle.files.length,
                files: toSkillPackageMetadata(normalizedBundle.files),
                importedAt: new Date().toISOString(),
              },
            },
            refType: 'skill',
            refId: skillId,
            createdBy: normalizeNonEmpty(payload.createdBy),
            updatedBy: updatedBy ?? normalizeNonEmpty(payload.createdBy),
            ...(status === 'published' ? { publishedAt: new Date() } : {}),
          }

          const skillVersion = yield* _(
            self.create(versionInsert).pipe(
              Effect.mapError((cause) =>
                XfErrorFactory.createFailed({
                  stage,
                  operation: 'create',
                  cause,
                })
              )
            )
          )

          const resource = yield* _(
            self.upsertSkillVersionResource({
              skill,
              skillVersion,
              description: skillDescription,
              files: normalizedBundle.files,
              createdBy: normalizeNonEmpty(payload.createdBy),
              updatedBy,
            })
          )

          return {
            skill,
            skillVersion,
            ...(resource ? { resource } : {}),
          } satisfies ImportSkillPackageResult
        })
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in importSkillPackage')
      }))
    )
  }

  exportSkillPackage(id: string): Effect.Effect<ExportSkillPackageResult, SkillVersionServiceError> {
    const stage = 'SkillVersionService::exportSkillPackage'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((skillVersionId) =>
        this.getById(skillVersionId).pipe(
          Effect.flatMap((version) =>
            version
              ? Effect.succeed(version)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: skillVersionId }))
          )
        )
      ),
      Effect.flatMap((version) =>
        this.skillService.getById(version.skillId).pipe(
          Effect.map((skill) => ({ version, skill })),
          Effect.mapError((cause) =>
            XfErrorFactory.notFound({
              stage,
              operation: 'skillService.getById',
              identifier: version.skillId,
              cause,
            })
          )
        )
      ),
      Effect.flatMap(({ version, skill }) => {
        const skillVersionId = normalizeNonEmpty(version.id)
        if (!skillVersionId) {
          return Effect.fail(
            XfErrorFactory.createFailed({
              stage,
              message: 'skill_version_id_missing',
            })
          )
        }
        const metadata = isRecord(version.meta) ? version.meta : {}
        const packageRecord = isRecord(metadata.package) ? metadata.package : {}
        const packageMetadata = (isRecord(packageRecord.metadata) ? packageRecord.metadata : {}) as SkillPackageMetadata
        const files = toSkillPackageFilesFromVersion(version)
        const entryFile = normalizeNonEmpty(version.entryFile) ?? SKILL_PACKAGE_ENTRY_FILE
        const skillStandard = normalizeNonEmpty(version.skillStandard) ?? SKILL_PACKAGE_STANDARD
        const packageSourcePath = normalizeNonEmpty(packageRecord.sourcePath)
        const scopeId = normalizeNonEmpty(skill?.scopeId) ?? normalizeNonEmpty(version.projectId)
        const projectId = normalizeNonEmpty(version.projectId)
        if (!projectId || !scopeId) {
          return Effect.fail(
            XfErrorFactory.createFailed({
              stage,
              message: 'skill_version_project_scope_missing',
            })
          )
        }
        return Effect.succeed({
          skillVersionId,
          skillId: version.skillId,
          skillName: skill?.name,
          projectId,
          scopeId,
          files,
          metadata: packageMetadata,
          package: {
            entryFile,
            standard: skillStandard,
            format: SKILL_PACKAGE_FORMAT,
            fileCount: files.length,
            ...(packageSourcePath ? { sourcePath: packageSourcePath } : {}),
            ...(Object.keys(packageMetadata).length > 0 ? { metadata: packageMetadata } : {}),
          },
        } satisfies ExportSkillPackageResult)
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in exportSkillPackage')
      }))
    )
  }

  materializeSkillPackage(
    id: string,
    data: MaterializeSkillPackageInput
  ): Effect.Effect<MaterializeSkillPackageResult, SkillVersionServiceError> {
    const stage = 'SkillVersionService::materializeSkillPackage'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((skillVersionId) =>
        validateInput(data, 'data', { stage }).pipe(
          Effect.flatMap((payload) => {
            const outputDir = normalizeNonEmpty(payload.outputDir)
            if (!outputDir) {
              return Effect.fail(XfErrorFactory.inputRequired({ field: 'outputDir', stage }))
            }

            return pipe(
              this.exportSkillPackage(skillVersionId),
              Effect.flatMap((bundle) =>
                Effect.tryPromise({
                  try: async () => {
                    const rootDir = path.resolve(outputDir)
                    const overwrite = payload.overwrite === true
                    const writtenFiles: MaterializeSkillPackageResult['writtenFiles'] = []

                    for (const file of bundle.files) {
                      const relativePath = normalizeSkillFilePath(file.path, stage)
                      const fullPath = path.resolve(rootDir, relativePath)
                      const relativeFromRoot = path.relative(rootDir, fullPath)
                      if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
                        throw XfErrorFactory.createFailed({
                          stage,
                          message: `invalid_materialize_path:${relativePath}`,
                        })
                      }

                      if (!overwrite && (await fileExists(fullPath))) {
                        throw XfErrorFactory.createFailed({
                          stage,
                          message: `materialize_conflict:${relativePath}`,
                        })
                      }

                      await mkdir(path.dirname(fullPath), { recursive: true })
                      await writeFile(fullPath, file.content, 'utf8')
                      writtenFiles.push({
                        path: relativePath,
                        fullPath,
                        sizeBytes: Buffer.byteLength(file.content, 'utf8'),
                      })
                    }

                    return {
                      skillVersionId,
                      outputDir: rootDir,
                      writtenFiles,
                    } satisfies MaterializeSkillPackageResult
                  },
                  catch: (cause) =>
                    XfErrorFactory.createFailed({
                      stage,
                      operation: 'materialize',
                      cause,
                    }),
                })
              )
            )
          })
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in materializeSkillPackage')
      }))
    )
  }
}
