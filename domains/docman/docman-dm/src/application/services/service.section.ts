import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortSection } from '../ports/repository-ports/index.js'
import type { ISectionServicePort } from '../ports/inbound/index.js'
import { SectionServiceError } from '../errors/SectionServiceError.js'
import { IbmSection, IbmSectionInsert, sectionZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface SectionServiceDependencies {}

export interface SectionServiceOptions {
  sectionRepository: IRepositoryPortSection
  serviceDependencies?: Partial<SectionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class SectionService implements ISectionServicePort {
  private readonly sectionRepository: IRepositoryPortSection
  private readonly logger?: XfLogger

  constructor(options: SectionServiceOptions) {
    this.sectionRepository = options.sectionRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmSection>): Effect.Effect<IbmSection | null, SectionServiceError> {
    const stage = 'SectionService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.sectionRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmSectionInsert): Effect.Effect<IbmSection, SectionServiceError> {
    const stage = 'SectionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: sectionZodSchemaInsert,
          stage,
          operation: 'SectionService::create.sectionZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.sectionRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  
  listSections(filter: Partial<IbmSection> = {}, options?: DbQueryOptions<IbmSection>): Effect.Effect<IbmSection[], SectionServiceError> {
    const stage = 'SectionService::listSections'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.sectionRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listSections')
      }))
    )
  }

  updateSection(id: string, patch: Partial<IbmSection>): Effect.Effect<IbmSection, SectionServiceError> {
    const stage = 'SectionService::updateSection'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: sectionZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SectionService::updateSection.sectionZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.sectionRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSection')
      }))
    )
  }

  removeSection(id: string): Effect.Effect<void, SectionServiceError> {
    const stage = 'SectionService::removeSection'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.sectionRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmSection | null, SectionServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
