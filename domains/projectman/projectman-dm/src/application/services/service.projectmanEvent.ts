import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortProjectmanEvent } from '../ports/repository-ports/index.js'
import type { IProjectmanEventServicePort, ProjectmanEventCreateInput } from '../ports/inbound/index.js'
import { ProjectmanEventServiceError } from '../errors/ProjectmanEventServiceError.js'
import { IbmProjectmanEvent, IbmProjectmanEventInsert, projectmanEventZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface ProjectmanEventServiceDependencies {}

export interface ProjectmanEventServiceOptions {
  projectmanEventRepository: IRepositoryPortProjectmanEvent
  serviceDependencies?: Partial<ProjectmanEventServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class ProjectmanEventService implements IProjectmanEventServicePort {
  private readonly projectmanEventRepository: IRepositoryPortProjectmanEvent
  private readonly logger?: XfLogger

  constructor(options: ProjectmanEventServiceOptions) {
    this.projectmanEventRepository = options.projectmanEventRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmProjectmanEvent>): Effect.Effect<IbmProjectmanEvent | null, ProjectmanEventServiceError> {
    const stage = 'ProjectmanEventService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.projectmanEventRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmProjectmanEventInsert): Effect.Effect<IbmProjectmanEvent, ProjectmanEventServiceError> {
    const stage = 'ProjectmanEventService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: projectmanEventZodSchemaInsert,
          stage,
          operation: 'ProjectmanEventService::create.projectmanEventZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.projectmanEventRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createEvent(input: ProjectmanEventCreateInput): Effect.Effect<IbmProjectmanEvent, ProjectmanEventServiceError> {
    const stage = 'ProjectmanEventService::createEvent'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => this.create(payload as IbmProjectmanEventInsert)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createEvent')
      }))
    )
  }

  listEvents(
    filter: Partial<IbmProjectmanEvent> = {},
    options?: DbQueryOptions<IbmProjectmanEvent>
  ): Effect.Effect<IbmProjectmanEvent[], ProjectmanEventServiceError> {
    const stage = 'ProjectmanEventService::listEvents'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.projectmanEventRepository.find({ matchEq: filter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listEvents')
      }))
    )
  }

  removeEvent(id: string): Effect.Effect<void, ProjectmanEventServiceError> {
    const stage = 'ProjectmanEventService::removeEvent'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((eventId) =>
        this.projectmanEventRepository.deleteById(eventId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeEvent')
      }))
    )
  }
}
