import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortPage } from '../ports/repository-ports/index.js'
import type { IPageServicePort } from '../ports/inbound/index.js'
import { PageServiceError } from '../errors/PageServiceError.js'
import { IbmPage, IbmPageInsert, pageZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface PageServiceDependencies {}

export interface PageServiceOptions {
  pageRepository: IRepositoryPortPage
  serviceDependencies?: Partial<PageServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class PageService implements IPageServicePort {
  private readonly pageRepository: IRepositoryPortPage
  private readonly logger?: XfLogger

  constructor(options: PageServiceOptions) {
    this.pageRepository = options.pageRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmPage>): Effect.Effect<IbmPage | null, PageServiceError> {
    const stage = 'PageService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.pageRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmPageInsert): Effect.Effect<IbmPage, PageServiceError> {
    const stage = 'PageService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: pageZodSchemaInsert,
          stage,
          operation: 'PageService::create.pageZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.pageRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  
  listPages(filter: Partial<IbmPage> = {}, options?: DbQueryOptions<IbmPage>): Effect.Effect<IbmPage[], PageServiceError> {
    const stage = 'PageService::listPages'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.pageRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listPages')
      }))
    )
  }

  updatePage(id: string, patch: Partial<IbmPage>): Effect.Effect<IbmPage, PageServiceError> {
    const stage = 'PageService::updatePage'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: pageZodSchemaInsert.partial().strict(),
          stage,
          operation: 'PageService::updatePage.pageZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.pageRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updatePage')
      }))
    )
  }

  removePage(id: string): Effect.Effect<void, PageServiceError> {
    const stage = 'PageService::removePage'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.pageRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmPage | null, PageServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}

