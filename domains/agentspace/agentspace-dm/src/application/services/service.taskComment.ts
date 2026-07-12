import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortTaskComment } from '../ports/repository-ports/index.js'
import type { ITaskCommentServicePort } from '../ports/inbound/index.js'
import { TaskCommentServiceError } from '../errors/TaskCommentServiceError.js'
import { IbmTaskComment, IbmTaskCommentInsert, taskCommentZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface TaskCommentServiceDependencies {}

export interface TaskCommentServiceOptions {
  taskCommentRepository: IRepositoryPortTaskComment
  serviceDependencies?: Partial<TaskCommentServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class TaskCommentService implements ITaskCommentServicePort {
  private readonly taskCommentRepository: IRepositoryPortTaskComment
  private readonly logger?: XfLogger

  constructor(options: TaskCommentServiceOptions) {
    this.taskCommentRepository = options.taskCommentRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment | null, TaskCommentServiceError> {
    const stage = 'TaskCommentService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.taskCommentRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmTaskCommentInsert): Effect.Effect<IbmTaskComment, TaskCommentServiceError> {
    const stage = 'TaskCommentService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: taskCommentZodSchemaInsert,
          stage,
          operation: 'TaskCommentService::create.taskCommentZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.taskCommentRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  listByTask(taskId: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment[], TaskCommentServiceError> {
    const stage = 'TaskCommentService::listByTask'
    return pipe(
      validateInput(taskId, 'taskId', { stage }),
      Effect.flatMap((taskId) => this.taskCommentRepository.find({ matchEq: { taskId }, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listByTask')
      }))
    )
  }

  listByProject(projectId: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment[], TaskCommentServiceError> {
    const stage = 'TaskCommentService::listByProject'
    return pipe(
      validateInput(projectId, 'projectId', { stage }),
      Effect.flatMap((projectId) => this.taskCommentRepository.find({ matchEq: { projectId }, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listByProject')
      }))
    )
  }
}
