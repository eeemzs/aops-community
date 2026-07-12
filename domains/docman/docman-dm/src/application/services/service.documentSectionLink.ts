import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortDocumentSectionLink } from '../ports/repository-ports/index.js'
import type { IDocumentSectionLinkServicePort } from '../ports/inbound/index.js'
import { DocumentSectionLinkServiceError } from '../errors/DocumentSectionLinkServiceError.js'
import {
  IbmDocumentSectionLink,
  IbmDocumentSectionLinkInsert,
  documentSectionLinkZodSchemaInsert,
  documentSectionLinkZodSchemaPatch,
} from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import type { DocumentSectionLinkUsageItem } from '../ports/repository-ports/IRepositoryPortDocumentSectionLink.js'

export interface DocumentSectionLinkServiceDependencies {}

export interface DocumentSectionLinkServiceOptions {
  documentSectionLinkRepository: IRepositoryPortDocumentSectionLink
  serviceDependencies?: Partial<DocumentSectionLinkServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class DocumentSectionLinkService implements IDocumentSectionLinkServicePort {
  private readonly documentSectionLinkRepository: IRepositoryPortDocumentSectionLink
  private readonly logger?: XfLogger

  constructor(options: DocumentSectionLinkServiceOptions) {
    this.documentSectionLinkRepository = options.documentSectionLinkRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmDocumentSectionLink>): Effect.Effect<IbmDocumentSectionLink | null, DocumentSectionLinkServiceError> {
    const stage = 'DocumentSectionLinkService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.documentSectionLinkRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmDocumentSectionLinkInsert): Effect.Effect<IbmDocumentSectionLink, DocumentSectionLinkServiceError> {
    const stage = 'DocumentSectionLinkService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: documentSectionLinkZodSchemaInsert,
          stage,
          operation: 'DocumentSectionLinkService::create.documentSectionLinkZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.documentSectionLinkRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  
  listDocumentSectionLinks(filter: Partial<IbmDocumentSectionLink> = {}, options?: DbQueryOptions<IbmDocumentSectionLink>): Effect.Effect<IbmDocumentSectionLink[], DocumentSectionLinkServiceError> {
    const stage = 'DocumentSectionLinkService::listDocumentSectionLinks'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.documentSectionLinkRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listDocumentSectionLinks')
      }))
    )
  }

  updateDocumentSectionLink(id: string, patch: Partial<IbmDocumentSectionLink>): Effect.Effect<IbmDocumentSectionLink, DocumentSectionLinkServiceError> {
    const stage = 'DocumentSectionLinkService::updateDocumentSectionLink'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: documentSectionLinkZodSchemaPatch,
          stage,
          operation: 'DocumentSectionLinkService::updateDocumentSectionLink.documentSectionLinkZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.documentSectionLinkRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateDocumentSectionLink')
      }))
    )
  }

  removeDocumentSectionLink(id: string): Effect.Effect<void, DocumentSectionLinkServiceError> {
    const stage = 'DocumentSectionLinkService::removeDocumentSectionLink'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.documentSectionLinkRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }

  listDocumentSectionLinkUsageBySectionId(
    sectionId: string,
  ): Effect.Effect<DocumentSectionLinkUsageItem[], DocumentSectionLinkServiceError> {
    const stage = 'DocumentSectionLinkService::listDocumentSectionLinkUsageBySectionId'
    return pipe(
      validateInput(sectionId, 'sectionId', { stage }),
      Effect.flatMap((id) =>
        this.documentSectionLinkRepository.listDocumentSectionLinkUsageBySectionId(id).pipe(
          Effect.mapError(
            mapDbError({
              stage,
              operation: 'listDocumentSectionLinkUsageBySectionId',
              factory: XfErrorFactory.notFound,
            }),
          ),
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listDocumentSectionLinkUsageBySectionId')
        })
      )
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmDocumentSectionLink | null, DocumentSectionLinkServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
