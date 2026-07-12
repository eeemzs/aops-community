import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortProjectMember } from '../ports/repository-ports/index.js'
import type { IProjectMemberServicePort } from '../ports/inbound/index.js'
import { ProjectMemberServiceError } from '../errors/ProjectMemberServiceError.js'
import { IbmProjectMember, IbmProjectMemberInsert, projectMemberZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface ProjectMemberServiceDependencies {}

export interface ProjectMemberServiceOptions {
  projectMemberRepository: IRepositoryPortProjectMember
  serviceDependencies?: Partial<ProjectMemberServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class ProjectMemberService implements IProjectMemberServicePort {
  private readonly projectMemberRepository: IRepositoryPortProjectMember
  private readonly logger?: XfLogger

  constructor(options: ProjectMemberServiceOptions) {
    this.projectMemberRepository = options.projectMemberRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmProjectMember>): Effect.Effect<IbmProjectMember | null, ProjectMemberServiceError> {
    const stage = 'ProjectMemberService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.projectMemberRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmProjectMemberInsert): Effect.Effect<IbmProjectMember, ProjectMemberServiceError> {
    const stage = 'ProjectMemberService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: projectMemberZodSchemaInsert,
          stage,
          operation: 'ProjectMemberService::create.projectMemberZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) =>
        this.projectMemberRepository.create(data).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    )
  }

  listProjectMembers(
    filter: Partial<IbmProjectMember> = {},
    options?: DbQueryOptions<IbmProjectMember>
  ): Effect.Effect<IbmProjectMember[], ProjectMemberServiceError> {
    const stage = 'ProjectMemberService::listProjectMembers'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.projectMemberRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listProjectMembers')
      }))
    )
  }

  updateProjectMember(id: string, patch: Partial<IbmProjectMember>): Effect.Effect<IbmProjectMember, ProjectMemberServiceError> {
    const stage = 'ProjectMemberService::updateProjectMember'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: projectMemberZodSchemaInsert.partial().strict(),
          stage,
          operation: 'ProjectMemberService::updateProjectMember.projectMemberZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((memberId) => this.projectMemberRepository.patchById(memberId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateProjectMember')
      }))
    )
  }

  removeProjectMember(id: string): Effect.Effect<void, ProjectMemberServiceError> {
    const stage = 'ProjectMemberService::removeProjectMember'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((memberId) => this.projectMemberRepository.deleteById(memberId).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.map(() => undefined)
    )
  }
}
