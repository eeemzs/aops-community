import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import { randomUUID } from 'node:crypto'
import type { IRepositoryPortProject, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { IProjectServicePort } from '../ports/inbound/index.js'
import { ProjectServiceError } from '../errors/ProjectServiceError.js'
import { IbmProject, IbmProjectInsert, projectZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface ProjectServiceDependencies {}

export interface ProjectServiceOptions {
  projectRepository: IRepositoryPortProject
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<ProjectServiceDependencies>
  logger?: XfLogger
  locale?: string
}

type ExplicitIdCreateRepository<TModel> = {
  createPreservingId?: (data: TModel) => Effect.Effect<TModel, unknown>
}

export class ProjectService implements IProjectServicePort {
  private readonly projectRepository: IRepositoryPortProject
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: ProjectServiceOptions) {
    this.projectRepository = options.projectRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmProject>): Effect.Effect<IbmProject | null, ProjectServiceError> {
    const stage = 'ProjectService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.projectRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        if ((info.unwrapped as { _tag?: string } | undefined)?._tag === 'NotFoundError') return
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmProjectInsert): Effect.Effect<IbmProject, ProjectServiceError> {
    const stage = 'ProjectService::create'
    return Effect.gen(this, function* (_) {
      const raw = yield* _(validateInput(data, 'data', { stage }))
      const parsed = yield* _(
        validateBmInputWithSchema({
          input: raw,
          schema: projectZodSchemaInsert,
          stage,
          operation: 'ProjectService::create.projectZodSchemaInsert',
          field: 'data',
        }),
      )

      const id = randomUUID()
      const scopeId = id
      if (!this.scopeRepository) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'scopeRepository' })))
      }

      const scopeRepository = this.scopeRepository as IRepositoryPortScope & ExplicitIdCreateRepository<any>
      const createScope =
        typeof scopeRepository.createPreservingId === 'function'
          ? scopeRepository.createPreservingId.bind(scopeRepository)
          : scopeRepository.create.bind(scopeRepository)

      const projectScope = yield* _(
        createScope({
          id: scopeId,
          type: 'project',
          parentScopeId: null,
          createdBy: (parsed as any).createdBy,
          updatedBy: (parsed as any).updatedBy,
        } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'scope.create', factory: XfErrorFactory.createFailed })),
        ),
      )
      const persistedScopeId = String((projectScope as any)?.id ?? scopeId).trim()
      if (!persistedScopeId) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'project-scope' })))
      }

      const projectRepository = this.projectRepository as IRepositoryPortProject & ExplicitIdCreateRepository<any>
      const createProject =
        typeof projectRepository.createPreservingId === 'function'
          ? projectRepository.createPreservingId.bind(projectRepository)
          : projectRepository.create.bind(projectRepository)

      return yield* _(
        createProject({ ...parsed, id, scopeId: persistedScopeId } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })),
        ),
      )
    })
  }

  getProject(id: string, options?: DbQueryOptions<IbmProject>): Effect.Effect<IbmProject | null, ProjectServiceError> {
    return this.getById(id, options)
  }

  listProjects(
    filter: Partial<IbmProject> = {},
    options?: DbQueryOptions<IbmProject>
  ): Effect.Effect<IbmProject[], ProjectServiceError> {
    const stage = 'ProjectService::listProjects'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.projectRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listProjects')
      }))
    )
  }

  updateProject(id: string, patch: Partial<IbmProject>): Effect.Effect<IbmProject, ProjectServiceError> {
    const stage = 'ProjectService::updateProject'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: projectZodSchemaInsert.partial().strict(),
          stage,
          operation: 'ProjectService::updateProject.projectZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((projectId) =>
        this.projectRepository.patchById(projectId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateProject')
      }))
    )
  }

  setProjectType(id: string, projectType: IbmProject['projectType']): Effect.Effect<IbmProject, ProjectServiceError> {
    const stage = 'ProjectService::setProjectType'
    return pipe(
      validateInput(projectType, 'projectType', { stage }),
      Effect.flatMap(() => this.updateProject(id, { projectType })),
    )
  }

  setProjectVisibility(id: string, visibility: IbmProject['visibility']): Effect.Effect<IbmProject, ProjectServiceError> {
    const stage = 'ProjectService::setProjectVisibility'
    return pipe(
      validateInput(visibility, 'visibility', { stage }),
      Effect.flatMap(() => this.updateProject(id, { visibility })),
    )
  }

  archiveProject(id: string): Effect.Effect<IbmProject, ProjectServiceError> {
    const stage = 'ProjectService::archiveProject'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() => this.updateProject(id, { status: 'archived' }))
    )
  }

  removeProject(id: string): Effect.Effect<void, ProjectServiceError> {
    const stage = 'ProjectService::removeProject'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((projectId) =>
        this.projectRepository.deleteById(projectId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}
