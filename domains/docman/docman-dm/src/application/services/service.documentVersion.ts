import { createHash } from 'node:crypto'
import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type {
  IRepositoryPortDocument, IRepositoryPortDocumentSectionLink, IRepositoryPortDocumentVersion, IRepositoryPortPage, IRepositoryPortPageEmbedLink, IRepositoryPortPageSnippetLink, IRepositoryPortPageVersion, IRepositoryPortSection, IRepositoryPortSectionPageLink, } from '../ports/repository-ports/index.js'
import type {
  DocmanDocumentVersionImportHeadingsInput,
  DocmanDocumentVersionImportHeadingsResult,
  DocmanDocumentVersionSetCurrentInput,
  DocmanDocumentVersionSetCurrentResult,
  DocmanHeadingImportWarning,
  DocmanImportedPageGraphItem,
  DocmanImportedSectionGraphItem,
  DocmanParsedHeadingGraphNode,
  IDocumentVersionServicePort,
} from '../ports/inbound/index.js'
import { DocumentVersionServiceError } from '../errors/DocumentVersionServiceError.js'
import { bmDocumentVersionMlgFields, IbmDocumentSectionLink, IbmDocumentVersion, IbmDocumentVersionInsert, documentVersionZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, IRepositoryBase, IRepositoryContext, IUnitOfWork, mapDbError, runInTransactionEffect } from '@aopslab/xf-db'
import {
  deleteDocumentVersionCascade,
  type DocmanCascadeDeleteDependencies,
  type DocmanDocumentVersionDeleteReport,
} from './documentCascadeDelete.js'

export interface DocumentVersionServiceDependencies {
  documentRepository?: IRepositoryPortDocument
  documentSectionLinkRepository?: IRepositoryPortDocumentSectionLink
  sectionRepository?: IRepositoryPortSection
  pageRepository?: IRepositoryPortPage
  pageVersionRepository?: IRepositoryPortPageVersion
  sectionPageLinkRepository?: IRepositoryPortSectionPageLink
  pageSnippetLinkRepository?: IRepositoryPortPageSnippetLink
  pageEmbedLinkRepository?: IRepositoryPortPageEmbedLink
}

export interface DocumentVersionServiceOptions {
  documentVersionRepository: IRepositoryPortDocumentVersion
  serviceDependencies?: Partial<DocumentVersionServiceDependencies>
  unitOfWork?: IUnitOfWork
  logger?: XfLogger
  locale?: string
}

type DocmanHeadingImportValidatedInput = Required<
  Pick<DocmanDocumentVersionImportHeadingsInput, 'documentVersionId' | 'scopeId' | 'parsedGraph'>
> & {
  options: Required<NonNullable<DocmanDocumentVersionImportHeadingsInput['options']>>
  createdBy?: string
  updatedBy?: string
}

type DocmanHeadingImportDependencies = {
  documentVersionRepository: IRepositoryPortDocumentVersion
  documentSectionLinkRepository: IRepositoryPortDocumentSectionLink
  sectionRepository: IRepositoryPortSection
  pageRepository: IRepositoryPortPage
  pageVersionRepository: IRepositoryPortPageVersion
  sectionPageLinkRepository: IRepositoryPortSectionPageLink
}

type DocmanHeadingImportPlannedNode = {
  kind: 'section' | 'page'
  title: string
  uid: string
  slug?: string
  bodyMarkdown: string
  depth: number
  position: number
  path: string
  children: DocmanHeadingImportPlannedNode[]
}

type DocmanHeadingImportPlan = {
  nodes: DocmanHeadingImportPlannedNode[]
  warnings: DocmanHeadingImportWarning[]
  sections: DocmanImportedSectionGraphItem[]
  pages: DocmanImportedPageGraphItem[]
}

export class DocumentVersionService implements IDocumentVersionServicePort {
  private readonly documentVersionRepository: IRepositoryPortDocumentVersion
  private readonly documentRepository?: IRepositoryPortDocument
  private readonly documentSectionLinkRepository?: IRepositoryPortDocumentSectionLink
  private readonly sectionRepository?: IRepositoryPortSection
  private readonly pageRepository?: IRepositoryPortPage
  private readonly pageVersionRepository?: IRepositoryPortPageVersion
  private readonly sectionPageLinkRepository?: IRepositoryPortSectionPageLink
  private readonly pageSnippetLinkRepository?: IRepositoryPortPageSnippetLink
  private readonly pageEmbedLinkRepository?: IRepositoryPortPageEmbedLink
  private readonly unitOfWork?: IUnitOfWork
  private readonly logger?: XfLogger
  private readonly locale?: string

