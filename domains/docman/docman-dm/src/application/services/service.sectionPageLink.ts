import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortSectionPageLink } from '../ports/repository-ports/index.js'
import type { ISectionPageLinkServicePort } from '../ports/inbound/index.js'
import { SectionPageLinkServiceError } from '../errors/SectionPageLinkServiceError.js'
import { IbmSectionPageLink, IbmSectionPageLinkInsert, sectionPageLinkZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface SectionPageLinkServiceDependencies {}

export interface SectionPageLinkServiceOptions {
  sectionPageLinkRepository: IRepositoryPortSectionPageLink
  serviceDependencies?: Partial<SectionPageLinkServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class SectionPageLinkService implements ISectionPageLinkServicePort {
  private readonly sectionPageLinkRepository: IRepositoryPortSectionPageLink
  private readonly logger?: XfLogger

  constructor(options: SectionPageLinkServiceOptions) {
    this.sectionPageLinkRepository = options.sectionPageLinkRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmSectionPageLink>): Effect.Effect<IbmSectionPageLink | null, SectionPageLinkServiceError> {
    const stage = 'SectionPageLinkService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.sectionPageLinkRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmSectionPageLinkInsert): Effect.Effect<IbmSectionPageLink, SectionPageLinkServiceError> {
    const stage = 'SectionPageLinkService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: sectionPageLinkZodSchemaInsert,
          stage,
          operation: 'SectionPageLinkService::create.sectionPageLinkZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.sectionPageLinkRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  
  listSectionPageLinks(filter: Partial<IbmSectionPageLink> = {}, options?: DbQueryOptions<IbmSectionPageLink>): Effect.Effect<IbmSectionPageLink[], SectionPageLinkServiceError> {
    const stage = 'SectionPageLinkService::listSectionPageLinks'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.sectionPageLinkRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listSectionPageLinks')
      }))
    )
  }

  updateSectionPageLink(id: string, patch: Partial<IbmSectionPageLink>): Effect.Effect<IbmSectionPageLink, SectionPageLinkServiceError> {
    const stage = 'SectionPageLinkService::updateSectionPageLink'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: sectionPageLinkZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SectionPageLinkService::updateSectionPageLink.sectionPageLinkZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.sectionPageLinkRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSectionPageLink')
      }))
    )
  }

  removeSectionPageLink(id: string): Effect.Effect<void, SectionPageLinkServiceError> {
    const stage = 'SectionPageLinkService::removeSectionPageLink'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.sectionPageLinkRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmSectionPageLink | null, SectionPageLinkServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
