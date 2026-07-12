import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import { IRepositoryBase, IRepositoryContext, IUnitOfWork, DbQueryOptions, mapDbError, runInTransactionEffect } from '@aopslab/xf-db'
import type { IRepositoryPortPrompt, IRepositoryPortPromptVersion } from '../ports/repository-ports/index.js'
import type { IPromptVersionServicePort, IPromptServicePort } from '../ports/inbound/index.js'
import { PromptVersionServiceError } from '../errors/PromptVersionServiceError.js'
import { IbmPrompt, IbmPromptVersion, IbmPromptVersionInsert, promptVersionZodSchemaInsert } from '../../domain/models/index.js'
import type { PromptStatus } from '../../domain/types.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { PromptService } from './service.prompt.js'

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined
  return parsed
}

function normalizePromptStatusFromVersionStatus(value: unknown): PromptStatus | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'draft') return 'draft'
  if (normalized === 'published') return 'published'
  if (normalized === 'archived') return 'archived'
  return undefined
}

function selectHighestPromptVersion<T extends { version?: number | null }>(
  versions: readonly T[] | null | undefined
): T | undefined {
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

export interface PromptVersionServiceDependencies {}

export interface PromptVersionServiceOptions {
  promptVersionRepository: IRepositoryPortPromptVersion
  promptService: IPromptServicePort
  promptRepository?: IRepositoryPortPrompt
  unitOfWork?: IUnitOfWork
  serviceDependencies?: Partial<PromptVersionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class PromptVersionService implements IPromptVersionServicePort {
  private readonly promptVersionRepository: IRepositoryPortPromptVersion
  private readonly promptService: IPromptServicePort
  private readonly promptRepository?: IRepositoryPortPrompt
  private readonly unitOfWork?: IUnitOfWork
  private readonly logger?: XfLogger

  constructor(options: PromptVersionServiceOptions) {
    this.promptVersionRepository = options.promptVersionRepository
    this.promptService = options.promptService
    this.promptRepository = options.promptRepository
    this.unitOfWork = options.unitOfWork
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  private bindRepositoryContext(
    repository: unknown,
    ctx: IRepositoryContext | undefined
  ): repository is IRepositoryBase {
    if (!ctx || !repository || typeof repository !== 'object') return false
    return (
      typeof (repository as IRepositoryBase).setCtx === 'function' &&
      typeof (repository as IRepositoryBase).clearCtx === 'function'
    )
  }

  private createScopedPromptService(promptRepository?: IRepositoryPortPrompt): IPromptServicePort {
    if (!promptRepository) return this.promptService
    return new PromptService({
      promptRepository,
      logger: this.logger,
    })
  }

  private withRepositoryContext<R>(
    ctx: IRepositoryContext | undefined,
    program: () => Effect.Effect<R, PromptVersionServiceError>
  ): Effect.Effect<R, PromptVersionServiceError> {
    const scoped: IRepositoryBase[] = []
    if (this.bindRepositoryContext(this.promptVersionRepository, ctx)) scoped.push(this.promptVersionRepository)
    if (this.bindRepositoryContext(this.promptRepository, ctx)) scoped.push(this.promptRepository)

    return Effect.acquireUseRelease(
      Effect.sync(() => {
        for (const repository of scoped) repository.setCtx(ctx!)
      }),
      () => program(),
      () =>
        Effect.sync(() => {
          for (const repository of scoped) repository.clearCtx()
        })
    )
  }

  private runWriteEffect<R>(
    program: (deps: {
      promptService: IPromptServicePort
      promptVersionRepository: IRepositoryPortPromptVersion
    }) => Effect.Effect<R, PromptVersionServiceError>
  ): Effect.Effect<R, PromptVersionServiceError> {
    if (!this.unitOfWork || !this.promptRepository) {
      return program({
        promptService: this.promptService,
        promptVersionRepository: this.promptVersionRepository,
      })
    }

    return runInTransactionEffect(this.unitOfWork, (ctx) =>
      this.withRepositoryContext(ctx, () =>
        program({
          promptService: this.createScopedPromptService(this.promptRepository),
          promptVersionRepository: this.promptVersionRepository,
        })
      )
    )
  }

  private syncPromptLatestVersion(
    promptId: string,
    updatedBy?: string,
    deps?: {
      promptService?: IPromptServicePort
      promptVersionRepository?: IRepositoryPortPromptVersion
    }
  ): Effect.Effect<string | null, PromptVersionServiceError> {
    const stage = 'PromptVersionService::syncPromptLatestVersion'
    const normalizedUpdatedBy = normalizeNonEmpty(updatedBy)
    const promptVersionRepository = deps?.promptVersionRepository ?? this.promptVersionRepository
    const promptService = deps?.promptService ?? this.promptService
    return pipe(
      promptVersionRepository.find({
        matchEq: { promptId },
      } as any),
      Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
      Effect.flatMap((versions) => {
        const nextId = selectHighestPromptVersion(versions)?.id ?? null
        const patch: Partial<IbmPrompt> = {
          currentVersionId: nextId,
        }
        if (normalizedUpdatedBy) {
          patch.updatedBy = normalizedUpdatedBy
        }
        return promptService.updatePrompt(promptId, patch).pipe(
          Effect.mapError((cause) =>
            XfErrorFactory.upsertFailed({ stage, operation: 'promptService.updatePrompt', cause })
          ),
          Effect.as(nextId)
        )
      })
    )
  }

  private syncPromptStatus(
    promptId: string,
    status: PromptStatus,
    updatedBy?: string,
    deps?: {
      promptService?: IPromptServicePort
    }
  ): Effect.Effect<void, PromptVersionServiceError> {
    const stage = 'PromptVersionService::syncPromptStatus'
    const patch: Partial<IbmPrompt> = { status }
    const normalizedUpdatedBy = normalizeNonEmpty(updatedBy)
    const promptService = deps?.promptService ?? this.promptService
    if (normalizedUpdatedBy) {
      patch.updatedBy = normalizedUpdatedBy
    }
    return promptService.updatePrompt(promptId, patch).pipe(
      Effect.mapError((cause) =>
        XfErrorFactory.upsertFailed({ stage, operation: 'promptService.updatePrompt', cause })
      ),
      Effect.as(undefined)
    )
  }

  getById(id: string, options?: DbQueryOptions<IbmPromptVersion>): Effect.Effect<IbmPromptVersion | null, PromptVersionServiceError> {
    const stage = 'PromptVersionService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.promptVersionRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  private resolveCreateData(
    data: IbmPromptVersionInsert,
    deps?: {
      promptService?: IPromptServicePort
      promptVersionRepository?: IRepositoryPortPromptVersion
    }
  ): Effect.Effect<IbmPromptVersionInsert, PromptVersionServiceError> {
    const stage = 'PromptVersionService::resolveCreateData'
    const promptId = normalizeNonEmpty(data?.promptId)
    const promptService = deps?.promptService ?? this.promptService
    const promptVersionRepository = deps?.promptVersionRepository ?? this.promptVersionRepository
    if (!promptId) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'promptId', stage })).pipe(
        Effect.mapError((cause): PromptVersionServiceError => cause)
      )
    }

    return pipe(
      promptService.getById(promptId).pipe(
        Effect.mapError((cause) =>
          XfErrorFactory.createFailed({ stage, operation: 'promptService.getById', cause })
        )
      ),
      Effect.flatMap((prompt) =>
        prompt
          ? Effect.succeed(prompt)
          : Effect.fail(XfErrorFactory.notFound({ stage, identifier: promptId }))
      ),
      Effect.flatMap((prompt): Effect.Effect<IbmPromptVersionInsert, PromptVersionServiceError> => {
        const projectId = normalizeNonEmpty(data?.projectId) ?? normalizeNonEmpty(prompt.scopeId)
        if (!projectId) {
          return Effect.fail(XfErrorFactory.inputRequired({ field: 'projectId', stage })).pipe(
            Effect.mapError((cause): PromptVersionServiceError => cause)
          )
        }

        const explicitVersion = normalizePositiveInteger(data?.version)
        if (explicitVersion !== undefined) {
          return Effect.succeed({
            ...data,
            projectId,
            promptId,
            version: explicitVersion,
          } as IbmPromptVersionInsert)
        }

        return promptVersionRepository.find({
          matchEq: { promptId },
        } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.createFailed })),
          Effect.map((versions) => ({
            ...data,
            projectId,
            promptId,
            version: Number(selectHighestPromptVersion(versions)?.version ?? 0) + 1,
          } as IbmPromptVersionInsert)),
          Effect.mapError((cause): PromptVersionServiceError => cause)
        )
      }),
      Effect.mapError((cause): PromptVersionServiceError => cause)
    )
  }

  create(data: IbmPromptVersionInsert): Effect.Effect<IbmPromptVersion, PromptVersionServiceError> {
    const stage = 'PromptVersionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) => this.runWriteEffect(({ promptService, promptVersionRepository }) =>
        this.resolveCreateData(data, { promptService, promptVersionRepository }).pipe(
          Effect.flatMap((resolvedData) =>
            validateBmInputWithSchema({
              input: resolvedData,
              schema: promptVersionZodSchemaInsert,
              stage,
              operation: 'PromptVersionService::create.promptVersionZodSchemaInsert',
              field: 'data',
            })
          ),
          Effect.flatMap((resolvedData) => {
            const normalized =
              resolvedData.status === 'published' && !resolvedData.publishedAt
                ? ({ ...resolvedData, publishedAt: new Date() } as IbmPromptVersionInsert)
                : resolvedData

            return promptVersionRepository.create(normalized).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })),
              Effect.flatMap((created) => {
                if (created?.promptId) {
                  return this.syncPromptLatestVersion(created.promptId, created.updatedBy, {
                    promptService,
                    promptVersionRepository,
                  }).pipe(
                    Effect.flatMap(() => {
                      if (created.status !== 'published') return Effect.succeed(undefined)
                      return this.syncPromptStatus(created.promptId, 'published', created.updatedBy, {
                        promptService,
                      })
                    }),
                    Effect.as(created)
                  )
                }
                return Effect.succeed(created)
              })
            )
          })
        )
      ))
    )
  }

  getPromptVersion(id: string, options?: DbQueryOptions<IbmPromptVersion>): Effect.Effect<IbmPromptVersion | null, PromptVersionServiceError> {
    return this.getById(id, options)
  }

  listPromptVersions(
    filter: Partial<IbmPromptVersion> = {},
    options?: DbQueryOptions<IbmPromptVersion>
  ): Effect.Effect<IbmPromptVersion[], PromptVersionServiceError> {
    const stage = 'PromptVersionService::listPromptVersions'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.promptVersionRepository.find({ matchEq: filter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listPromptVersions')
        })
      )
    )
  }

  updatePromptVersion(id: string, patch: Partial<IbmPromptVersion>): Effect.Effect<IbmPromptVersion, PromptVersionServiceError> {
    const stage = 'PromptVersionService::updatePromptVersion'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) => this.runWriteEffect(({ promptService, promptVersionRepository }) =>
        validateBmInputWithSchema({
          input: patch,
          schema: promptVersionZodSchemaInsert.partial().strict(),
          stage,
          operation: 'PromptVersionService::updatePromptVersion.promptVersionZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.flatMap(() =>
            promptVersionRepository.findById(entityId).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
              Effect.flatMap((current) =>
                current
                  ? Effect.succeed(current)
                  : Effect.fail(XfErrorFactory.notFound({ stage, identifier: entityId }))
              )
            )
          ),
          Effect.flatMap((current) => {
            const normalizedPatch: Partial<IbmPromptVersion> = { ...patch }
            if (normalizedPatch.status === 'published' && !normalizedPatch.publishedAt) {
              normalizedPatch.publishedAt = new Date()
            }
            const promptStatusFromPatch = normalizePromptStatusFromVersionStatus(normalizedPatch.status)
            const shouldSyncLatestVersion = normalizedPatch.version !== undefined
            return promptVersionRepository.patchById(entityId, normalizedPatch).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
              Effect.flatMap((updated) => {
                if (!current.promptId) {
                  return Effect.succeed(updated)
                }

                let syncEffect: Effect.Effect<void, PromptVersionServiceError> = Effect.succeed(undefined)

                if (shouldSyncLatestVersion) {
                  syncEffect = pipe(
                    syncEffect,
                    Effect.flatMap(() =>
                      this.syncPromptLatestVersion(current.promptId as string, normalizedPatch.updatedBy, {
                        promptService,
                        promptVersionRepository,
                      }).pipe(Effect.as(undefined))
                    )
                  )
                }

                if (promptStatusFromPatch) {
                  syncEffect = pipe(
                    syncEffect,
                    Effect.flatMap(() =>
                      this.syncPromptStatus(
                        current.promptId as string,
                        promptStatusFromPatch,
                        normalizedPatch.updatedBy,
                        { promptService }
                      )
                    )
                  )
                }

                return syncEffect.pipe(Effect.as(updated))
              })
            )
          })
        )
      )),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updatePromptVersion')
        })
      )
    )
  }

  removePromptVersion(id: string): Effect.Effect<void, PromptVersionServiceError> {
    const stage = 'PromptVersionService::removePromptVersion'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((versionId) => this.runWriteEffect(({ promptService, promptVersionRepository }) =>
        promptVersionRepository.findById(versionId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
          Effect.flatMap((current) =>
            current
              ? Effect.succeed(current)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: versionId }))
          ),
          Effect.flatMap((current) =>
            promptVersionRepository.deleteById(versionId).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed })),
              Effect.flatMap(() => {
                if (!current.promptId) {
                  return Effect.succeed(undefined)
                }

                return this.syncPromptLatestVersion(current.promptId, current.updatedBy, {
                  promptService,
                  promptVersionRepository,
                }).pipe(
                  Effect.flatMap((nextId) => {
                    if (nextId !== null) return Effect.succeed(undefined)
                    return this.syncPromptStatus(current.promptId as string, 'draft', current.updatedBy, {
                      promptService,
                    })
                  }),
                  Effect.as(undefined)
                )
              })
            )
          )
        )
      )),
      Effect.map(() => undefined)
    )
  }

  publishPromptVersion(
    id: string,
    publishedAt?: Date,
    updatedBy?: string
  ): Effect.Effect<IbmPromptVersion, PromptVersionServiceError> {
    const stage = 'PromptVersionService::publishPromptVersion'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() => this.runWriteEffect(({ promptVersionRepository }) =>
        promptVersionRepository.findById(id).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
          Effect.flatMap((version) =>
            version
              ? Effect.succeed(version)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: id }))
          )
        )
      )),
      Effect.flatMap((version) => this.runWriteEffect(({ promptService, promptVersionRepository }) => {
        const resolvedPublishedAt = publishedAt ?? version.publishedAt ?? new Date()
        const patch: Partial<IbmPromptVersion> = {
          status: 'published',
          publishedAt: resolvedPublishedAt,
        }
        if (updatedBy !== undefined) {
          patch.updatedBy = updatedBy
        }
        return promptVersionRepository.patchById(id, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
          Effect.flatMap((updated) => {
            if (!version.promptId) return Effect.succeed(updated)
            return this.syncPromptLatestVersion(version.promptId, updatedBy, {
              promptService,
              promptVersionRepository,
            }).pipe(
              Effect.flatMap(() =>
                this.syncPromptStatus(version.promptId as string, 'published', updatedBy, {
                  promptService,
                })
              ),
              Effect.as(updated)
            )
          })
        )
      })),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in publishPromptVersion')
      }))
    )
  }
}