  constructor(options: DocumentVersionServiceOptions) {
    const deps = options.serviceDependencies ?? {}
    this.documentVersionRepository = options.documentVersionRepository
    this.documentRepository = deps.documentRepository
    this.documentSectionLinkRepository = deps.documentSectionLinkRepository
    this.sectionRepository = deps.sectionRepository
    this.pageRepository = deps.pageRepository
    this.pageVersionRepository = deps.pageVersionRepository
    this.sectionPageLinkRepository = deps.sectionPageLinkRepository
    this.pageSnippetLinkRepository = deps.pageSnippetLinkRepository
    this.pageEmbedLinkRepository = deps.pageEmbedLinkRepository
    this.unitOfWork = options.unitOfWork
    this.logger = options.logger?.child({ module: this.constructor.name })
    this.locale = options.locale
  }

  private bindRepositoryContext(
    repository: unknown,
    ctx: IRepositoryContext | undefined,
  ): repository is IRepositoryBase {
    if (!ctx || !repository || typeof repository !== 'object') return false
    return (
      typeof (repository as IRepositoryBase).setCtx === 'function' &&
      typeof (repository as IRepositoryBase).clearCtx === 'function'
    )
  }

  private withRepositoryContext<R>(
    repositories: unknown[],
    ctx: IRepositoryContext | undefined,
    program: () => Effect.Effect<R, DocumentVersionServiceError>,
  ): Effect.Effect<R, DocumentVersionServiceError> {
    const scoped = repositories.filter((repository): repository is IRepositoryBase =>
      this.bindRepositoryContext(repository, ctx),
    )

    return Effect.acquireUseRelease(
      Effect.sync(() => {
        for (const repository of scoped) repository.setCtx(ctx!)
      }),
      () => program(),
      () =>
        Effect.sync(() => {
          for (const repository of scoped) repository.clearCtx()
        }),
    )
  }

  private runHeadingImportWriteEffect<R>(
    dependencies: DocmanHeadingImportDependencies,
    program: () => Effect.Effect<R, DocumentVersionServiceError>,
  ): Effect.Effect<R, DocumentVersionServiceError> {
    if (!this.unitOfWork) return program()

    return runInTransactionEffect(this.unitOfWork, (ctx) =>
      this.withRepositoryContext(Object.values(dependencies), ctx, program),
    )
  }

