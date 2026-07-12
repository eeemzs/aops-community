import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortScope, IRepositoryPortTag } from '../ports/repository-ports/index.js'
import type { ITagServicePort, TagEnsureInput, TagListFilter } from '../ports/inbound/index.js'
import { TagServiceError } from '../errors/TagServiceError.js'
import { IbmTag, IbmTagInsert, tagZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface TagServiceDependencies {}

export interface TagServiceOptions {
  tagRepository: IRepositoryPortTag
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<TagServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class TagService implements ITagServicePort {
  private readonly tagRepository: IRepositoryPortTag
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: TagServiceOptions) {
    this.tagRepository = options.tagRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmTag>): Effect.Effect<IbmTag | null, TagServiceError> {
    const stage = 'TagService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.tagRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmTagInsert): Effect.Effect<IbmTag, TagServiceError> {
    const stage = 'TagService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: tagZodSchemaInsert,
          stage,
          operation: 'TagService::create.tagZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.tagRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  ensureTags(input: TagEnsureInput): Effect.Effect<IbmTag[], TagServiceError> {
    const stage = 'TagService::ensureTags'
    const normalizedTags = Array.from(
      new Set((input.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))
    )

    if (normalizedTags.length === 0) return Effect.succeed([])

    return pipe(
      validateInput(input.scopeId, 'scopeId', { stage }),
      Effect.flatMap(() => validateInput(input.scopeType, 'scopeType', { stage })),
      Effect.flatMap(() =>
        Effect.forEach(
          normalizedTags,
          (name) =>
            this.tagRepository
              .find({
                matchEq: { scopeId: input.scopeId, scopeType: input.scopeType, name },
                options: { limit: 1 },
              } as any)
              .pipe(
                Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
                Effect.flatMap((existing) => {
                  if (existing.length > 0) return Effect.succeed(existing[0])
                  return this.tagRepository
                    .create({
                      scopeId: input.scopeId,
                      scopeType: input.scopeType,
                      name,
                      createdBy: input.createdBy,
                      updatedBy: input.updatedBy,
                    } as IbmTagInsert)
                    .pipe(Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })))
                })
              ),
          { concurrency: 1 }
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in ensureTags')
        })
      )
    )
  }

  listTags(
    filter: TagListFilter = {},
    options?: DbQueryOptions<IbmTag>
  ): Effect.Effect<IbmTag[], TagServiceError> {
    const stage = 'TagService::listTags'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) =>
        listRecordsByScopeResolution(this.tagRepository as any, this.scopeRepository, value, options, {
          stage,
          defaultResolution: 'cascade',
          dedupeKey: (item) => {
            const name = String(item?.name ?? '').trim().toLowerCase()
            const scopeType = String(item?.scopeType ?? '').trim().toLowerCase()
            return name && scopeType ? `${scopeType}:${name}` : undefined
          },
        }).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listTags')
        })
      )
    )
  }

  searchTags(filter: TagListFilter, query: string, options?: DbQueryOptions<IbmTag>): Effect.Effect<IbmTag[], TagServiceError> {
    const stage = 'TagService::searchTags'
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'query', stage }))
    }
    return pipe(
      this.listTags(filter, options),
      Effect.map((items) =>
        items.filter((item) => {
          const name = String(item?.name ?? '').toLowerCase()
          return name.includes(normalizedQuery)
        })
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in searchTags')
        })
      )
    )
  }

  //==> custom-methods
  //<==//
}
