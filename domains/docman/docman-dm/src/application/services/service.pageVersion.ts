import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type {
  IRepositoryPortDocumentSectionLink,
  IRepositoryPortPageVersion,
  IRepositoryPortSectionPageLink,
} from '../ports/repository-ports/index.js'
import type { IPageVersionServicePort } from '../ports/inbound/index.js'
import { PageVersionServiceError } from '../errors/PageVersionServiceError.js'
import { IbmPageVersion, IbmPageVersionInsert, pageVersionZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface PageVersionServiceDependencies {
  documentSectionLinkRepository?: IRepositoryPortDocumentSectionLink
  sectionPageLinkRepository?: IRepositoryPortSectionPageLink
}

export interface PageVersionServiceOptions {
  pageVersionRepository: IRepositoryPortPageVersion
  serviceDependencies?: Partial<PageVersionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class PageVersionService implements IPageVersionServicePort {
  private readonly pageVersionRepository: IRepositoryPortPageVersion
  private readonly documentSectionLinkRepository?: IRepositoryPortDocumentSectionLink
  private readonly sectionPageLinkRepository?: IRepositoryPortSectionPageLink
  private readonly logger?: XfLogger

  constructor(options: PageVersionServiceOptions) {
    const deps = options.serviceDependencies ?? {}
    this.pageVersionRepository = options.pageVersionRepository
    this.documentSectionLinkRepository = deps.documentSectionLinkRepository
    this.sectionPageLinkRepository = deps.sectionPageLinkRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmPageVersion>): Effect.Effect<IbmPageVersion | null, PageVersionServiceError> {
    const stage = 'PageVersionService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.pageVersionRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmPageVersionInsert): Effect.Effect<IbmPageVersion, PageVersionServiceError> {
    const stage = 'PageVersionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: pageVersionZodSchemaInsert,
          stage,
          operation: 'PageVersionService::create.pageVersionZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.pageVersionRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  
  listPageVersions(filter: Partial<IbmPageVersion> = {}, options?: DbQueryOptions<IbmPageVersion>): Effect.Effect<IbmPageVersion[], PageVersionServiceError> {
    const stage = 'PageVersionService::listPageVersions'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.pageVersionRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listPageVersions')
      }))
    )
  }

  updatePageVersion(id: string, patch: Partial<IbmPageVersion>): Effect.Effect<IbmPageVersion, PageVersionServiceError> {
    const stage = 'PageVersionService::updatePageVersion'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: pageVersionZodSchemaInsert.partial().strict(),
          stage,
          operation: 'PageVersionService::updatePageVersion.pageVersionZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.pageVersionRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updatePageVersion')
      }))
    )
  }

  removePageVersion(id: string): Effect.Effect<void, PageVersionServiceError> {
    const stage = 'PageVersionService::removePageVersion'
    return Effect.gen(this, function* (_) {
      const entityId = yield* _(validateInput(id, 'id', { stage }))
      yield* _(this.ensurePageVersionIsUnlinked(entityId, stage, 'removePageVersion'))
      yield* _(
        this.pageVersionRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      )
      return undefined
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removePageVersion')
      }))
    )
  }

  private ensurePageVersionIsUnlinked(
    pageVersionId: string,
    stage: string,
    operation: string,
  ): Effect.Effect<void, PageVersionServiceError> {
    return Effect.gen(this, function* (_) {
      const documentSectionLinkRepository = yield* _(
        this.requireDependency(this.documentSectionLinkRepository, 'documentSectionLinkRepository', stage, operation)
      )
      const sectionPageLinkRepository = yield* _(
        this.requireDependency(this.sectionPageLinkRepository, 'sectionPageLinkRepository', stage, operation)
      )

      const [documentLinks, sectionLinks] = yield* _(
        Effect.all([
          documentSectionLinkRepository.find({ matchEq: { pageVersionId } } as any).pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation: 'documentSectionLinkRepository.find(pageVersionId)',
                factory: XfErrorFactory.upsertFailed,
              })
            )
          ),
          sectionPageLinkRepository.find({ matchEq: { pageVersionId } } as any).pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation: 'sectionPageLinkRepository.find(pageVersionId)',
                factory: XfErrorFactory.upsertFailed,
              })
            )
          ),
        ])
      )

      const documentLinkCount = Array.isArray(documentLinks) ? documentLinks.length : 0
      const sectionLinkCount = Array.isArray(sectionLinks) ? sectionLinks.length : 0
      if (documentLinkCount === 0 && sectionLinkCount === 0) {
        return
      }

      return yield* _(
        Effect.fail(
          XfErrorFactory.upsertFailed({
            stage,
            operation: 'checkPageVersionUsage',
            message: 'Page version is still linked in document or section outlines.',
            data: {
              pageVersionId,
              documentLinkCount,
              sectionLinkCount,
            },
          })
        )
      )
    })
  }

  private requireDependency<T>(
    dependency: T | undefined,
    name: string,
    stage: string,
    operation: string,
  ): Effect.Effect<T, PageVersionServiceError> {
    if (dependency) return Effect.succeed(dependency)
    return Effect.fail(
      XfErrorFactory.configurationError({
        stage,
        operation,
        message: `Missing dependency: ${name}`,
        debug: { dependency: name },
      })
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmPageVersion | null, PageVersionServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
