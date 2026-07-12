import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortPageEmbedLink } from '../ports/repository-ports/index.js'
import type { IPageEmbedLinkServicePort } from '../ports/inbound/index.js'
import { PageEmbedLinkServiceError } from '../errors/PageEmbedLinkServiceError.js'
import { IbmPageEmbedLink, IbmPageEmbedLinkInsert, pageEmbedLinkZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface PageEmbedLinkServiceDependencies {}

export interface PageEmbedLinkServiceOptions {
  pageEmbedLinkRepository: IRepositoryPortPageEmbedLink
  serviceDependencies?: Partial<PageEmbedLinkServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class PageEmbedLinkService implements IPageEmbedLinkServicePort {
  private readonly pageEmbedLinkRepository: IRepositoryPortPageEmbedLink
  private readonly logger?: XfLogger

  constructor(options: PageEmbedLinkServiceOptions) {
    this.pageEmbedLinkRepository = options.pageEmbedLinkRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmPageEmbedLink>): Effect.Effect<IbmPageEmbedLink | null, PageEmbedLinkServiceError> {
    const stage = 'PageEmbedLinkService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.pageEmbedLinkRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmPageEmbedLinkInsert): Effect.Effect<IbmPageEmbedLink, PageEmbedLinkServiceError> {
    const stage = 'PageEmbedLinkService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: pageEmbedLinkZodSchemaInsert,
          stage,
          operation: 'PageEmbedLinkService::create.pageEmbedLinkZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.pageEmbedLinkRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  listPageEmbedLinks(filter: Partial<IbmPageEmbedLink> = {}, options?: DbQueryOptions<IbmPageEmbedLink>): Effect.Effect<IbmPageEmbedLink[], PageEmbedLinkServiceError> {
    const stage = 'PageEmbedLinkService::listPageEmbedLinks'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.pageEmbedLinkRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listPageEmbedLinks')
      }))
    )
  }

  updatePageEmbedLink(id: string, patch: Partial<IbmPageEmbedLink>): Effect.Effect<IbmPageEmbedLink, PageEmbedLinkServiceError> {
    const stage = 'PageEmbedLinkService::updatePageEmbedLink'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: pageEmbedLinkZodSchemaInsert.partial().strict(),
          stage,
          operation: 'PageEmbedLinkService::updatePageEmbedLink.pageEmbedLinkZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.pageEmbedLinkRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updatePageEmbedLink')
      }))
    )
  }

  removePageEmbedLink(id: string): Effect.Effect<void, PageEmbedLinkServiceError> {
    const stage = 'PageEmbedLinkService::removePageEmbedLink'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.pageEmbedLinkRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmPageEmbedLink | null, PageEmbedLinkServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
