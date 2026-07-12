import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortIssueItem } from '../ports/repository-ports/index.js'
import type { IIssueItemServicePort, IssueItemCreateInput } from '../ports/inbound/index.js'
import { IssueItemServiceError } from '../errors/IssueItemServiceError.js'
import { IbmIssueItem, IbmIssueItemInsert, issueItemZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface IssueItemServiceDependencies {}

export interface IssueItemServiceOptions {
  issueItemRepository: IRepositoryPortIssueItem
  serviceDependencies?: Partial<IssueItemServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class IssueItemService implements IIssueItemServicePort {
  private readonly issueItemRepository: IRepositoryPortIssueItem
  private readonly logger?: XfLogger

  constructor(options: IssueItemServiceOptions) {
    this.issueItemRepository = options.issueItemRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmIssueItem>): Effect.Effect<IbmIssueItem | null, IssueItemServiceError> {
    const stage = 'IssueItemService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.issueItemRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmIssueItemInsert): Effect.Effect<IbmIssueItem, IssueItemServiceError> {
    const stage = 'IssueItemService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: issueItemZodSchemaInsert,
          stage,
          operation: 'IssueItemService::create.issueItemZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.issueItemRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createIssue(input: IssueItemCreateInput): Effect.Effect<IbmIssueItem, IssueItemServiceError> {
    const stage = 'IssueItemService::createIssue'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => {
        const normalized: IbmIssueItemInsert = {
          ...payload,
          status: payload.status ?? 'open',
          severity: payload.severity ?? 'medium',
          source: payload.source ?? 'human',
          openedAt: payload.openedAt ?? new Date(),
        } as IbmIssueItemInsert
        return this.create(normalized)
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createIssue')
      }))
    )
  }

  updateIssue(id: string, patch: Partial<IbmIssueItem>): Effect.Effect<IbmIssueItem, IssueItemServiceError> {
    const stage = 'IssueItemService::updateIssue'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: issueItemZodSchemaInsert.partial().strict(),
          stage,
          operation: 'IssueItemService::updateIssue.issueItemZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((issueId) => this.issueItemRepository.patchById(issueId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateIssue')
      }))
    )
  }

  listIssues(
    filter: Partial<IbmIssueItem> = {},
    options?: DbQueryOptions<IbmIssueItem>
  ): Effect.Effect<IbmIssueItem[], IssueItemServiceError> {
    const stage = 'IssueItemService::listIssues'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'createdAt', type: 'desc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.issueItemRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listIssues')
      }))
    )
  }

  removeIssue(id: string): Effect.Effect<void, IssueItemServiceError> {
    const stage = 'IssueItemService::removeIssue'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((issueId) =>
        this.issueItemRepository.deleteById(issueId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeIssue')
      }))
    )
  }
}
