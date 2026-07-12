import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortDocumentGroup } from '../ports/repository-ports/index.js'
import type { IDocumentGroupServicePort } from '../ports/inbound/index.js'
import { DocumentGroupServiceError } from '../errors/DocumentGroupServiceError.js'
import { IbmDocumentGroup, IbmDocumentGroupInsert, documentGroupZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface DocumentGroupServiceDependencies {}

export interface DocumentGroupServiceOptions {
  documentGroupRepository: IRepositoryPortDocumentGroup
  serviceDependencies?: Partial<DocumentGroupServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class DocumentGroupService implements IDocumentGroupServicePort {
  private readonly documentGroupRepository: IRepositoryPortDocumentGroup
  private readonly logger?: XfLogger

  constructor(options: DocumentGroupServiceOptions) {
    this.documentGroupRepository = options.documentGroupRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmDocumentGroup>): Effect.Effect<IbmDocumentGroup | null, DocumentGroupServiceError> {
    const stage = 'DocumentGroupService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.documentGroupRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmDocumentGroupInsert): Effect.Effect<IbmDocumentGroup, DocumentGroupServiceError> {
    const stage = 'DocumentGroupService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: documentGroupZodSchemaInsert,
          stage,
          operation: 'DocumentGroupService::create.documentGroupZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.documentGroupRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  listDocumentGroups(filter: Partial<IbmDocumentGroup> = {}, options?: DbQueryOptions<IbmDocumentGroup>): Effect.Effect<IbmDocumentGroup[], DocumentGroupServiceError> {
    const stage = 'DocumentGroupService::listDocumentGroups'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.documentGroupRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listDocumentGroups')
      }))
    )
  }

  updateDocumentGroup(id: string, patch: Partial<IbmDocumentGroup>): Effect.Effect<IbmDocumentGroup, DocumentGroupServiceError> {
    const stage = 'DocumentGroupService::updateDocumentGroup'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: documentGroupZodSchemaInsert.partial().strict(),
          stage,
          operation: 'DocumentGroupService::updateDocumentGroup.documentGroupZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.documentGroupRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateDocumentGroup')
      }))
    )
  }

  removeDocumentGroup(id: string): Effect.Effect<void, DocumentGroupServiceError> {
    const stage = 'DocumentGroupService::removeDocumentGroup'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.documentGroupRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmDocumentGroup | null, DocumentGroupServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