  getById(id: string, options?: DbQueryOptions<IbmDocumentVersion>): Effect.Effect<IbmDocumentVersion | null, DocumentVersionServiceError> {
    const stage = 'DocumentVersionService::getById'
    const optionsWithLocale = this.withLocaleOptions(options)
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.documentVersionRepository.findById(id, optionsWithLocale).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmDocumentVersionInsert): Effect.Effect<IbmDocumentVersion, DocumentVersionServiceError> {
    const stage = 'DocumentVersionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: documentVersionZodSchemaInsert,
          stage,
          operation: 'DocumentVersionService::create.documentVersionZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.ensureVersionIsUniqueForDocument(data, stage)),
      Effect.flatMap((data) => this.documentVersionRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  
  listDocumentVersions(filter: Partial<IbmDocumentVersion> = {}, options?: DbQueryOptions<IbmDocumentVersion>): Effect.Effect<IbmDocumentVersion[], DocumentVersionServiceError> {
    const stage = 'DocumentVersionService::listDocumentVersions'
    const optionsWithLocale = this.withLocaleOptions(options)
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.documentVersionRepository.find({ matchEq: filter, options: optionsWithLocale } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listDocumentVersions')
      }))
    )
  }

  updateDocumentVersion(id: string, patch: Partial<IbmDocumentVersion>): Effect.Effect<IbmDocumentVersion, DocumentVersionServiceError> {
    const stage = 'DocumentVersionService::updateDocumentVersion'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: documentVersionZodSchemaInsert.partial().strict(),
          stage,
          operation: 'DocumentVersionService::updateDocumentVersion.documentVersionZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.documentVersionRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateDocumentVersion')
      }))
    )
  }

  setCurrent(input: DocmanDocumentVersionSetCurrentInput): Effect.Effect<DocmanDocumentVersionSetCurrentResult, DocumentVersionServiceError> {
    const stage = 'DocumentVersionService::setCurrent'
    const self = this
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((raw) =>
        Effect.gen(function* (_) {
          const validInput = raw as DocmanDocumentVersionSetCurrentInput
          if (!validInput.documentVersionId) {
            return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'documentVersionId', stage })))
          }
          // 1. Resolve target version.
          const target = yield* _(
            self.documentVersionRepository.findById(validInput.documentVersionId).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'findById(target)', factory: XfErrorFactory.notFound }))
            )
          )
          const targetId = target.id as string
          const targetDocumentId = target.documentId
          const targetTenantId = target.tenantId as string
          // 2. documentId guard (optional).
          if (validInput.documentId && targetDocumentId !== validInput.documentId) {
            return yield* _(Effect.fail(XfErrorFactory.upsertFailed({
              stage,
              message: `documentId guard mismatch: target.documentId=${targetDocumentId} but input.documentId=${validInput.documentId}`,
            })))
          }
          // 3. Find current peers (all rows where isCurrent=true for the same document).
          const currentPeers = yield* _(
            self.documentVersionRepository.find({
              matchEq: { documentId: targetDocumentId, tenantId: targetTenantId, isCurrent: true } as Partial<IbmDocumentVersion>,
            }).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'find(currentPeers)', factory: XfErrorFactory.upsertFailed }))
            )
          )
          // 4. expectedPreviousVersionId guard (optional).
          if (validInput.expectedPreviousVersionId) {
            const prevId = currentPeers.find((p) => p.id !== targetId)?.id
            if (prevId !== validInput.expectedPreviousVersionId) {
              return yield* _(Effect.fail(XfErrorFactory.upsertFailed({
                stage,
                message: `expectedPreviousVersionId mismatch: actual previous current id=${prevId ?? 'null'}, expected=${validInput.expectedPreviousVersionId}`,
              })))
            }
          }
          // 5. Compute desired state.
          const publish = validInput.publish !== false // default true
          const wantPublishedAt = publish
            ? (typeof validInput.publishedAt === 'string'
              ? new Date(validInput.publishedAt)
              : (validInput.publishedAt instanceof Date ? validInput.publishedAt : new Date()))
            : target.publishedAt ?? null
          const targetAlreadyCurrent = target.isCurrent === true
          const targetAlreadyPublished = target.status === 'published'
          const peersToClear = currentPeers.filter((p) => p.id !== targetId)
          const changed = !targetAlreadyCurrent || peersToClear.length > 0 || (publish && !targetAlreadyPublished)
          // 6. Idempotent short-circuit.
          if (!changed) {
            return {
              documentId: targetDocumentId,
              currentVersionId: targetId,
              previousCurrentVersionIds: [],
              changed: false,
              publishedAt: target.publishedAt ?? null,
              status: target.status ?? null,
              warnings: [],
            } as DocmanDocumentVersionSetCurrentResult
          }
          // 7. Clear peers.
          const previousIds: string[] = []
          for (const peer of peersToClear) {
            const peerId = peer.id as string
            yield* _(
              self.documentVersionRepository.patchById(peerId, { isCurrent: false }).pipe(
                Effect.mapError(mapDbError({ stage, operation: `patchById(peer=${peerId}, isCurrent=false)`, factory: XfErrorFactory.upsertFailed }))
              )
            )
            previousIds.push(peerId)
          }
          // 8. Patch target.
          const targetPatch: Partial<IbmDocumentVersion> = { isCurrent: true }
          if (publish) {
            if (!targetAlreadyPublished) targetPatch.status = 'published'
            targetPatch.publishedAt = wantPublishedAt instanceof Date ? wantPublishedAt : new Date()
          }
          const updated = yield* _(
            self.documentVersionRepository.patchById(targetId, targetPatch).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(target,setCurrent)', factory: XfErrorFactory.upsertFailed }))
            )
          )
          return {
            documentId: updated.documentId,
            currentVersionId: updated.id as string,
            previousCurrentVersionIds: previousIds,
            changed: true,
            publishedAt: updated.publishedAt ?? null,
            status: updated.status ?? null,
            warnings: [],
          } as DocmanDocumentVersionSetCurrentResult
        })
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in setCurrent')
      }))
    )
  }

  removeDocumentVersion(id: string): Effect.Effect<void, DocumentVersionServiceError> {
    const stage = 'DocumentVersionService::removeDocumentVersion'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.documentVersionRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }

  removeDocumentVersionSafe(id: string): Effect.Effect<DocmanDocumentVersionDeleteReport, DocumentVersionServiceError> {
    const stage = 'DocumentVersionService::removeDocumentVersionSafe'

    return Effect.gen(this, function* (_) {
      const entityId = yield* _(validateInput(id, 'id', { stage }))
      const dependencies = yield* _(this.resolveCascadeDependencies(stage, 'removeDocumentVersionSafe'))
      return yield* _(
        (deleteDocumentVersionCascade(dependencies, entityId, stage).pipe(
          Effect.mapError((error) => this.normalizeCascadeError(stage, 'removeDocumentVersionSafe.cascade', error))
        )) as Effect.Effect<DocmanDocumentVersionDeleteReport, DocumentVersionServiceError>
      )
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeDocumentVersionSafe')
      }))
    )
  }

  importHeadings(
    input: DocmanDocumentVersionImportHeadingsInput,
  ): Effect.Effect<DocmanDocumentVersionImportHeadingsResult, DocumentVersionServiceError> {
    const stage = 'DocumentVersionService::importHeadings'

    return Effect.gen(this, function* (_) {
      const payload = yield* _(this.validateHeadingImportInput(input, stage))
      const dependencies = yield* _(this.resolveHeadingImportDependencies(stage, 'importHeadings'))
      const documentVersion = yield* _(
        dependencies.documentVersionRepository.findById(payload.documentVersionId).pipe(
          Effect.mapError(
            mapDbError({
              stage,
              operation: 'documentVersionRepository.findById',
              factory: XfErrorFactory.notFound,
            }),
          ),
        ),
      )
      if (!documentVersion?.id) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.notFound({
              stage,
              operation: 'documentVersionRepository.findById',
              message: 'Document version not found.',
              identifier: { documentVersionId: payload.documentVersionId },
            }),
          ),
        )
      }

      const existingLinks = yield* _(
        dependencies.documentSectionLinkRepository.find({ matchEq: { documentVersionId: payload.documentVersionId } } as any).pipe(
          Effect.mapError(
            mapDbError({
              stage,
              operation: 'documentSectionLinkRepository.find',
              factory: XfErrorFactory.notFound,
            }),
          ),
        ),
      )

      const existingPolicy = payload.options.existingGraphPolicy
      if (existingLinks.length > 0 && existingPolicy === 'error' && !payload.options.dryRun) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.upsertFailed({
              stage,
              operation: 'existingGraphPolicy',
              message: 'Document version already has a section/page graph. Use append explicitly or import into a clean version.',
              data: {
                documentVersionId: payload.documentVersionId,
                existingLinkCount: existingLinks.length,
                existingGraphPolicy: existingPolicy,
              },
            }),
          ),
        )
      }
      const plan = this.buildHeadingImportPlan(payload, existingLinks)
      if (payload.options.dryRun) {
        return this.buildHeadingImportResult(payload.documentVersionId, true, plan)
      }

      return yield* _(
        this.runHeadingImportWriteEffect(dependencies, () =>
          Effect.gen(this, function* (_) {
      const sections: DocmanImportedSectionGraphItem[] = []
      const pages: DocmanImportedPageGraphItem[] = []
      const sectionPagePositions = new Map<string, number>()

      if (existingPolicy === 'replace') {
        yield* _(this.deleteExistingDocumentVersionLinksForHeadingImport(dependencies, existingLinks, stage))
      }

      const importNode = (
        node: DocmanHeadingImportPlannedNode,
        parentLinkId: string | undefined,
      ): Effect.Effect<void, DocumentVersionServiceError> =>
        Effect.gen(this, function* (_) {
        if (node.kind === 'section') {
          const section = yield* _(
            dependencies.sectionRepository.create({
              scopeId: payload.scopeId,
              sectionUid: node.uid,
              title: node.title,
              slug: node.slug,
              kind: 'container',
              createdBy: payload.createdBy,
              updatedBy: payload.updatedBy,
            } as any).pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'sectionRepository.create',
                  factory: XfErrorFactory.createFailed,
                }),
              ),
            ),
          )
          const link = yield* _(
            dependencies.documentSectionLinkRepository.create({
              documentVersionId: payload.documentVersionId,
              kind: 'section',
              sectionId: section.id,
              parentLinkId,
              position: node.position,
              depth: node.depth,
              createdBy: payload.createdBy,
              updatedBy: payload.updatedBy,
            } as any).pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'documentSectionLinkRepository.create(section)',
                  factory: XfErrorFactory.createFailed,
                }),
              ),
            ),
          )
          sections.push({
            title: node.title,
            slug: node.slug,
            depth: node.depth,
            position: node.position,
            parentLinkId,
            sectionId: section.id,
            documentSectionLinkId: link.id,
          })
          for (const child of node.children) {
            yield* _(importNode(child, link.id))
          }
          return
        }

        const page = yield* _(
          dependencies.pageRepository.create({
            scopeId: payload.scopeId,
            pageUid: node.uid,
            title: node.title,
            kind: 'content',
            createdBy: payload.createdBy,
            updatedBy: payload.updatedBy,
          } as any).pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation: 'pageRepository.create',
                factory: XfErrorFactory.createFailed,
              }),
            ),
          ),
        )
        const pageVersion = yield* _(
          dependencies.pageVersionRepository.create({
            pageId: page.id,
            version: 1,
            title: node.title,
            format: 'md',
            content: node.bodyMarkdown,
            status: 'draft',
            createdBy: payload.createdBy,
            updatedBy: payload.updatedBy,
          } as any).pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation: 'pageVersionRepository.create',
                factory: XfErrorFactory.createFailed,
              }),
            ),
          ),
        )
        const link = yield* _(
          dependencies.documentSectionLinkRepository.create({
            documentVersionId: payload.documentVersionId,
            kind: 'page',
            pageVersionId: pageVersion.id,
            parentLinkId,
            position: node.position,
            depth: node.depth,
            createdBy: payload.createdBy,
            updatedBy: payload.updatedBy,
          } as any).pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation: 'documentSectionLinkRepository.create(page)',
                factory: XfErrorFactory.createFailed,
              }),
            ),
          ),
        )

        let sectionPageLinkId: string | undefined
        if (parentLinkId) {
          const parentSection = sections.find((section) => section.documentSectionLinkId === parentLinkId)
          if (parentSection?.sectionId) {
            const nextSectionPosition = (sectionPagePositions.get(parentSection.sectionId) ?? 0) + 1
            sectionPagePositions.set(parentSection.sectionId, nextSectionPosition)
            const sectionPageLink = yield* _(
              dependencies.sectionPageLinkRepository.create({
                sectionId: parentSection.sectionId,
                pageVersionId: pageVersion.id,
                position: nextSectionPosition,
                createdBy: payload.createdBy,
                updatedBy: payload.updatedBy,
              } as any).pipe(
                Effect.mapError(
                  mapDbError({
                    stage,
                    operation: 'sectionPageLinkRepository.create',
                    factory: XfErrorFactory.createFailed,
                  }),
                ),
              ),
            )
            sectionPageLinkId = sectionPageLink.id
          }
        }

        pages.push({
          title: node.title,
          depth: node.depth,
          position: node.position,
          parentLinkId,
          pageId: page.id,
          pageVersionId: pageVersion.id,
          documentSectionLinkId: link.id,
          sectionPageLinkId,
        })
      })

      for (const node of plan.nodes) {
        yield* _(importNode(node, undefined))
      }

      return {
        documentVersionId: payload.documentVersionId,
        dryRun: false,
        summary: {
          sectionsCreated: sections.length,
          pagesCreated: pages.length,
          documentLinksCreated: sections.length + pages.length,
          sectionPageLinksCreated: pages.filter((page) => Boolean(page.sectionPageLinkId)).length,
          warnings: plan.warnings,
        },
        graph: { sections, pages },
      }
          }),
        ),
      )
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in importHeadings')
        }),
      ),
    )
  }

  private validateHeadingImportInput(
    input: DocmanDocumentVersionImportHeadingsInput,
    stage: string,
  ): Effect.Effect<DocmanHeadingImportValidatedInput, DocumentVersionServiceError> {
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const documentVersionId = this.normalizeNonEmpty(payload.documentVersionId)
      if (!documentVersionId) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'documentVersionId', stage })))
      }
      const scopeId = this.normalizeNonEmpty(payload.scopeId)
      if (!scopeId) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'scopeId', stage })))
      }
      const parsedGraph = payload.parsedGraph
      if (!parsedGraph || !Array.isArray(parsedGraph.nodes)) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.inputRequired({
              field: 'parsedGraph.nodes',
              stage,
              message: 'parsedGraph.nodes must be an array.',
            }),
          ),
        )
      }

      const options = payload.options ?? {}
      const existingGraphPolicy = options.existingGraphPolicy ?? 'error'
      const slugStrategy = options.slugStrategy ?? 'hash-suffix-on-collision'
      const bodyAssignment = options.bodyAssignment ?? 'leaf-page-content'
      const headingToPagePolicy = options.headingToPagePolicy ?? 'h4-and-below'
      if (!['error', 'append', 'replace'].includes(existingGraphPolicy)) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'options.existingGraphPolicy', stage })))
      }
      if (!['hash-suffix-on-collision', 'kebab-from-title'].includes(slugStrategy)) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'options.slugStrategy', stage })))
      }
      if (bodyAssignment !== 'leaf-page-content') {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'options.bodyAssignment', stage })))
      }
      if (headingToPagePolicy !== 'h4-and-below') {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'options.headingToPagePolicy', stage })))
      }

      return {
        documentVersionId,
        scopeId,
        parsedGraph,
        options: {
          dryRun: options.dryRun === true,
          existingGraphPolicy,
          slugStrategy,
          bodyAssignment,
          headingToPagePolicy,
          synthesizeOverviewPages: options.synthesizeOverviewPages === true,
        },
        createdBy: this.normalizeNonEmpty(payload.createdBy),
        updatedBy: this.normalizeNonEmpty(payload.updatedBy) ?? this.normalizeNonEmpty(payload.createdBy),
      }
    })
  }

  private resolveHeadingImportDependencies(
    stage: string,
    operation: string,
  ): Effect.Effect<DocmanHeadingImportDependencies, DocumentVersionServiceError> {
    return Effect.gen(this, function* (_) {
      return {
        documentVersionRepository: this.documentVersionRepository,
        documentSectionLinkRepository: yield* _(
          this.requireDependency(this.documentSectionLinkRepository, 'documentSectionLinkRepository', stage, operation),
        ),
        sectionRepository: yield* _(
          this.requireDependency(this.sectionRepository, 'sectionRepository', stage, operation),
        ),
        pageRepository: yield* _(
          this.requireDependency(this.pageRepository, 'pageRepository', stage, operation),
        ),
        pageVersionRepository: yield* _(
          this.requireDependency(this.pageVersionRepository, 'pageVersionRepository', stage, operation),
        ),
        sectionPageLinkRepository: yield* _(
          this.requireDependency(this.sectionPageLinkRepository, 'sectionPageLinkRepository', stage, operation),
        ),
      }
    })
  }

  private buildHeadingImportPlan(
    input: DocmanHeadingImportValidatedInput,
    existingLinks: IbmDocumentSectionLink[],
  ): DocmanHeadingImportPlan {
    const warnings: DocmanHeadingImportWarning[] = []
    if (existingLinks.length > 0 && input.options.existingGraphPolicy === 'error') {
      warnings.push({
        code: 'existing-graph-present',
        message: `Document version already has ${existingLinks.length} outline link(s). Apply is blocked unless append or replace is explicit.`,
      })
    }
    if (existingLinks.length > 0 && input.options.existingGraphPolicy === 'replace') {
      warnings.push({
        code: 'existing-graph-will-be-replaced',
        message: `Replace import will remove ${existingLinks.length} existing outline link(s) from this document version before writing the new graph.`,
      })
    }
    const usedSlugs = new Map<string, number>()
    const rootOffset = input.options.existingGraphPolicy === 'append'
      ? existingLinks
        .filter((link) => !this.normalizeNonEmpty(link.parentLinkId))
        .reduce((max, link) => Math.max(max, Number(link.position) || 0), 0)
      : 0

    const planNode = (
      node: DocmanParsedHeadingGraphNode,
      siblings: DocmanParsedHeadingGraphNode[],
      index: number,
      depth: number,
      path: string,
    ): DocmanHeadingImportPlannedNode | null => {
      const kind = node.kind === 'page' ? 'page' : node.kind === 'section' ? 'section' : undefined
      const title = this.normalizeNonEmpty(node.title)
      if (!kind || !title) {
        warnings.push({
          code: 'invalid-node-skipped',
          message: 'Skipped heading import node without a valid kind or title.',
          path,
        })
        return null
      }

      const bodyMarkdown = String(node.bodyMarkdown ?? '').trim()
      const children = Array.isArray(node.children) ? node.children : []
      const siblingPosition = index + 1 + (depth === 0 ? rootOffset : 0)
      const planned: DocmanHeadingImportPlannedNode = {
        kind,
        title,
        uid: this.buildHeadingImportUid(kind === 'section' ? 'SEC' : 'PAG', input, title, path),
        slug: kind === 'section' ? this.buildHeadingImportSlug(node.slug ?? title, input, usedSlugs, path) : undefined,
        bodyMarkdown: kind === 'page' ? this.ensureTrailingNewline(bodyMarkdown) : '',
        depth,
        position: siblingPosition,
        path,
        children: [],
      }

      const synthesizedChildren: DocmanHeadingImportPlannedNode[] = []
      if (kind === 'section' && bodyMarkdown) {
        if (input.options.synthesizeOverviewPages) {
          const overviewPath = `${path}.overview`
          synthesizedChildren.push({
            kind: 'page',
            title: 'Overview',
            uid: this.buildHeadingImportUid('PAG', input, `${title}: Overview`, overviewPath),
            bodyMarkdown: this.ensureTrailingNewline(bodyMarkdown),
            depth: depth + 1,
            position: 1,
            path: overviewPath,
            children: [],
          })
          warnings.push({
            code: 'section-overview-page-synthesized',
            message: `Direct body under section "${title}" was imported as an Overview page.`,
            path: overviewPath,
          })
        } else {
          warnings.push({
            code: 'section-direct-body-ignored',
            message: `Direct body under section "${title}" is ignored in the MVP import policy.`,
            path,
          })
        }
      }

      const childPositionOffset = synthesizedChildren.length
      planned.children = synthesizedChildren.concat(children
        .map((child, childIndex) =>
          planNode(child, children, childIndex + childPositionOffset, depth + 1, `${path}.${childIndex}`),
        )
        .filter((child): child is DocmanHeadingImportPlannedNode => Boolean(child))
      )
      void siblings
      return planned
    }

    const rootNodes = input.parsedGraph.nodes
    const nodes = rootNodes
      .map((node, index) => planNode(node, rootNodes, index, 0, String(index)))
      .filter((node): node is DocmanHeadingImportPlannedNode => Boolean(node))
    const sections: DocmanImportedSectionGraphItem[] = []
    const pages: DocmanImportedPageGraphItem[] = []
    const collect = (node: DocmanHeadingImportPlannedNode, parentLinkId?: string) => {
      if (node.kind === 'section') {
        sections.push({
          title: node.title,
          slug: node.slug,
          depth: node.depth,
          position: node.position,
          parentLinkId,
        })
        for (const child of node.children) collect(child, node.path)
        return
      }
      pages.push({
        title: node.title,
        depth: node.depth,
        position: node.position,
        parentLinkId,
      })
    }
    nodes.forEach((node) => collect(node))
    return { nodes, warnings, sections, pages }
  }

  private buildHeadingImportResult(
    documentVersionId: string,
    dryRun: boolean,
    plan: DocmanHeadingImportPlan,
  ): DocmanDocumentVersionImportHeadingsResult {
    return {
      documentVersionId,
      dryRun,
      summary: {
        sectionsCreated: plan.sections.length,
        pagesCreated: plan.pages.length,
        documentLinksCreated: plan.sections.length + plan.pages.length,
        sectionPageLinksCreated: plan.pages.filter((page) => Boolean(page.parentLinkId)).length,
        warnings: plan.warnings,
      },
      graph: {
        sections: plan.sections,
        pages: plan.pages,
      },
    }
  }

  private deleteExistingDocumentVersionLinksForHeadingImport(
    dependencies: DocmanHeadingImportDependencies,
    existingLinks: IbmDocumentSectionLink[],
    stage: string,
  ): Effect.Effect<number, DocumentVersionServiceError> {
    const linkIds = existingLinks
      .slice()
      .sort((a, b) => (Number(b.depth) || 0) - (Number(a.depth) || 0))
      .map((link) => this.normalizeNonEmpty(link.id))
      .filter((id): id is string => Boolean(id))

    if (linkIds.length === 0) return Effect.succeed(0)

    return Effect.gen(function* (_) {
      let deleted = 0
      for (const linkId of linkIds) {
        deleted += yield* _(
          dependencies.documentSectionLinkRepository.deleteById(linkId).pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation: 'documentSectionLinkRepository.deleteById(replace-import)',
                factory: XfErrorFactory.upsertFailed,
              }),
            ),
          ),
        )
      }
      return deleted
    })
  }

  private buildHeadingImportUid(
    prefix: 'SEC' | 'PAG',
    input: DocmanHeadingImportValidatedInput,
    title: string,
    path: string,
  ): string {
    const source = [
      input.documentVersionId,
      input.parsedGraph.sourceHash,
      input.parsedGraph.sourcePath,
      title,
      path,
    ].filter(Boolean).join(':')
    const hash = createHash('sha1').update(source).digest('hex').slice(0, 12).toUpperCase()
    const titlePart = this.slugifyForImport(title).replace(/-/g, '_').toUpperCase().slice(0, 28) || 'NODE'
    return `${prefix}-${hash}-${titlePart}`
  }

  private buildHeadingImportSlug(
    source: string,
    input: DocmanHeadingImportValidatedInput,
    usedSlugs: Map<string, number>,
    path: string,
  ): string {
    const base = this.slugifyForImport(source) || 'section'
    const count = usedSlugs.get(base) ?? 0
    usedSlugs.set(base, count + 1)
    if (count === 0 || input.options.slugStrategy === 'kebab-from-title') {
      return count === 0 ? base : `${base}-${count + 1}`
    }
    const hash = createHash('sha1').update(`${input.documentVersionId}:${input.parsedGraph.sourceHash ?? ''}:${path}:${source}`).digest('hex').slice(0, 8)
    return `${base}-${hash}`
  }

  private slugifyForImport(value: string): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64)
  }

  private ensureTrailingNewline(value: string): string {
    if (!value) return ''
    return value.endsWith('\n') ? value : `${value}\n`
  }

  private normalizeNonEmpty(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
  }

  private resolveCascadeDependencies(
    stage: string,
    operation: string,
  ): Effect.Effect<DocmanCascadeDeleteDependencies, DocumentVersionServiceError> {
    return Effect.gen(this, function* (_) {
      return {
        documentRepository: yield* _(
          this.requireDependency(this.documentRepository, 'documentRepository', stage, operation)
        ),
        documentVersionRepository: this.documentVersionRepository,
        documentSectionLinkRepository: yield* _(
          this.requireDependency(this.documentSectionLinkRepository, 'documentSectionLinkRepository', stage, operation)
        ),
        sectionRepository: yield* _(
          this.requireDependency(this.sectionRepository, 'sectionRepository', stage, operation)
        ),
        pageRepository: yield* _(
          this.requireDependency(this.pageRepository, 'pageRepository', stage, operation)
        ),
        pageVersionRepository: yield* _(
          this.requireDependency(this.pageVersionRepository, 'pageVersionRepository', stage, operation)
        ),
        sectionPageLinkRepository: yield* _(
          this.requireDependency(this.sectionPageLinkRepository, 'sectionPageLinkRepository', stage, operation)
        ),
        pageSnippetLinkRepository: yield* _(
          this.requireDependency(this.pageSnippetLinkRepository, 'pageSnippetLinkRepository', stage, operation)
        ),
        pageEmbedLinkRepository: yield* _(
          this.requireDependency(this.pageEmbedLinkRepository, 'pageEmbedLinkRepository', stage, operation)
        ),
      }
    })
  }

  private requireDependency<T>(
    dependency: T | undefined,
    name: string,
    stage: string,
    operation: string,
  ): Effect.Effect<T, DocumentVersionServiceError> {
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

  private normalizeCascadeError(
    stage: string,
    operation: string,
    cause: unknown,
  ): DocumentVersionServiceError {
    if (cause && typeof cause === 'object' && '_tag' in cause) {
      return cause as DocumentVersionServiceError
    }
    return XfErrorFactory.upsertFailed({
      stage,
      operation,
      message: 'document_version_cascade_delete_failed',
      cause,
    })
  }

  private ensureVersionIsUniqueForDocument(
    data: IbmDocumentVersionInsert,
    stage: string,
  ): Effect.Effect<IbmDocumentVersionInsert, DocumentVersionServiceError> {
    const documentId = String(data.documentId ?? '').trim()
    const version = Number(data.version)

    return this.documentVersionRepository
      .find({
        matchEq: {
          documentId,
          version,
        },
      } as any)
      .pipe(
        Effect.mapError(
          mapDbError({
            stage,
            operation: 'find(existingVersion)',
            factory: XfErrorFactory.upsertFailed,
          }),
        ),
        Effect.flatMap((existing) => {
          if (!Array.isArray(existing) || existing.length === 0) {
            return Effect.succeed(data)
          }

          return Effect.fail(
            XfErrorFactory.upsertFailed({
              stage,
              operation: 'checkDuplicateVersion',
              message: `Document version ${version} already exists for document ${documentId}.`,
              data: {
                documentId,
                version,
                existingId: String(existing[0]?.id ?? ''),
              },
            }),
          )
        }),
      )
  }

  private withLocaleOptions(
    options?: DbQueryOptions<IbmDocumentVersion>
  ): DbQueryOptions<IbmDocumentVersion> | undefined {
    if (!this.locale) return options

    const projectionOptions = { ...(options?.projectionOptions ?? {}) } as Record<string, unknown>
    const languagesCurrent = projectionOptions.languages
    const languages =
      Array.isArray(languagesCurrent) && languagesCurrent.length > 0 ? languagesCurrent : [this.locale]

    return {
      ...(options ?? {}),
      mlgFields: options?.mlgFields && options.mlgFields.length > 0
        ? options.mlgFields
        : [...bmDocumentVersionMlgFields],
      projectionOptions: { ...projectionOptions, languages },
    } as DbQueryOptions<IbmDocumentVersion>
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmDocumentVersion | null, DocumentVersionServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
