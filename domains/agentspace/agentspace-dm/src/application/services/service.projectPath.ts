import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortProjectPath } from '../ports/repository-ports/index.js'
import type { IProjectPathServicePort } from '../ports/inbound/index.js'
import { ProjectPathServiceError } from '../errors/ProjectPathServiceError.js'
import { IbmProjectPath, IbmProjectPathInsert, projectPathZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface ProjectPathServiceDependencies {}

export interface ProjectPathServiceOptions {
  projectPathRepository: IRepositoryPortProjectPath
  serviceDependencies?: Partial<ProjectPathServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class ProjectPathService implements IProjectPathServicePort {
  private readonly projectPathRepository: IRepositoryPortProjectPath
  private readonly logger?: XfLogger

  constructor(options: ProjectPathServiceOptions) {
    this.projectPathRepository = options.projectPathRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmProjectPath>): Effect.Effect<IbmProjectPath | null, ProjectPathServiceError> {
    const stage = 'ProjectPathService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.projectPathRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmProjectPathInsert): Effect.Effect<IbmProjectPath, ProjectPathServiceError> {
    const stage = 'ProjectPathService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: projectPathZodSchemaInsert,
          stage,
          operation: 'ProjectPathService::create.projectPathZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.projectPathRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  listProjectPaths(
    filter: Partial<IbmProjectPath> = {},
    options?: DbQueryOptions<IbmProjectPath>
  ): Effect.Effect<IbmProjectPath[], ProjectPathServiceError> {
    const stage = 'ProjectPathService::listProjectPaths'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.projectPathRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listProjectPaths')
      }))
    )
  }

  updateProjectPath(id: string, patch: Partial<IbmProjectPath>): Effect.Effect<IbmProjectPath, ProjectPathServiceError> {
    const stage = 'ProjectPathService::updateProjectPath'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: projectPathZodSchemaInsert.partial().strict(),
          stage,
          operation: 'ProjectPathService::updateProjectPath.projectPathZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((pathId) => this.projectPathRepository.patchById(pathId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateProjectPath')
      }))
    )
  }

  upsertProjectPath(data: IbmProjectPathInsert): Effect.Effect<IbmProjectPath, ProjectPathServiceError> {
    const stage = 'ProjectPathService::upsertProjectPath'
    const self = this
    return Effect.gen(function* (_) {
      const payload = yield* _(validateInput(data, 'data', { stage }))
      yield* _(
        validateBmInputWithSchema({
          input: payload,
          schema: projectPathZodSchemaInsert,
          stage,
          operation: 'ProjectPathService::upsertProjectPath.projectPathZodSchemaInsert',
          field: 'data',
        })
      )
      const matches = yield* _(
        self.projectPathRepository.find({
          matchEq: {
            projectId: payload.projectId,
            pathKey: payload.pathKey,
          },
          options: { limit: 1 },
        } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.upsertFailed }))
        )
      )

      const existing = Array.isArray(matches) ? matches[0] : undefined
      if (!existing?.id) {
        return yield* _(
          self.projectPathRepository.create(payload).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.upsertFailed }))
          )
        )
      }

      const patch: Partial<IbmProjectPath> = {
        path: payload.path,
        description: payload.description,
        updatedBy: payload.updatedBy,
      }

      return yield* _(
        self.projectPathRepository.patchById(existing.id, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      )
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in upsertProjectPath')
      }))
    )
  }

  removeProjectPath(id: string): Effect.Effect<void, ProjectPathServiceError> {
    const stage = 'ProjectPathService::removeProjectPath'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((pathId) => this.projectPathRepository.deleteById(pathId).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.map(() => undefined)
    )
  }
}
