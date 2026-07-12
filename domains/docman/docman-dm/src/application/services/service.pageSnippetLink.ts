import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortPageSnippetLink } from '../ports/repository-ports/index.js'
import type { IPageSnippetLinkServicePort } from '../ports/inbound/index.js'
import { PageSnippetLinkServiceError } from '../errors/PageSnippetLinkServiceError.js'
import { IbmPageSnippetLink, IbmPageSnippetLinkInsert, pageSnippetLinkZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface PageSnippetLinkServiceDependencies {}

export interface PageSnippetLinkServiceOptions {
  pageSnippetLinkRepository: IRepositoryPortPageSnippetLink
  serviceDependencies?: Partial<PageSnippetLinkServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class PageSnippetLinkService implements IPageSnippetLinkServicePort {
  private readonly pageSnippetLinkRepository: IRepositoryPortPageSnippetLink
  private readonly logger?: XfLogger

  constructor(options: PageSnippetLinkServiceOptions) {
    this.pageSnippetLinkRepository = options.pageSnippetLinkRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmPageSnippetLink>): Effect.Effect<IbmPageSnippetLink | null, PageSnippetLinkServiceError> {
    const stage = 'PageSnippetLinkService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.pageSnippetLinkRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmPageSnippetLinkInsert): Effect.Effect<IbmPageSnippetLink, PageSnippetLinkServiceError> {
    const stage = 'PageSnippetLinkService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: pageSnippetLinkZodSchemaInsert,
          stage,
          operation: 'PageSnippetLinkService::create.pageSnippetLinkZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.pageSnippetLinkRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  
  listPageSnippetLinks(filter: Partial<IbmPageSnippetLink> = {}, options?: DbQueryOptions<IbmPageSnippetLink>): Effect.Effect<IbmPageSnippetLink[], PageSnippetLinkServiceError> {
    const stage = 'PageSnippetLinkService::listPageSnippetLinks'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.pageSnippetLinkRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listPageSnippetLinks')
      }))
    )
  }

  updatePageSnippetLink(id: string, patch: Partial<IbmPageSnippetLink>): Effect.Effect<IbmPageSnippetLink, PageSnippetLinkServiceError> {
    const stage = 'PageSnippetLinkService::updatePageSnippetLink'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: pageSnippetLinkZodSchemaInsert.partial().strict(),
          stage,
          operation: 'PageSnippetLinkService::updatePageSnippetLink.pageSnippetLinkZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.pageSnippetLinkRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updatePageSnippetLink')
      }))
    )
  }

  removePageSnippetLink(id: string): Effect.Effect<void, PageSnippetLinkServiceError> {
    const stage = 'PageSnippetLinkService::removePageSnippetLink'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.pageSnippetLinkRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmPageSnippetLink | null, PageSnippetLinkServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}

