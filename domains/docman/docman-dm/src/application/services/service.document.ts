import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type {
  IRepositoryPortAsset,
  IRepositoryPortAssetVersion,
  IRepositoryPortDocument,
  IRepositoryPortDocumentIndexEntry,
  IRepositoryPortDocumentSectionLink,
  IRepositoryPortDocumentVersion,
  IRepositoryPortPage,
  IRepositoryPortPageEmbedLink,
  IRepositoryPortPageSnippetLink,
  IRepositoryPortPageVersion,
  IRepositoryPortSection,
  IRepositoryPortSectionPageLink,
} from '../ports/repository-ports/index.js'
import type {
  DocmanComposedPageIndex,
  DocmanComposeSourceFormat,
  DocmanDocumentAnswerPackAnswerSource,
  DocmanDocumentAnswerPackCitation,
  DocmanDocumentAnswerPackInput,
  DocmanDocumentAnswerPackMatchField,
  DocmanDocumentAnswerPackProvenance,
  DocmanDocumentAnswerPackResult,
  DocmanDocumentComposeFetchInput,
  DocmanDocumentComposeFetchResult,
  DocmanDocumentComposeIndex,
  DocmanDocumentComposeIndexItem,
  DocmanDocumentIndexBuildInput,
  DocmanDocumentIndexGetInput,
  DocmanDocumentSummaryBuildInput,
  DocmanDocumentSummaryGetInput,
  DocmanDocumentRetrievalStrategy,
  DocmanDocumentSearchHit,
  DocmanDocumentSearchInput,
  DocmanDocumentSearchProvenance,
  DocmanDocumentSearchResult,
  DocmanScopeDocumentSearchBuildReport,
  DocmanScopeDocumentSearchFailure,
  DocmanScopeDocumentSearchHit,
  DocmanScopeDocumentSearchInput,
  DocmanScopeDocumentSearchResult,
  DocmanDocumentIndexSnapshot,
  DocmanDocumentIndexSnapshotEntry,
  DocmanDocumentSummarySnapshot,
  DocmanDocumentSummarySnapshotEntry,
  DocmanDocumentPublishMaterializeInput,
  DocmanDocumentPublishMaterializeResult,
  DocmanPublishedFragmentWarning,
  DocmanResolvedAssetReference,
  DocumentListOptions,
  DocumentLocaleOptions,
  IbmDocumentWithVersions,
  IDocumentServicePort,
} from '../ports/inbound/index.js'
import { DocumentServiceError } from '../errors/DocumentServiceError.js'
import {
  IbmDocument,
  IbmDocumentIndexEntry,
  IbmDocumentIndexEntryInsert,
  IbmDocumentInsert,
  IbmDocumentSectionLink,
  IbmDocumentVersion,
  IbmPage,
  IbmPageVersion,
  IbmSection,
  documentZodSchemaInsert,
} from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import {
  listDocmanAssetReferenceTokens,
  normalizeDocmanComposeSourceContent,
  reduceDocmanComposeFormats,
  replaceDocmanAssetReferenceTokens,
  resolveDocmanComposeSourceFormat,
  splitDocmanComposeSourceContent,
  stripLeadingNumericPrefixForRender,
  type ParsedDocmanAssetReferenceToken,
} from './documentComposeSupport.js'
import {
  formatDocmanPublishTargets,
  type DocmanPublishTargetDescriptor,
  resolveDocmanPublishTargetDescriptor,
} from './documentPublishSupport.js'
import {
  DOCMAN_DOCUMENT_INDEX_BUILD_ACTOR,
  buildDocmanDocumentAnchor,
  buildDocmanDocumentIndexFingerprint,
  buildDocmanPageAnchor,
  buildDocmanSectionAnchor,
  normalizeDocmanDocumentIndexLocale,
} from './documentIndexSupport.js'
import {
  deleteDocumentCascade,
  type DocmanCascadeDeleteDependencies,
  type DocmanDocumentDeleteReport,
} from './documentCascadeDelete.js'
import {
  buildDocmanEmbeddingHash,
  cosineSimilarity,
  createDocmanLocalHashEmbeddingProvider,
  parseDocmanEmbeddingVector,
  resolveDocmanDefaultEmbeddingProvider,
  serializeDocmanEmbeddingVector,
  type DocmanEmbeddingProvider,
} from './documentRetrievalAiSupport.js'

type LocaleState = {
  locale?: string
  fallbackLocale?: string
}

type DocumentIndexLocaleKey = {
  locale?: string
  fallbackLocale?: string
}

type TraversedLink<T> = {
  link: T
  depth: number
  number: string
}

type ComposeItemBase = {
  linkId: string
  kind: 'section' | 'page'
  number: string
  depth: number
  position: number
  title: string
  parentLinkId?: string
  titleVisible: boolean
  pageBreakBefore: boolean
  pageBreakAfter: boolean
  directives?: unknown
}

type SectionComposeItem = ComposeItemBase & {
  kind: 'section'
  sectionId: string
  sectionUid?: string
  sectionSlug?: string
}

type PageComposeItem = ComposeItemBase & {
  kind: 'page'
  pageVersionId: string
  pageId: string
  pageUid?: string
  format: DocmanComposeSourceFormat
  modulePreamble?: string
  contentParts: string[]
  assetRefs: DocmanResolvedAssetReference[]
}

type ComposeItem = SectionComposeItem | PageComposeItem

type ComposedPageChunk = {
  linkId: string
  number: string
  depth: number
  title: string
  titleVisible: boolean
  pageVersionId: string
  pageId: string
  format: DocmanComposeSourceFormat
  modulePreamble?: string
  content: string
  assets: DocmanResolvedAssetReference[]
  chunkIndex: number
  chunkCount: number
}

type ComposedPage = DocmanComposedPageIndex & {
  chunks: ComposedPageChunk[]
  modulePreambles: string[]
  assets: DocmanResolvedAssetReference[]
}

type ResolvedComposeDocument = {
  document: IbmDocument & { id: string }
  documentVersion: IbmDocumentVersion & { id: string }
  title: string
  documentReleaseNotes?: string
  items: ComposeItem[]
  pages: ComposedPage[]
}

type PersistedDocumentSummaryMetrics = {
  sourceText: string
  summaryText: string
  sourceCharCount: number
  sourceWordCount: number
  summaryCharCount: number
  summaryWordCount: number
}

type PersistedDocumentAnswerPackMatch = {
  score: number
  lexicalScore: number
  semanticScore?: number
  matchedBy: DocmanDocumentAnswerPackMatchField[]
}

type PersistedDocumentAnswerPackAnswer = {
  answer: string
  answerSource: DocmanDocumentAnswerPackAnswerSource
}

type PersistedDocumentSearchMatch = {
  row: IbmDocumentIndexEntry
  score: number
  lexicalScore: number
  semanticScore?: number
  matchedBy: DocmanDocumentAnswerPackMatchField[]
}

type ResolvedDocumentVectorState = {
  retrievalStrategy: DocmanDocumentRetrievalStrategy
  vectorAvailable: boolean
  vectorProvider?: string
  vectorModel?: string
  queryVector?: number[]
}

type ScopeSearchDocumentSeed = {
  documentId: string
  documentTitle: string
  documentSlug?: string
  documentVersionId: string
  documentVersionTitle: string
  documentVersionNumber?: number
}

const PAGE_BREAK_LINE_RE =
  /^\s*(?:<!--\s*(?:new\s*page|newpage|pagebreak)\s*-->|\[\[(?:new\s*page|newpage|pagebreak)\]\]|\[(?:new\s*page|newpage|pagebreak)\]|---\s*pagebreak\s*---|\\pagebreak)\s*$/i
const HTML_LIKE_BLOCK_LINE_RE = /^<\/?[A-Za-z][A-Za-z0-9:_-]*(?:\s[^>]*)?>$/
const HTML_COMMENT_LINE_RE = /^<!--[\s\S]*-->$/
const DOCMAN_PAGEBREAK_HTML = '<hr data-docman-pagebreak="true" />'
const DOCMAN_PUBLISH_HTML_STYLES = `
:root {
  color-scheme: light;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  line-height: 1.6;
  color: #16202a;
  background: #f6f7f9;
}
body {
  margin: 0;
  padding: 32px 20px 48px;
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 36%),
    linear-gradient(180deg, #fbfcfd 0%, #f2f4f7 100%);
}
main {
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 48px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(18, 24, 28, 0.08);
  border-radius: 20px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #0f172a;
}
h1 { font-size: 2.35rem; margin: 0 0 1.2rem; }
h2 { font-size: 1.72rem; margin-top: 2.2rem; }
h3 { font-size: 1.35rem; margin-top: 1.8rem; }
p, ul, ol, blockquote, table, pre {
  margin-top: 0;
  margin-bottom: 1rem;
}
a {
  color: #0f766e;
}
blockquote {
  margin-left: 0;
  padding: 0.8rem 1rem;
  border-left: 4px solid rgba(15, 118, 110, 0.45);
  background: rgba(15, 118, 110, 0.06);
}
code {
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.92em;
}
pre {
  overflow-x: auto;
  padding: 1rem 1.1rem;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  padding: 0.65rem 0.8rem;
  border: 1px solid rgba(15, 23, 42, 0.12);
  text-align: left;
}
img {
  max-width: 100%;
  height: auto;
}
hr[data-docman-pagebreak="true"] {
  margin: 2.5rem 0;
  border: 0;
  border-top: 2px dashed rgba(15, 23, 42, 0.18);
}
`
const DOCMAN_DOCUMENT_SUMMARY_BUILD_ACTOR = 'docman:document-summary.build'
const activePersistedDocumentIndexBuilds = new Map<string, Promise<DocmanDocumentIndexSnapshot>>()

export interface DocumentServiceDependencies {
  assetRepository?: IRepositoryPortAsset
  assetVersionRepository?: IRepositoryPortAssetVersion
  documentVersionRepository?: IRepositoryPortDocumentVersion
  documentIndexEntryRepository?: IRepositoryPortDocumentIndexEntry
  documentSectionLinkRepository?: IRepositoryPortDocumentSectionLink
  sectionRepository?: IRepositoryPortSection
  pageRepository?: IRepositoryPortPage
  pageVersionRepository?: IRepositoryPortPageVersion
  sectionPageLinkRepository?: IRepositoryPortSectionPageLink
  pageSnippetLinkRepository?: IRepositoryPortPageSnippetLink
  pageEmbedLinkRepository?: IRepositoryPortPageEmbedLink
  embeddingProvider?: DocmanEmbeddingProvider
}

export interface DocumentServiceOptions {
  documentRepository: IRepositoryPortDocument
  serviceDependencies?: Partial<DocumentServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class DocumentService implements IDocumentServicePort {
  private readonly documentRepository: IRepositoryPortDocument
  private readonly assetRepository?: IRepositoryPortAsset
  private readonly assetVersionRepository?: IRepositoryPortAssetVersion
  private readonly documentVersionRepository?: IRepositoryPortDocumentVersion
  private readonly documentIndexEntryRepository?: IRepositoryPortDocumentIndexEntry
  private readonly documentSectionLinkRepository?: IRepositoryPortDocumentSectionLink
  private readonly sectionRepository?: IRepositoryPortSection
  private readonly pageRepository?: IRepositoryPortPage
  private readonly pageVersionRepository?: IRepositoryPortPageVersion
  private readonly sectionPageLinkRepository?: IRepositoryPortSectionPageLink
  private readonly pageSnippetLinkRepository?: IRepositoryPortPageSnippetLink
  private readonly pageEmbedLinkRepository?: IRepositoryPortPageEmbedLink
  private readonly embeddingProvider: DocmanEmbeddingProvider
  private readonly logger?: XfLogger
  private readonly locale?: string

  constructor(options: DocumentServiceOptions) {
    const deps = options.serviceDependencies ?? {}
    this.documentRepository = options.documentRepository
    this.assetRepository = deps.assetRepository
    this.assetVersionRepository = deps.assetVersionRepository
    this.documentVersionRepository = deps.documentVersionRepository
    this.documentIndexEntryRepository = deps.documentIndexEntryRepository
    this.documentSectionLinkRepository = deps.documentSectionLinkRepository
    this.sectionRepository = deps.sectionRepository
    this.pageRepository = deps.pageRepository
    this.pageVersionRepository = deps.pageVersionRepository
    this.sectionPageLinkRepository = deps.sectionPageLinkRepository
    this.pageSnippetLinkRepository = deps.pageSnippetLinkRepository
    this.pageEmbedLinkRepository = deps.pageEmbedLinkRepository
    this.embeddingProvider = deps.embeddingProvider ?? resolveDocmanDefaultEmbeddingProvider()
    this.logger = options.logger?.child({ module: this.constructor.name })
    this.locale = options.locale
  }

  getById(id: string, options?: DbQueryOptions<IbmDocument>): Effect.Effect<IbmDocument | null, DocumentServiceError> {
    const stage = 'DocumentService::getById'
    const localeState = this.resolveLocaleOptions()
    const queryOptions = this.withLocaleOptions(options, localeState, ['titleMl', 'summaryMl', 'descriptionMl'])
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((docId) =>
        this.documentRepository.findById(docId, queryOptions).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
        })
      )
    )
  }

  create(data: IbmDocumentInsert): Effect.Effect<IbmDocument, DocumentServiceError> {
    const stage = 'DocumentService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) =>
        validateBmInputWithSchema({
          input: payload,
          schema: documentZodSchemaInsert,
          stage,
          operation: 'DocumentService::create.documentZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((payload) =>
        this.documentRepository.create(payload).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    )
  }

  listDocuments(
    filter: Partial<IbmDocument> = {},
    options: DocumentListOptions = {},
  ): Effect.Effect<IbmDocumentWithVersions[], DocumentServiceError> {
    const stage = 'DocumentService::listDocuments'
    const includeVersionInfo = options?.includeVersionInfo === true
    const localeState = this.resolveLocaleOptions(options)
    const documentQueryOptions = this.withLocaleOptions(
      this.stripDocumentListOptions(options),
      localeState,
      ['titleMl', 'summaryMl', 'descriptionMl']
    )

    const versionQueryOptions = this.withLocaleOptions<IbmDocumentVersion>(
      {
        sort: [{ field: 'version', type: 'desc' }],
      },
      localeState,
      ['releaseNotesMl']
    ) ?? {
      sort: [{ field: 'version', type: 'desc' }],
    }

    return Effect.gen(this, function* () {
      const filtered = yield* validateInput(filter, 'filter', { stage })
      const documents = yield* this.documentRepository
        .find({
          matchEq: filtered,
          options: documentQueryOptions as DbQueryOptions<IbmDocument>,
        } as any)
        .pipe(
          Effect.mapError(
            mapDbError({
              stage,
              operation: 'find',
              factory: XfErrorFactory.notFound,
            })
          )
        )

      if (!includeVersionInfo) {
        return documents as IbmDocumentWithVersions[]
      }

      if (!this.documentVersionRepository) {
        return yield* Effect.fail(
          XfErrorFactory.configurationError({
            stage,
            operation: 'listDocuments',
            message: 'Missing dependency: documentVersionRepository',
          })
        )
      }

      const documentsWithVersions = yield* Effect.all(
        documents.map((document) =>
          this.documentVersionRepository!
            .find({
              matchEq: { documentId: document.id },
              options: versionQueryOptions as DbQueryOptions<IbmDocumentVersion>,
            } as any)
            .pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'find',
                  factory: XfErrorFactory.notFound,
                })
              ),
              Effect.map((versions) => ({
                ...document,
                documentVersions: versions.sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0)),
              }))
            )
        ),
        { concurrency: 6 }
      )

      return documentsWithVersions
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listDocuments')
        })
      )
    )
  }

  updateDocument(id: string, patch: Partial<IbmDocument>): Effect.Effect<IbmDocument, DocumentServiceError> {
    const stage = 'DocumentService::updateDocument'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: documentZodSchemaInsert.partial().strict(),
          stage,
          operation: 'DocumentService::updateDocument.documentZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(Effect.map(() => entityId))
      ),
      Effect.flatMap((entityId) =>
        this.documentRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateDocument')
        })
      )
    )
  }

  removeDocument(id: string): Effect.Effect<void, DocumentServiceError> {
    const stage = 'DocumentService::removeDocument'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.documentRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }

  buildDocumentIndex(
    documentVersionId: string,
    options?: DocumentLocaleOptions,
  ): Effect.Effect<DocmanDocumentComposeIndex, DocumentServiceError> {
    const stage = 'DocumentService::buildDocumentIndex'
    return Effect.gen(this, function* (_) {
      const versionId = yield* _(validateInput(documentVersionId, 'documentVersionId', { stage }))
      const resolved = yield* _(this.resolveComposedDocument(versionId, options, stage, 'buildDocumentIndex'))
      return this.toDocumentComposeIndex(resolved)
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in buildDocumentIndex')
        })
      )
    )
  }

  buildPersistedDocumentIndex(
    input: DocmanDocumentIndexBuildInput,
  ): Effect.Effect<DocmanDocumentIndexSnapshot, DocumentServiceError> {
    const stage = 'DocumentService::buildPersistedDocumentIndex'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const versionId = yield* _(validateInput(payload.documentVersionId, 'documentVersionId', { stage }))
      const localeKey = this.resolveDocumentIndexLocaleKey(payload)
      const buildKey = this.buildPersistedDocumentIndexBuildKey(versionId, localeKey)
      const activeBuild = activePersistedDocumentIndexBuilds.get(buildKey)
      if (activeBuild) {
        return yield* _(
          Effect.tryPromise({
            try: () => activeBuild,
            catch: (error) => error as DocumentServiceError,
          }),
        )
      }

      const buildPromise = Effect.runPromise(
        this.buildPersistedDocumentIndexForResolvedInput(payload, versionId, localeKey, stage),
      ).finally(() => {
        if (activePersistedDocumentIndexBuilds.get(buildKey) === buildPromise) {
          activePersistedDocumentIndexBuilds.delete(buildKey)
        }
      })
      activePersistedDocumentIndexBuilds.set(buildKey, buildPromise)

      return yield* _(
        Effect.tryPromise({
          try: () => buildPromise,
          catch: (error) => error as DocumentServiceError,
        }),
      )
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in buildPersistedDocumentIndex')
        })
      )
    )
  }

  private buildPersistedDocumentIndexForResolvedInput(
    payload: DocmanDocumentIndexBuildInput,
    versionId: string,
    localeKey: DocumentIndexLocaleKey,
    stage: string,
  ): Effect.Effect<DocmanDocumentIndexSnapshot, DocumentServiceError> {
    return Effect.gen(this, function* (_) {
      const repository = yield* _(
        this.requireDependency(this.documentIndexEntryRepository, 'documentIndexEntryRepository', stage, 'buildPersistedDocumentIndex')
      )
      const resolved = yield* _(this.resolveComposedDocument(versionId, payload, stage, 'buildPersistedDocumentIndex'))
      const rows = yield* _(
        this.populatePersistedDocumentIndexEmbeddings(
          this.toPersistedDocumentIndexRows(resolved, localeKey),
          stage,
          'buildPersistedDocumentIndex.embed',
        ),
      )
      const existingRows = yield* _(
        this.listPersistedDocumentIndexRows(repository, versionId, localeKey, stage, 'buildPersistedDocumentIndex.find')
      )
      yield* _(
        this.deletePersistedDocumentIndexRows(repository, existingRows, stage, 'buildPersistedDocumentIndex.delete')
      )

      const createdRows = yield* _(
        this.createPersistedDocumentIndexRows(
          repository,
          rows,
          versionId,
          localeKey,
          stage,
          'buildPersistedDocumentIndex.create',
        )
      )

      return this.toPersistedDocumentIndexSnapshot(versionId, localeKey, createdRows)
    })
  }

  getPersistedDocumentIndex(
    input: DocmanDocumentIndexGetInput,
  ): Effect.Effect<DocmanDocumentIndexSnapshot, DocumentServiceError> {
    const stage = 'DocumentService::getPersistedDocumentIndex'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const versionId = yield* _(validateInput(payload.documentVersionId, 'documentVersionId', { stage }))
      const localeKey = this.resolveDocumentIndexLocaleKey(payload)
      const repository = yield* _(
        this.requireDependency(this.documentIndexEntryRepository, 'documentIndexEntryRepository', stage, 'getPersistedDocumentIndex')
      )
      const rows = yield* _(
        this.listPersistedDocumentIndexRows(repository, versionId, localeKey, stage, 'getPersistedDocumentIndex.find')
      )
      return this.toPersistedDocumentIndexSnapshot(versionId, localeKey, rows)
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getPersistedDocumentIndex')
        })
      )
    )
  }

  buildPersistedDocumentSummary(
    input: DocmanDocumentSummaryBuildInput,
  ): Effect.Effect<DocmanDocumentSummarySnapshot, DocumentServiceError> {
    const stage = 'DocumentService::buildPersistedDocumentSummary'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const versionId = yield* _(validateInput(payload.documentVersionId, 'documentVersionId', { stage }))
      const localeKey = this.resolveDocumentIndexLocaleKey(payload)
      const repository = yield* _(
        this.requireDependency(this.documentIndexEntryRepository, 'documentIndexEntryRepository', stage, 'buildPersistedDocumentSummary')
      )

      yield* _(this.buildPersistedDocumentIndex(payload))

      const rows = yield* _(
        this.listPersistedDocumentIndexRows(repository, versionId, localeKey, stage, 'buildPersistedDocumentSummary.find')
      )
      if (rows.length === 0) {
        return this.toPersistedDocumentSummarySnapshot(versionId, localeKey, rows)
      }

      const authoredDocumentSummary = yield* _(
        this.resolvePersistedDocumentAuthoredSummaryText(rows, localeKey, stage, 'buildPersistedDocumentSummary.resolveAuthorSummary')
      )
      const summaryPatches = this.toPersistedDocumentSummaryPatches(rows, authoredDocumentSummary)

      yield* _(
        Effect.all(
          summaryPatches.map(({ id, patch }) =>
            repository.patchById(id, patch).pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'documentIndexEntryRepository.patchById',
                  factory: XfErrorFactory.upsertFailed,
                })
              )
            )
          ),
          { concurrency: 6 },
        ),
      )

      const updatedRows = yield* _(
        this.listPersistedDocumentIndexRows(repository, versionId, localeKey, stage, 'buildPersistedDocumentSummary.reload')
      )
      yield* _(
        this.refreshPersistedDocumentIndexEmbeddings(
          repository,
          updatedRows,
          stage,
          'buildPersistedDocumentSummary.embed',
        ),
      )

      return this.toPersistedDocumentSummarySnapshot(versionId, localeKey, updatedRows)
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in buildPersistedDocumentSummary')
        })
      )
    )
  }

  getPersistedDocumentSummary(
    input: DocmanDocumentSummaryGetInput,
  ): Effect.Effect<DocmanDocumentSummarySnapshot, DocumentServiceError> {
    const stage = 'DocumentService::getPersistedDocumentSummary'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const versionId = yield* _(validateInput(payload.documentVersionId, 'documentVersionId', { stage }))
      const localeKey = this.resolveDocumentIndexLocaleKey(payload)
      const repository = yield* _(
        this.requireDependency(this.documentIndexEntryRepository, 'documentIndexEntryRepository', stage, 'getPersistedDocumentSummary')
      )
      const rows = yield* _(
        this.listPersistedDocumentIndexRows(repository, versionId, localeKey, stage, 'getPersistedDocumentSummary.find')
      )
      return this.toPersistedDocumentSummarySnapshot(versionId, localeKey, rows)
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getPersistedDocumentSummary')
        })
      )
    )
  }

  searchPersistedDocumentIndex(
    input: DocmanDocumentSearchInput,
  ): Effect.Effect<DocmanDocumentSearchResult, DocumentServiceError> {
    const stage = 'DocumentService::searchPersistedDocumentIndex'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const versionId = yield* _(validateInput(payload.documentVersionId, 'documentVersionId', { stage }))
      const q = this.normalizeNonEmpty(payload.q)
      if (!q) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'q', stage })))
      }

      const localeKey = this.resolveDocumentIndexLocaleKey(payload)
      const repository = yield* _(
        this.requireDependency(this.documentIndexEntryRepository, 'documentIndexEntryRepository', stage, 'searchPersistedDocumentIndex')
      )
      const rows = yield* _(
        this.listPersistedDocumentIndexRows(repository, versionId, localeKey, stage, 'searchPersistedDocumentIndex.find')
      )

      return yield* _(
        this.searchPersistedDocumentIndexRows(
          versionId,
          localeKey,
          q,
          payload.limit,
          payload.retrievalStrategy,
          rows,
        ),
      )
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in searchPersistedDocumentIndex')
        })
      )
    )
  }

  searchScopePersistedDocumentIndex(
    input: DocmanScopeDocumentSearchInput,
  ): Effect.Effect<DocmanScopeDocumentSearchResult, DocumentServiceError> {
    const stage = 'DocumentService::searchScopePersistedDocumentIndex'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const scopeId = yield* _(validateInput(payload.scopeId, 'scopeId', { stage }))
      const q = this.normalizeNonEmpty(payload.q)
      if (!q) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'q', stage })))
      }

      const localeKey = this.resolveDocumentIndexLocaleKey(payload)
      const repository = yield* _(
        this.requireDependency(
          this.documentIndexEntryRepository,
          'documentIndexEntryRepository',
          stage,
          'searchScopePersistedDocumentIndex',
        ),
      )
      const documents = yield* _(
        this.listDocuments(
          { scopeId },
          {
            includeVersionInfo: true,
            locale: localeKey.locale,
            fallbackLocale: localeKey.fallbackLocale,
          } as DocumentListOptions,
        ),
      )

      const retrievalStrategy = this.resolveDocumentRetrievalStrategy(payload.retrievalStrategy)
      const limit = this.resolveDocumentIndexSearchLimit(payload.limit)
      const autoBuiltDocumentVersionIds: string[] = []
      const failures: DocmanScopeDocumentSearchFailure[] = []
      const aggregatedHits: DocmanScopeDocumentSearchHit[] = []
      let searchedDocumentCount = 0

      for (const document of documents) {
        const seed = this.resolveScopeSearchDocumentSeed(document)
        if (!seed) {
          failures.push({
            documentId: this.normalizeNonEmpty(document.id),
            documentTitle: this.normalizeNonEmpty(document.title),
            stage: 'resolve-latest-version',
            message: 'Latest document version could not be resolved.',
          })
          continue
        }

        let rows = yield* _(
          this.listPersistedDocumentIndexRows(
            repository,
            seed.documentVersionId,
            localeKey,
            stage,
            'searchScopePersistedDocumentIndex.find',
          ),
        )

        if (rows.length === 0) {
          const buildAttempt = yield* _(
            Effect.either(
              this.buildPersistedDocumentIndex({
                documentVersionId: seed.documentVersionId,
                locale: localeKey.locale,
                fallbackLocale: localeKey.fallbackLocale,
              }),
            ),
          )
          if (buildAttempt._tag === 'Left') {
            failures.push({
              documentId: seed.documentId,
              documentTitle: seed.documentTitle,
              documentVersionId: seed.documentVersionId,
              stage: 'build-index',
              message: this.describeScopeSearchError(buildAttempt.left),
            })
            continue
          }
          autoBuiltDocumentVersionIds.push(seed.documentVersionId)
          rows = yield* _(
            this.listPersistedDocumentIndexRows(
              repository,
              seed.documentVersionId,
              localeKey,
              stage,
              'searchScopePersistedDocumentIndex.reload',
            ),
          )
        }

        const searchResult = yield* _(
          Effect.either(
            this.searchPersistedDocumentIndexRows(
              seed.documentVersionId,
              localeKey,
              q,
              limit,
              retrievalStrategy,
              rows,
            ),
          ),
        )
        if (searchResult._tag === 'Left') {
          failures.push({
            documentId: seed.documentId,
            documentTitle: seed.documentTitle,
            documentVersionId: seed.documentVersionId,
            stage: 'search',
            message: this.describeScopeSearchError(searchResult.left),
          })
          continue
        }

        searchedDocumentCount += 1
        aggregatedHits.push(
          ...searchResult.right.hits.map((hit) =>
            this.toScopeDocumentSearchHit(seed, hit),
          ),
        )
      }

      const hits = [...aggregatedHits]
        .sort((left, right) => {
          const scoreDelta = right.score - left.score
          if (scoreDelta !== 0) return scoreDelta
          const pageDelta =
            (left.pageNumberStart ?? Number.MAX_SAFE_INTEGER) - (right.pageNumberStart ?? Number.MAX_SAFE_INTEGER)
          if (pageDelta !== 0) return pageDelta
          const titleDelta = left.documentTitle.localeCompare(right.documentTitle)
          if (titleDelta !== 0) return titleDelta
          const breadcrumbDelta = left.breadcrumb.localeCompare(right.breadcrumb)
          if (breadcrumbDelta !== 0) return breadcrumbDelta
          return left.anchor.localeCompare(right.anchor)
        })
        .slice(0, limit)

      return {
        scopeId,
        locale: localeKey.locale,
        fallbackLocale: localeKey.fallbackLocale,
        q,
        hits,
        provenance: {
          strategy: this.toDocumentSearchStrategy(retrievalStrategy),
          retrievalStrategy,
          totalDocumentCount: documents.length,
          searchedDocumentCount,
          autoBuiltDocumentCount: autoBuiltDocumentVersionIds.length,
          failedDocumentCount: failures.length,
        },
        buildReport: {
          autoBuiltDocumentVersionIds,
          failures,
        } satisfies DocmanScopeDocumentSearchBuildReport,
      }
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in searchScopePersistedDocumentIndex')
        }),
      ),
    )
  }

  getDocumentAnswerPack(
    input: DocmanDocumentAnswerPackInput,
  ): Effect.Effect<DocmanDocumentAnswerPackResult, DocumentServiceError> {
    const stage = 'DocumentService::getDocumentAnswerPack'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const versionId = yield* _(validateInput(payload.documentVersionId, 'documentVersionId', { stage }))
      const q = this.normalizeNonEmpty(payload.q)
      if (!q) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'q', stage })))
      }

      const localeKey = this.resolveDocumentIndexLocaleKey(payload)
      const repository = yield* _(
        this.requireDependency(this.documentIndexEntryRepository, 'documentIndexEntryRepository', stage, 'getDocumentAnswerPack')
      )
      const rows = yield* _(
        this.listPersistedDocumentIndexRows(repository, versionId, localeKey, stage, 'getDocumentAnswerPack.find')
      )

      return yield* _(
        this.buildDocumentAnswerPack(
          versionId,
          localeKey,
          q,
          payload.limit,
          payload.retrievalStrategy,
          rows,
        ),
      )
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getDocumentAnswerPack')
        })
      )
    )
  }

  fetchComposedFragment(
    input: DocmanDocumentComposeFetchInput,
  ): Effect.Effect<DocmanDocumentComposeFetchResult, DocumentServiceError> {
    const stage = 'DocumentService::fetchComposedFragment'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const versionId = yield* _(validateInput(payload.documentVersionId, 'documentVersionId', { stage }))
      const resolved = yield* _(this.resolveComposedDocument(versionId, payload, stage, 'fetchComposedFragment'))

      if (payload.pageNumber !== undefined) {
        const pageNumber = Number(payload.pageNumber)
        if (!Number.isInteger(pageNumber) || pageNumber <= 0) {
          return yield* _(
            Effect.fail(
              XfErrorFactory.inputRequired({
                field: 'pageNumber',
                stage,
                message: 'pageNumber must be a positive integer.',
              })
            )
          )
        }

        const page = resolved.pages.find((item) => item.pageNumber === pageNumber)
        if (!page) {
          return yield* _(
            Effect.fail(
              XfErrorFactory.notFound({
                stage,
                operation: 'fetchComposedFragment',
                message: 'Composed page not found.',
                identifier: { documentVersionId: versionId, pageNumber },
              })
            )
          )
        }

        const bundle = this.renderPageSourceBundle(resolved.title, page)
        return {
          documentVersionId: versionId,
          kind: 'page' as const,
          pageNumber,
          ...bundle,
        }
      }

      const targetPageVersionId = this.normalizeNonEmpty(payload.pageVersionId)
      if (targetPageVersionId) {
        const pageItem = resolved.items.find(
          (item): item is PageComposeItem => item.kind === 'page' && item.pageVersionId === targetPageVersionId,
        )
        if (!pageItem) {
          return yield* _(
            Effect.fail(
              XfErrorFactory.notFound({
                stage,
                operation: 'fetchComposedFragment',
                message: 'Page not found in composed document.',
                identifier: { documentVersionId: versionId, pageVersionId: targetPageVersionId },
              })
            )
          )
        }

        const bundle = this.renderSinglePageItemSourceBundle(resolved.title, pageItem)
        return {
          documentVersionId: versionId,
          kind: 'page' as const,
          pageVersionId: pageItem.pageVersionId,
          ...bundle,
        }
      }

      const targetSectionId = this.normalizeNonEmpty(payload.sectionId)
      if (targetSectionId) {
        const sectionItem = resolved.items.find(
          (item): item is SectionComposeItem => item.kind === 'section' && item.sectionId === targetSectionId,
        )
        if (!sectionItem) {
          return yield* _(
            Effect.fail(
              XfErrorFactory.notFound({
                stage,
                operation: 'fetchComposedFragment',
                message: 'Section not found in composed document.',
                identifier: { documentVersionId: versionId, sectionId: targetSectionId },
              })
            )
          )
        }

        const bundle = this.renderSectionSourceBundleFromSection(resolved.title, resolved, sectionItem)
        return {
          documentVersionId: versionId,
          kind: 'section' as const,
          sectionId: sectionItem.sectionId,
          ...bundle,
        }
      }

      const bundle = this.renderDocumentSourceBundleFromResolved(resolved)
      return {
        documentVersionId: versionId,
        kind: 'document' as const,
        ...bundle,
      }
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in fetchComposedFragment')
        })
      )
    )
  }

  materializePublishedFragment(
    input: DocmanDocumentPublishMaterializeInput,
  ): Effect.Effect<DocmanDocumentPublishMaterializeResult, DocumentServiceError> {
    const stage = 'DocumentService::materializePublishedFragment'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const targetDescriptor = resolveDocmanPublishTargetDescriptor(payload.target)
      if (!targetDescriptor) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.inputRequired({
              field: 'target',
              stage,
              message: `target must be one of: ${formatDocmanPublishTargets()}`,
            }),
          ),
        )
      }
      const composed = yield* _(
        this.fetchComposedFragment({
          documentVersionId: payload.documentVersionId,
          sectionId: payload.sectionId,
          pageVersionId: payload.pageVersionId,
          pageNumber: payload.pageNumber,
          locale: payload.locale,
          fallbackLocale: payload.fallbackLocale,
        }),
      )

      const materialized = this.materializePublishContent(composed, targetDescriptor)
      return {
        ...composed,
        target: targetDescriptor.target,
        mediaType: materialized.mediaType,
        content: materialized.content,
        warnings: materialized.warnings,
      }
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in materializePublishedFragment')
        })
      )
    )
  }

  removeDocumentSafe(id: string, confirmName: string): Effect.Effect<DocmanDocumentDeleteReport, DocumentServiceError> {
    const stage = 'DocumentService::removeDocumentSafe'

    return Effect.gen(this, function* (_) {
      const entityId = yield* _(validateInput(id, 'id', { stage }))
      const confirmation = String(confirmName ?? '').trim()
      if (!confirmation) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'confirmName', stage })))
      }

      const document = yield* _(
        this.documentRepository.findById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      )

      const expected = String(document?.title ?? '').trim()
      if (confirmation !== expected) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.upsertFailed({
              stage,
              operation: 'confirmName',
              message: 'Document title confirmation mismatch.',
              data: { expected, received: confirmation },
            })
          )
        )
      }

      const dependencies = yield* _(this.resolveCascadeDependencies(stage, 'removeDocumentSafe'))
      return yield* _(
        (deleteDocumentCascade(dependencies, entityId, stage).pipe(
          Effect.mapError((error) => this.normalizeCascadeError(stage, 'removeDocumentSafe.cascade', error))
        )) as Effect.Effect<DocmanDocumentDeleteReport, DocumentServiceError>
      )
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeDocumentSafe')
        })
      )
    )
  }

  private resolveComposedDocument(
    documentVersionId: string,
    options: DocumentLocaleOptions | undefined,
    stage: string,
    operation: string,
  ): Effect.Effect<ResolvedComposeDocument, DocumentServiceError> {
    return Effect.gen(this, function* (_) {
      const localeState = this.resolveLocaleOptions(options)
      const documentVersionRepository = yield* _(
        this.requireDependency(this.documentVersionRepository, 'documentVersionRepository', stage, operation)
      )
      const documentSectionLinkRepository = yield* _(
        this.requireDependency(this.documentSectionLinkRepository, 'documentSectionLinkRepository', stage, operation)
      )
      const sectionRepository = yield* _(
        this.requireDependency(this.sectionRepository, 'sectionRepository', stage, operation)
      )
      const pageVersionRepository = yield* _(
        this.requireDependency(this.pageVersionRepository, 'pageVersionRepository', stage, operation)
      )

      const documentVersionQueryOptions = this.withLocaleOptions<IbmDocumentVersion>(undefined, localeState, ['releaseNotesMl'])
      const sectionQueryOptions = this.withLocaleOptions<IbmSection>(undefined, localeState, ['titleMl'])
      const pageQueryOptions = this.withLocaleOptions<IbmPage>(undefined, localeState, ['titleMl'])
      const pageVersionQueryOptions = this.withLocaleOptions<IbmPageVersion>(undefined, localeState, ['contentMl'])

      const documentVersion = yield* _(
        documentVersionRepository.findById(documentVersionId, documentVersionQueryOptions).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'documentVersionRepository.findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!documentVersion?.id) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.notFound({
              stage,
              operation: 'documentVersionRepository.findById',
              message: 'Document version not found.',
              identifier: { documentVersionId },
            })
          )
        )
      }

      const documentQueryOptions = this.withLocaleOptions<IbmDocument>(undefined, localeState, ['titleMl', 'summaryMl', 'descriptionMl'])
      const document = yield* _(
        this.documentRepository.findById(documentVersion.documentId, documentQueryOptions).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'documentRepository.findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!document?.id) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.notFound({
              stage,
              operation: 'documentRepository.findById',
              message: 'Document not found.',
              identifier: { documentId: documentVersion.documentId },
            })
          )
        )
      }

      const links = yield* _(
        documentSectionLinkRepository
          .find({
            matchEq: { documentVersionId },
            options: { sort: [{ field: 'position', type: 'asc' }] },
          } as any)
          .pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation: 'documentSectionLinkRepository.find',
                factory: XfErrorFactory.notFound,
              })
            )
          )
      )

      const traversed = this.traverseLinks<IbmDocumentSectionLink>(links, undefined, 0)
      const items: ComposeItem[] = []

      for (const node of traversed) {
        const linkId = node.link.id
        if (!linkId) continue

        if (node.link.kind === 'section') {
          const sectionId = this.normalizeNonEmpty(node.link.sectionId)
          if (!sectionId) continue

          const section = yield* _(
            sectionRepository.findById(sectionId, sectionQueryOptions).pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'sectionRepository.findById',
                  factory: XfErrorFactory.notFound,
                })
              )
            )
          )
          if (!section) continue

          items.push({
            linkId,
            kind: 'section',
            sectionId,
            sectionUid: this.normalizeNonEmpty(section.sectionUid),
            sectionSlug: this.normalizeNonEmpty(section.slug),
            number: node.number,
            depth: node.depth,
            position: node.link.position,
            title: this.resolveSectionTitle(section, node.link.titleOverride, localeState),
            parentLinkId: this.normalizeNonEmpty(node.link.parentLinkId),
            titleVisible: node.link.titleVisible !== false,
            pageBreakBefore: node.link.pageBreakBefore === true,
            pageBreakAfter: node.link.pageBreakAfter === true,
            directives: node.link.directives,
          })
          continue
        }

        if (node.link.kind === 'page') {
          const pageVersionId = this.normalizeNonEmpty(node.link.pageVersionId)
          if (!pageVersionId) continue

          const pageVersion = yield* _(
            pageVersionRepository.findById(pageVersionId, pageVersionQueryOptions).pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'pageVersionRepository.findById',
                  factory: XfErrorFactory.notFound,
                })
              )
            )
          )
          if (!pageVersion?.id) continue

          const resolvedPageSource = yield* _(
            this.resolveComposePageSource(pageVersion, localeState, stage, operation)
          )

          let page: IbmPage | null = null
          if (this.pageRepository) {
            page = yield* _(
              this.pageRepository.findById(pageVersion.pageId, pageQueryOptions).pipe(
                Effect.mapError(
                  mapDbError({
                    stage,
                    operation: 'pageRepository.findById',
                    factory: XfErrorFactory.notFound,
                  })
                )
              )
            )
          }

          items.push({
            linkId,
            kind: 'page',
            pageVersionId,
            pageId: pageVersion.pageId,
            pageUid: this.normalizeNonEmpty(page?.pageUid),
            format: resolvedPageSource.format,
            modulePreamble: resolvedPageSource.modulePreamble,
            number: node.number,
            depth: node.depth,
            position: node.link.position,
            title: this.resolvePageTitle(page, pageVersion, node.link.titleOverride, localeState),
            parentLinkId: this.normalizeNonEmpty(node.link.parentLinkId),
            titleVisible: node.link.titleVisible !== false,
            pageBreakBefore: node.link.pageBreakBefore === true,
            pageBreakAfter: node.link.pageBreakAfter === true,
            directives: node.link.directives ?? pageVersion.directives,
            contentParts: this.splitContentByPageBreakMarkers(resolvedPageSource.content),
            assetRefs: resolvedPageSource.assets,
          })
        }
      }

      return {
        document: document as IbmDocument & { id: string },
        documentVersion: documentVersion as IbmDocumentVersion & { id: string },
        title: this.resolveDocumentTitle(document, documentVersion, localeState),
        documentReleaseNotes: this.resolveVersionReleaseNotes(documentVersion, localeState),
        items,
        pages: this.composeDynamicPages(items),
      }
    })
  }

  private composeDynamicPages(items: ComposeItem[]): ComposedPage[] {
    const pages: ComposedPage[] = [this.createEmptyPage(1)]
    let currentPage = pages[0]

    const hasPageContent = (page: ComposedPage): boolean => page.chunks.length > 0

    const startNewPage = (onlyIfCurrentHasContent = true) => {
      if (onlyIfCurrentHasContent && !hasPageContent(currentPage)) return
      currentPage = this.createEmptyPage(pages.length + 1)
      pages.push(currentPage)
    }

    for (const item of items) {
      if (item.pageBreakBefore) {
        startNewPage(true)
      }

      this.pushUnique(currentPage.itemNumbers, item.number)

      if (item.kind !== 'page') {
        if (item.pageBreakAfter) {
          startNewPage(true)
        }
        continue
      }

      const parts = item.contentParts.length > 0 ? item.contentParts : ['']
      for (let i = 0; i < parts.length; i++) {
        const content = parts[i] ?? ''
        this.pushUnique(currentPage.itemNumbers, item.number)
        this.pushUnique(currentPage.pageVersionIds, item.pageVersionId)

        currentPage.chunks.push({
          linkId: item.linkId,
          number: item.number,
          depth: item.depth,
          title: item.title,
          titleVisible: item.titleVisible,
          pageVersionId: item.pageVersionId,
        pageId: item.pageId,
        format: item.format,
        modulePreamble: item.modulePreamble,
        content,
        assets: item.assetRefs,
        chunkIndex: i + 1,
        chunkCount: parts.length,
      })

        if (i < parts.length - 1) {
          startNewPage(true)
        }
      }

      if (item.pageBreakAfter) {
        startNewPage(true)
      }
    }

    if (pages.length > 1 && !hasPageContent(pages[pages.length - 1])) {
      pages.pop()
    }

    return pages.map((page, index) => ({
      ...page,
      pageNumber: index + 1,
      ...reduceDocmanComposeFormats(page.chunks.map((chunk) => chunk.format)),
      modulePreambles: this.uniqueModulePreambles(page.chunks.map((chunk) => chunk.modulePreamble)),
      assets: this.uniqueAssetRefs(page.chunks.flatMap((chunk) => chunk.assets)),
    }))
  }

  private createEmptyPage(pageNumber: number): ComposedPage {
    return {
      pageNumber,
      format: 'md',
      formats: ['md'],
      itemNumbers: [],
      pageVersionIds: [],
      chunks: [],
      modulePreambles: [],
      assets: [],
    }
  }

  private toDocumentComposeIndex(resolved: ResolvedComposeDocument): DocmanDocumentComposeIndex {
    const items: DocmanDocumentComposeIndexItem[] = resolved.items.map((item) => {
      if (item.kind === 'section') {
        return {
          kind: 'section',
          linkId: item.linkId,
          sectionId: item.sectionId,
          number: item.number,
          depth: item.depth,
          position: item.position,
          title: item.title,
          pageBreakBefore: item.pageBreakBefore,
          pageBreakAfter: item.pageBreakAfter,
          parentLinkId: item.parentLinkId,
          directives: item.directives,
        }
      }

      return {
        kind: 'page',
        linkId: item.linkId,
        pageVersionId: item.pageVersionId,
        pageId: item.pageId,
        format: item.format,
        number: item.number,
        depth: item.depth,
        position: item.position,
        title: item.title,
        titleVisible: item.titleVisible,
        pageBreakBefore: item.pageBreakBefore,
        pageBreakAfter: item.pageBreakAfter,
        parentLinkId: item.parentLinkId,
        directives: item.directives,
      }
    })

    return {
      documentId: resolved.document.id,
      documentVersionId: resolved.documentVersion.id,
      title: resolved.title,
      items,
      pages: resolved.pages.map((page) => ({
        pageNumber: page.pageNumber,
        format: page.format,
        formats: [...page.formats],
        itemNumbers: [...page.itemNumbers],
        pageVersionIds: [...page.pageVersionIds],
      })),
    }
  }

  private resolveDocumentIndexLocaleKey(options?: DocumentLocaleOptions): DocumentIndexLocaleKey {
    const localeState = this.resolveLocaleOptions(options)
    const locale = normalizeDocmanDocumentIndexLocale(localeState.locale)
    const fallbackLocale = normalizeDocmanDocumentIndexLocale(localeState.fallbackLocale)
    return {
      ...(locale ? { locale } : {}),
      ...(fallbackLocale ? { fallbackLocale } : {}),
    }
  }

  private listPersistedDocumentIndexRows(
    repository: IRepositoryPortDocumentIndexEntry,
    documentVersionId: string,
    localeKey: DocumentIndexLocaleKey,
    stage: string,
    operation: string,
  ): Effect.Effect<IbmDocumentIndexEntry[], DocumentServiceError> {
    return repository
      .find({
        matchEq: {
          documentVersionId,
          locale: localeKey.locale ?? '',
          fallbackLocale: localeKey.fallbackLocale ?? '',
        },
        options: {
          sort: [
            { field: 'sortOrder', type: 'asc' },
            { field: 'position', type: 'asc' },
          ],
        },
      } as any)
      .pipe(
        Effect.map((rows) =>
          [...rows].sort((left, right) => {
            const sortDelta = Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
            if (sortDelta !== 0) return sortDelta
            return String(left.id ?? '').localeCompare(String(right.id ?? ''))
          }),
        ),
        Effect.mapError(
          mapDbError({
            stage,
            operation,
            factory: XfErrorFactory.notFound,
          }),
        ),
      )
  }

  private deletePersistedDocumentIndexRows(
    repository: IRepositoryPortDocumentIndexEntry,
    rows: readonly IbmDocumentIndexEntry[],
    stage: string,
    operation: string,
  ): Effect.Effect<void, DocumentServiceError> {
    if (!rows.length) return Effect.succeed(undefined)
    return Effect.all(
      rows
        .map((row) => this.normalizeNonEmpty(row.id))
        .filter((id): id is string => Boolean(id))
        .map((id) =>
          repository.deleteById(id).pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation,
                factory: XfErrorFactory.upsertFailed,
              }),
            ),
          ),
        ),
      { concurrency: 6 },
    ).pipe(Effect.asVoid)
  }

  private createPersistedDocumentIndexRows(
    repository: IRepositoryPortDocumentIndexEntry,
    rows: readonly IbmDocumentIndexEntryInsert[],
    documentVersionId: string,
    localeKey: DocumentIndexLocaleKey,
    stage: string,
    operation: string,
  ): Effect.Effect<IbmDocumentIndexEntry[], DocumentServiceError> {
    if (rows.length === 0) return Effect.succeed([])

    const createRows = Effect.all(
      rows.map((row) =>
        repository.create(row).pipe(
          Effect.mapError(
            mapDbError({
              stage,
              operation: 'documentIndexEntryRepository.create',
              factory: XfErrorFactory.createFailed,
            }),
          ),
        ),
      ),
      { concurrency: 6 },
    )

    return createRows.pipe(
      Effect.catchAll((error) =>
        this.listPersistedDocumentIndexRows(repository, documentVersionId, localeKey, stage, `${operation}.reload`).pipe(
          Effect.flatMap((currentRows) =>
            this.matchesPersistedDocumentIndexRows(rows, currentRows)
              ? Effect.succeed(currentRows)
              : Effect.fail(error),
          ),
          Effect.catchAll(() => Effect.fail(error)),
        ),
      ),
    )
  }

  private matchesPersistedDocumentIndexRows(
    expectedRows: readonly IbmDocumentIndexEntryInsert[],
    actualRows: readonly IbmDocumentIndexEntry[],
  ): boolean {
    if (expectedRows.length !== actualRows.length) return false

    const actualByKey = new Map(actualRows.map((row) => [this.persistedDocumentIndexRowKey(row), row]))
    for (const expectedRow of expectedRows) {
      const actualRow = actualByKey.get(this.persistedDocumentIndexRowKey(expectedRow))
      if (!actualRow || !this.matchesPersistedDocumentIndexRow(expectedRow, actualRow)) {
        return false
      }
    }

    return true
  }

  private matchesPersistedDocumentIndexRow(
    expectedRow: IbmDocumentIndexEntryInsert,
    actualRow: IbmDocumentIndexEntry,
  ): boolean {
    const fields: readonly (keyof IbmDocumentIndexEntryInsert)[] = [
      'documentVersionId',
      'documentId',
      'locale',
      'fallbackLocale',
      'itemKind',
      'sortOrder',
      'buildFingerprint',
      'linkId',
      'parentLinkId',
      'anchor',
      'parentAnchor',
      'number',
      'depth',
      'position',
      'title',
      'breadcrumb',
      'titleVisible',
      'pageBreakBefore',
      'pageBreakAfter',
      'sectionId',
      'sectionUid',
      'sectionSlug',
      'pageId',
      'pageUid',
      'pageVersionId',
      'format',
      'pageNumberStart',
      'pageNumberEnd',
      'bodyText',
      'searchText',
    ]

    return fields.every(
      (field) =>
        this.normalizePersistedDocumentIndexComparableValue(expectedRow[field]) ===
        this.normalizePersistedDocumentIndexComparableValue(actualRow[field]),
    )
  }

  private persistedDocumentIndexRowKey(row: Partial<IbmDocumentIndexEntry>): string {
    return `${Number(row.sortOrder ?? -1)}::${this.normalizeNonEmpty(row.anchor) ?? ''}`
  }

  private normalizePersistedDocumentIndexComparableValue(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  }

  private buildPersistedDocumentIndexBuildKey(
    documentVersionId: string,
    localeKey: DocumentIndexLocaleKey,
  ): string {
    return `${documentVersionId}::${localeKey.locale ?? ''}::${localeKey.fallbackLocale ?? ''}`
  }

  private toPersistedDocumentIndexRows(
    resolved: ResolvedComposeDocument,
    localeKey: DocumentIndexLocaleKey,
  ): IbmDocumentIndexEntryInsert[] {
    const pageRangesByLinkId = this.buildPersistedDocumentPageRanges(resolved.pages)
    const fingerprint = buildDocmanDocumentIndexFingerprint({
      documentVersionId: resolved.documentVersion.id,
      title: resolved.title,
      locale: localeKey.locale ?? '',
      fallbackLocale: localeKey.fallbackLocale ?? '',
      items: resolved.items.map((item) =>
        item.kind === 'section'
          ? {
              kind: item.kind,
              linkId: item.linkId,
              parentLinkId: item.parentLinkId,
              number: item.number,
              depth: item.depth,
              position: item.position,
              title: item.title,
              sectionId: item.sectionId,
              sectionUid: item.sectionUid,
              sectionSlug: item.sectionSlug,
            }
          : {
              kind: item.kind,
              linkId: item.linkId,
              parentLinkId: item.parentLinkId,
              number: item.number,
              depth: item.depth,
              position: item.position,
              title: item.title,
              pageId: item.pageId,
              pageUid: item.pageUid,
              pageVersionId: item.pageVersionId,
              format: item.format,
              content: item.contentParts,
              assets: item.assetRefs.map((assetRef) => assetRef.assetVersionId),
            },
      ),
      pages: resolved.pages.map((page) => ({
        pageNumber: page.pageNumber,
        linkIds: page.chunks.map((chunk) => chunk.linkId),
      })),
    })

    const documentAnchor = buildDocmanDocumentAnchor(resolved.document.documentUid ?? resolved.document.id)
    const anchorByLinkId = new Map<string, string>()
    const breadcrumbByLinkId = new Map<string, string>()
    const rows: IbmDocumentIndexEntryInsert[] = []

    rows.push({
      documentVersionId: resolved.documentVersion.id,
      documentId: resolved.document.id,
      locale: localeKey.locale ?? '',
      fallbackLocale: localeKey.fallbackLocale ?? '',
      itemKind: 'document',
      sortOrder: 0,
      buildFingerprint: fingerprint,
      anchor: documentAnchor,
      depth: 0,
      position: 0,
      title: resolved.title,
      breadcrumb: resolved.title,
      titleVisible: true,
      pageBreakBefore: false,
      pageBreakAfter: false,
      createdBy: DOCMAN_DOCUMENT_INDEX_BUILD_ACTOR,
      updatedBy: DOCMAN_DOCUMENT_INDEX_BUILD_ACTOR,
      searchText: this.normalizeDocumentIndexSearchText(
        [resolved.title, this.normalizeNonEmpty(resolved.documentReleaseNotes)].filter(Boolean).join('\n'),
      ),
    })

    for (const [index, item] of resolved.items.entries()) {
      const parentAnchor = item.parentLinkId
        ? anchorByLinkId.get(item.parentLinkId) ?? documentAnchor
        : documentAnchor
      const breadcrumb = this.buildDocumentIndexBreadcrumb(
        item.title,
        item.parentLinkId,
        breadcrumbByLinkId,
        resolved.title,
      )

      if (item.kind === 'section') {
        const anchor = buildDocmanSectionAnchor(item.sectionSlug ?? item.sectionUid ?? item.sectionId, item.linkId)
        anchorByLinkId.set(item.linkId, anchor)
        breadcrumbByLinkId.set(item.linkId, breadcrumb)
        rows.push({
          documentVersionId: resolved.documentVersion.id,
          documentId: resolved.document.id,
          locale: localeKey.locale ?? '',
          fallbackLocale: localeKey.fallbackLocale ?? '',
          itemKind: 'section',
          sortOrder: index + 1,
          buildFingerprint: fingerprint,
          linkId: item.linkId,
          parentLinkId: item.parentLinkId,
          anchor,
          parentAnchor,
          number: item.number,
          depth: item.depth,
          position: item.position,
          title: item.title,
          breadcrumb,
          titleVisible: item.titleVisible,
          pageBreakBefore: item.pageBreakBefore,
          pageBreakAfter: item.pageBreakAfter,
          sectionId: item.sectionId,
          sectionUid: item.sectionUid,
          sectionSlug: item.sectionSlug,
          createdBy: DOCMAN_DOCUMENT_INDEX_BUILD_ACTOR,
          updatedBy: DOCMAN_DOCUMENT_INDEX_BUILD_ACTOR,
          searchText: this.normalizeDocumentIndexSearchText(
            [item.number, item.title, breadcrumb].filter(Boolean).join('\n'),
          ),
        })
        continue
      }

      const anchor = buildDocmanPageAnchor(item.pageUid ?? item.pageId, item.linkId)
      const pageRange = pageRangesByLinkId.get(item.linkId)
      const bodyText = this.extractDocumentIndexBodyText(item)
      anchorByLinkId.set(item.linkId, anchor)
      breadcrumbByLinkId.set(item.linkId, breadcrumb)
      rows.push({
        documentVersionId: resolved.documentVersion.id,
        documentId: resolved.document.id,
        locale: localeKey.locale ?? '',
        fallbackLocale: localeKey.fallbackLocale ?? '',
        itemKind: 'page',
        sortOrder: index + 1,
        buildFingerprint: fingerprint,
        linkId: item.linkId,
        parentLinkId: item.parentLinkId,
        anchor,
        parentAnchor,
        number: item.number,
        depth: item.depth,
        position: item.position,
        title: item.title,
        breadcrumb,
        titleVisible: item.titleVisible,
        pageBreakBefore: item.pageBreakBefore,
        pageBreakAfter: item.pageBreakAfter,
        pageId: item.pageId,
        pageUid: item.pageUid,
        pageVersionId: item.pageVersionId,
        format: item.format,
        pageNumberStart: pageRange?.start,
        pageNumberEnd: pageRange?.end,
        bodyText,
        searchText: this.normalizeDocumentIndexSearchText(
          [item.number, item.title, breadcrumb, bodyText].filter(Boolean).join('\n'),
        ),
        createdBy: DOCMAN_DOCUMENT_INDEX_BUILD_ACTOR,
        updatedBy: DOCMAN_DOCUMENT_INDEX_BUILD_ACTOR,
      })
    }

    return rows
  }

  private toPersistedDocumentIndexSnapshot(
    documentVersionId: string,
    localeKey: DocumentIndexLocaleKey,
    rows: readonly IbmDocumentIndexEntry[],
  ): DocmanDocumentIndexSnapshot {
    const sorted = [...rows].sort((left, right) => {
      const sortDelta = Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
      if (sortDelta !== 0) return sortDelta
      return String(left.id ?? '').localeCompare(String(right.id ?? ''))
    })
    const documentRow = sorted.find((row) => row.itemKind === 'document')
    const entries = sorted
      .filter((row) => row.itemKind === 'section' || row.itemKind === 'page')
      .map((row) => this.toPersistedDocumentIndexSnapshotEntry(row))

    return {
      documentId: this.normalizeNonEmpty(documentRow?.documentId) ?? this.normalizeNonEmpty(sorted[0]?.documentId),
      documentVersionId,
      title: this.normalizeNonEmpty(documentRow?.title),
      locale: this.normalizeNonEmpty(documentRow?.locale) ?? localeKey.locale,
      fallbackLocale: this.normalizeNonEmpty(documentRow?.fallbackLocale) ?? localeKey.fallbackLocale,
      built: sorted.length > 0,
      buildFingerprint:
        this.normalizeNonEmpty(documentRow?.buildFingerprint) ??
        this.normalizeNonEmpty(sorted[0]?.buildFingerprint),
      documentAnchor: this.normalizeNonEmpty(documentRow?.anchor),
      entries,
      counts: {
        sections: entries.filter((entry) => entry.itemKind === 'section').length,
        pages: entries.filter((entry) => entry.itemKind === 'page').length,
      },
    }
  }

  private toPersistedDocumentSummarySnapshot(
    documentVersionId: string,
    localeKey: DocumentIndexLocaleKey,
    rows: readonly IbmDocumentIndexEntry[],
  ): DocmanDocumentSummarySnapshot {
    const sorted = [...rows].sort((left, right) => {
      const sortDelta = Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
      if (sortDelta !== 0) return sortDelta
      return String(left.id ?? '').localeCompare(String(right.id ?? ''))
    })
    const documentRow = sorted.find((row) => row.itemKind === 'document')
    const entries = sorted
      .filter((row) => Boolean(this.normalizeNonEmpty(row.summaryText)))
      .map((row) => this.toPersistedDocumentSummarySnapshotEntry(row))

    return {
      documentId: this.normalizeNonEmpty(documentRow?.documentId) ?? this.normalizeNonEmpty(sorted[0]?.documentId),
      documentVersionId,
      title: this.normalizeNonEmpty(documentRow?.title),
      locale: this.normalizeNonEmpty(documentRow?.locale) ?? localeKey.locale,
      fallbackLocale: this.normalizeNonEmpty(documentRow?.fallbackLocale) ?? localeKey.fallbackLocale,
      built: entries.length > 0,
      buildFingerprint:
        this.normalizeNonEmpty(documentRow?.buildFingerprint) ??
        this.normalizeNonEmpty(sorted[0]?.buildFingerprint),
      documentAnchor: this.normalizeNonEmpty(documentRow?.anchor),
      entries,
      counts: {
        documents: entries.filter((entry) => entry.itemKind === 'document').length,
        sections: entries.filter((entry) => entry.itemKind === 'section').length,
        pages: entries.filter((entry) => entry.itemKind === 'page').length,
      },
    }
  }

  private toPersistedDocumentIndexSnapshotEntry(row: IbmDocumentIndexEntry): DocmanDocumentIndexSnapshotEntry {
    return {
      itemKind: row.itemKind === 'section' ? 'section' : 'page',
      linkId: this.normalizeNonEmpty(row.linkId),
      parentLinkId: this.normalizeNonEmpty(row.parentLinkId),
      anchor: row.anchor,
      parentAnchor: this.normalizeNonEmpty(row.parentAnchor),
      number: this.normalizeNonEmpty(row.number),
      depth: Number(row.depth ?? 0),
      position: Number(row.position ?? 0),
      title: row.title,
      breadcrumb: row.breadcrumb,
      titleVisible: this.toDocumentIndexBoolean(row.titleVisible),
      pageBreakBefore: this.toDocumentIndexBoolean(row.pageBreakBefore),
      pageBreakAfter: this.toDocumentIndexBoolean(row.pageBreakAfter),
      sectionId: this.normalizeNonEmpty(row.sectionId),
      sectionUid: this.normalizeNonEmpty(row.sectionUid),
      sectionSlug: this.normalizeNonEmpty(row.sectionSlug),
      pageId: this.normalizeNonEmpty(row.pageId),
      pageUid: this.normalizeNonEmpty(row.pageUid),
      pageVersionId: this.normalizeNonEmpty(row.pageVersionId),
      format: row.format as DocmanComposeSourceFormat | undefined,
      pageNumberStart: Number.isInteger(Number(row.pageNumberStart)) ? Number(row.pageNumberStart) : undefined,
      pageNumberEnd: Number.isInteger(Number(row.pageNumberEnd)) ? Number(row.pageNumberEnd) : undefined,
    }
  }

  private toPersistedDocumentSummarySnapshotEntry(row: IbmDocumentIndexEntry): DocmanDocumentSummarySnapshotEntry {
    const itemKind =
      row.itemKind === 'document'
        ? 'document'
        : row.itemKind === 'section'
          ? 'section'
          : 'page'
    return {
      itemKind,
      linkId: this.normalizeNonEmpty(row.linkId),
      parentLinkId: this.normalizeNonEmpty(row.parentLinkId),
      anchor: row.anchor,
      parentAnchor: this.normalizeNonEmpty(row.parentAnchor),
      number: this.normalizeNonEmpty(row.number),
      depth: Number(row.depth ?? 0),
      position: Number(row.position ?? 0),
      title: row.title,
      breadcrumb: row.breadcrumb,
      titleVisible: this.toDocumentIndexBoolean(row.titleVisible),
      pageBreakBefore: this.toDocumentIndexBoolean(row.pageBreakBefore),
      pageBreakAfter: this.toDocumentIndexBoolean(row.pageBreakAfter),
      sectionId: this.normalizeNonEmpty(row.sectionId),
      sectionUid: this.normalizeNonEmpty(row.sectionUid),
      sectionSlug: this.normalizeNonEmpty(row.sectionSlug),
      pageId: this.normalizeNonEmpty(row.pageId),
      pageUid: this.normalizeNonEmpty(row.pageUid),
      pageVersionId: this.normalizeNonEmpty(row.pageVersionId),
      format: row.format as DocmanComposeSourceFormat | undefined,
      pageNumberStart: Number.isInteger(Number(row.pageNumberStart)) ? Number(row.pageNumberStart) : undefined,
      pageNumberEnd: Number.isInteger(Number(row.pageNumberEnd)) ? Number(row.pageNumberEnd) : undefined,
      summaryText: this.normalizeNonEmpty(row.summaryText) ?? row.title,
      sourceCharCount: this.toNonNegativeInteger(row.sourceCharCount),
      sourceWordCount: this.toNonNegativeInteger(row.sourceWordCount),
      summaryCharCount: this.toNonNegativeInteger(row.summaryCharCount),
      summaryWordCount: this.toNonNegativeInteger(row.summaryWordCount),
    }
  }

  private buildDocumentAnswerPack(
    documentVersionId: string,
    localeKey: DocumentIndexLocaleKey,
    q: string,
    limitRaw: number | undefined,
    retrievalStrategyRaw: DocmanDocumentRetrievalStrategy | undefined,
    rows: readonly IbmDocumentIndexEntry[],
  ): Effect.Effect<DocmanDocumentAnswerPackResult, DocumentServiceError> {
    const retrievalStrategy = this.resolveDocumentRetrievalStrategy(retrievalStrategyRaw)
    const normalizedQuery = this.normalizeDocumentIndexSearchText(q)
    const queryTokens = this.tokenizeDocumentIndexSearchTokens(normalizedQuery)
    const limit = this.resolveDocumentAnswerPackLimit(limitRaw)
    const sorted = [...rows].sort((left, right) => {
      const sortDelta = Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
      if (sortDelta !== 0) return sortDelta
      return String(left.id ?? '').localeCompare(String(right.id ?? ''))
    })
    const documentRow = sorted.find((row) => row.itemKind === 'document')

    if (sorted.length === 0 || !normalizedQuery || queryTokens.length === 0) {
      return Effect.succeed({
        documentVersionId,
        locale: this.normalizeNonEmpty(documentRow?.locale) ?? localeKey.locale,
        fallbackLocale: this.normalizeNonEmpty(documentRow?.fallbackLocale) ?? localeKey.fallbackLocale,
        q,
        built: sorted.length > 0,
        buildFingerprint:
          this.normalizeNonEmpty(documentRow?.buildFingerprint) ??
          this.normalizeNonEmpty(sorted[0]?.buildFingerprint),
        answer: '',
        answerSource: 'none',
        citations: [],
        provenance: {
          strategy: this.toDocumentAnswerPackProvenanceStrategy(retrievalStrategy),
          retrievalStrategy,
          citationCount: 0,
          primaryMatchedBy: [],
          vectorAvailable: false,
        },
      })
    }

    return Effect.gen(this, function* (_) {
      const vectorState = yield* _(
        this.resolveDocumentVectorState(sorted, normalizedQuery, retrievalStrategy, 'buildDocumentAnswerPack.vector'),
      )

      const citations = this.rankDocumentAnswerPackRows(sorted, normalizedQuery, queryTokens, vectorState)
        .map((match) => this.toDocumentAnswerPackCitation(match.row, match, queryTokens))
        .sort((left, right) => {
          const scoreDelta = right.score - left.score
          if (scoreDelta !== 0) return scoreDelta
          const kindPriority =
            this.resolveDocumentAnswerPackKindPriority(left.itemKind) -
            this.resolveDocumentAnswerPackKindPriority(right.itemKind)
          if (kindPriority !== 0) return kindPriority
          const pageDelta =
            (left.pageNumberStart ?? Number.MAX_SAFE_INTEGER) - (right.pageNumberStart ?? Number.MAX_SAFE_INTEGER)
          if (pageDelta !== 0) return pageDelta
          return left.breadcrumb.localeCompare(right.breadcrumb)
        })
        .slice(0, limit)

      const primary = citations[0]
      const answerSelection = this.selectDocumentAnswerPackAnswer(primary)

      return {
        documentVersionId,
        locale: this.normalizeNonEmpty(documentRow?.locale) ?? localeKey.locale,
        fallbackLocale: this.normalizeNonEmpty(documentRow?.fallbackLocale) ?? localeKey.fallbackLocale,
        q,
        built: sorted.length > 0,
        buildFingerprint:
          this.normalizeNonEmpty(documentRow?.buildFingerprint) ??
          this.normalizeNonEmpty(sorted[0]?.buildFingerprint),
        answer: answerSelection.answer,
        answerSource: answerSelection.answerSource,
        citations,
        provenance: {
          strategy: this.toDocumentAnswerPackProvenanceStrategy(retrievalStrategy),
          retrievalStrategy,
          citationCount: citations.length,
          selectedAnchor: primary?.anchor,
          selectedItemKind: primary?.itemKind,
          primaryMatchedBy: primary?.matchedBy ?? [],
          vectorAvailable: vectorState.vectorAvailable,
          vectorProvider: vectorState.vectorProvider,
          vectorModel: vectorState.vectorModel,
        },
      }
    })
  }

  private toDocumentAnswerPackCitation(
    row: IbmDocumentIndexEntry,
    match: PersistedDocumentAnswerPackMatch,
    queryTokens: readonly string[],
  ): DocmanDocumentAnswerPackCitation {
    const itemKind =
      row.itemKind === 'document'
        ? 'document'
        : row.itemKind === 'section'
          ? 'section'
          : 'page'
    const summaryText = this.normalizeNonEmpty(row.summaryText)
      ? this.normalizeDocumentSummarySourceText(row.summaryText)
      : undefined

    return {
      itemKind,
      anchor: row.anchor,
      parentAnchor: this.normalizeNonEmpty(row.parentAnchor),
      number: this.normalizeNonEmpty(row.number),
      depth: Number(row.depth ?? 0),
      title: row.title,
      breadcrumb: row.breadcrumb,
      sectionId: this.normalizeNonEmpty(row.sectionId),
      sectionUid: this.normalizeNonEmpty(row.sectionUid),
      sectionSlug: this.normalizeNonEmpty(row.sectionSlug),
      pageId: this.normalizeNonEmpty(row.pageId),
      pageUid: this.normalizeNonEmpty(row.pageUid),
      pageVersionId: this.normalizeNonEmpty(row.pageVersionId),
      format: row.format as DocmanComposeSourceFormat | undefined,
      pageNumberStart: Number.isInteger(Number(row.pageNumberStart)) ? Number(row.pageNumberStart) : undefined,
      pageNumberEnd: Number.isInteger(Number(row.pageNumberEnd)) ? Number(row.pageNumberEnd) : undefined,
      score: match.score,
      excerpt: this.buildDocumentAnswerPackExcerpt(row, queryTokens, summaryText),
      matchedBy: [...match.matchedBy],
      lexicalScore: match.lexicalScore,
      ...(match.semanticScore !== undefined ? { semanticScore: match.semanticScore } : {}),
      ...(summaryText ? { summaryText } : {}),
    }
  }

  private analyzeDocumentAnswerPackRow(
    row: IbmDocumentIndexEntry,
    normalizedQuery: string,
    queryTokens: readonly string[],
  ): PersistedDocumentAnswerPackMatch {
    const title = this.normalizeDocumentIndexSearchText(row.title)
    const breadcrumb = this.normalizeDocumentIndexSearchText(row.breadcrumb)
    const bodyText = this.normalizeDocumentIndexSearchText(row.bodyText ?? '')
    const numberText = this.normalizeDocumentIndexSearchText(row.number ?? '')
    const summaryText = this.normalizeDocumentIndexSearchText(row.summaryText ?? '')
    const haystack = this.normalizeDocumentIndexSearchText(
      [this.normalizeNonEmpty(row.searchText), summaryText].filter(Boolean).join('\n'),
    )

    if (!haystack) {
      return { score: 0, lexicalScore: 0, matchedBy: [] }
    }

    let lexicalScore = 0
    const matchedBy: DocmanDocumentAnswerPackMatchField[] = []
    const pushMatch = (field: DocmanDocumentAnswerPackMatchField) => {
      if (!matchedBy.includes(field)) matchedBy.push(field)
    }

    if (title.includes(normalizedQuery)) {
      lexicalScore += 48
      pushMatch('title')
    }
    if (breadcrumb.includes(normalizedQuery)) {
      lexicalScore += 20
      pushMatch('breadcrumb')
    }
    if (numberText && numberText.includes(normalizedQuery)) {
      lexicalScore += 18
      pushMatch('number')
    }
    if (summaryText && summaryText.includes(normalizedQuery)) {
      lexicalScore += row.itemKind === 'document' ? 40 : 26
      pushMatch('summaryText')
    }
    if (bodyText && bodyText.includes(normalizedQuery)) {
      lexicalScore += 10
      pushMatch('bodyText')
    }

    const allTokensPresent = queryTokens.every((token) => haystack.includes(token))
    if (!allTokensPresent && lexicalScore === 0) {
      return { score: 0, lexicalScore: 0, matchedBy: [] }
    }
    if (allTokensPresent) lexicalScore += 12

    for (const token of queryTokens) {
      if (title.includes(token)) {
        lexicalScore += 12
        pushMatch('title')
      }
      if (breadcrumb.includes(token)) {
        lexicalScore += 6
        pushMatch('breadcrumb')
      }
      if (numberText && numberText.includes(token)) {
        lexicalScore += 5
        pushMatch('number')
      }
      if (summaryText && summaryText.includes(token)) {
        lexicalScore += 8
        pushMatch('summaryText')
      }
      if (bodyText && bodyText.includes(token)) {
        lexicalScore += 2
        pushMatch('bodyText')
      }
    }

    return { score: lexicalScore, lexicalScore, matchedBy }
  }

  private buildDocumentAnswerPackExcerpt(
    row: IbmDocumentIndexEntry,
    queryTokens: readonly string[],
    summaryText: string | undefined,
  ): string {
    const bodyText = this.normalizeNonEmpty(row.bodyText)
    if (bodyText) {
      const excerpt = this.extractExcerpt(bodyText, queryTokens)
      if (excerpt) return excerpt
    }

    if (summaryText) {
      const excerpt = this.extractExcerpt(summaryText, queryTokens)
      if (excerpt) return excerpt
    }

    const breadcrumbExcerpt = this.extractExcerpt(row.breadcrumb, queryTokens)
    if (breadcrumbExcerpt) return breadcrumbExcerpt

    return row.title
  }

  private resolveDocumentAnswerPackKindPriority(
    itemKind: DocmanDocumentAnswerPackCitation['itemKind'],
  ): number {
    if (itemKind === 'page') return 0
    if (itemKind === 'section') return 1
    return 2
  }

  private selectDocumentAnswerPackAnswer(
    citation: DocmanDocumentAnswerPackCitation | undefined,
  ): PersistedDocumentAnswerPackAnswer {
    if (!citation) {
      return { answer: '', answerSource: 'none' }
    }

    const summaryText = this.normalizeNonEmpty(citation.summaryText)
    const excerpt = this.normalizeNonEmpty(citation.excerpt)
    if (citation.itemKind === 'page' && excerpt && excerpt !== citation.title) {
      return { answer: excerpt, answerSource: 'excerpt' }
    }
    if (summaryText) {
      return { answer: summaryText, answerSource: 'summary' }
    }
    if (excerpt) {
      return { answer: excerpt, answerSource: 'excerpt' }
    }

    const title = this.normalizeNonEmpty(citation.title)
    if (title) {
      return { answer: title, answerSource: 'title' }
    }

    return { answer: '', answerSource: 'none' }
  }

  private searchPersistedDocumentIndexRows(
    documentVersionId: string,
    localeKey: DocumentIndexLocaleKey,
    q: string,
    limitRaw: number | undefined,
    retrievalStrategyRaw: DocmanDocumentRetrievalStrategy | undefined,
    rows: readonly IbmDocumentIndexEntry[],
  ): Effect.Effect<DocmanDocumentSearchResult, DocumentServiceError> {
    const retrievalStrategy = this.resolveDocumentRetrievalStrategy(retrievalStrategyRaw)
    const normalizedQuery = this.normalizeDocumentIndexSearchText(q)
    const queryTokens = this.tokenizeDocumentIndexSearchTokens(normalizedQuery)
    const limit = this.resolveDocumentIndexSearchLimit(limitRaw)
    const sorted = [...rows].sort((left, right) => {
      const sortDelta = Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
      if (sortDelta !== 0) return sortDelta
      return String(left.id ?? '').localeCompare(String(right.id ?? ''))
    })
    const documentRow = sorted.find((row) => row.itemKind === 'document')
    if (sorted.length === 0 || !normalizedQuery || queryTokens.length === 0) {
      return Effect.succeed({
        documentVersionId,
        locale: localeKey.locale,
        fallbackLocale: localeKey.fallbackLocale,
        q,
        built: sorted.length > 0,
        buildFingerprint:
          this.normalizeNonEmpty(documentRow?.buildFingerprint) ??
          this.normalizeNonEmpty(sorted[0]?.buildFingerprint),
        hits: [],
        provenance: {
          strategy: 'lexical-search-v1',
          retrievalStrategy,
          vectorAvailable: false,
        },
      })
    }

    return Effect.gen(this, function* (_) {
      const vectorState = yield* _(
        this.resolveDocumentVectorState(sorted, normalizedQuery, retrievalStrategy, 'searchPersistedDocumentIndexRows.vector'),
      )

      const hits = this.rankPersistedDocumentSearchRows(sorted, normalizedQuery, queryTokens, vectorState)
        .map((match) => this.toPersistedDocumentSearchHit(match.row, match, queryTokens))
        .sort((left, right) => {
          const scoreDelta = right.score - left.score
          if (scoreDelta !== 0) return scoreDelta
          const pageDelta =
            (left.pageNumberStart ?? Number.MAX_SAFE_INTEGER) - (right.pageNumberStart ?? Number.MAX_SAFE_INTEGER)
          if (pageDelta !== 0) return pageDelta
          return left.breadcrumb.localeCompare(right.breadcrumb)
        })
        .slice(0, limit)

      return {
        documentVersionId,
        locale: this.normalizeNonEmpty(documentRow?.locale) ?? localeKey.locale,
        fallbackLocale: this.normalizeNonEmpty(documentRow?.fallbackLocale) ?? localeKey.fallbackLocale,
        q,
        built: sorted.length > 0,
        buildFingerprint:
          this.normalizeNonEmpty(documentRow?.buildFingerprint) ??
          this.normalizeNonEmpty(sorted[0]?.buildFingerprint),
        hits,
        provenance: this.toDocumentSearchProvenance(retrievalStrategy, vectorState),
      }
    })
  }

  private toPersistedDocumentSearchHit(
    row: IbmDocumentIndexEntry,
    match: PersistedDocumentSearchMatch,
    queryTokens: readonly string[],
  ): DocmanDocumentSearchHit {
    return {
      itemKind: row.itemKind === 'section' ? 'section' : 'page',
      anchor: row.anchor,
      parentAnchor: this.normalizeNonEmpty(row.parentAnchor),
      number: this.normalizeNonEmpty(row.number),
      depth: Number(row.depth ?? 0),
      title: row.title,
      breadcrumb: row.breadcrumb,
      sectionId: this.normalizeNonEmpty(row.sectionId),
      sectionUid: this.normalizeNonEmpty(row.sectionUid),
      sectionSlug: this.normalizeNonEmpty(row.sectionSlug),
      pageId: this.normalizeNonEmpty(row.pageId),
      pageUid: this.normalizeNonEmpty(row.pageUid),
      pageVersionId: this.normalizeNonEmpty(row.pageVersionId),
      format: row.format as DocmanComposeSourceFormat | undefined,
      pageNumberStart: Number.isInteger(Number(row.pageNumberStart)) ? Number(row.pageNumberStart) : undefined,
      pageNumberEnd: Number.isInteger(Number(row.pageNumberEnd)) ? Number(row.pageNumberEnd) : undefined,
      score: match.score,
      excerpt: this.buildPersistedDocumentIndexExcerpt(row, queryTokens),
      matchedBy: [...match.matchedBy],
      lexicalScore: match.lexicalScore,
      ...(match.semanticScore !== undefined ? { semanticScore: match.semanticScore } : {}),
    }
  }

  private toDocumentIndexBoolean(value: unknown): boolean {
    return value === true || value === 1 || value === '1'
  }

  private toNonNegativeInteger(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0) return 0
    return parsed
  }

  private scorePersistedDocumentIndexRow(
    row: IbmDocumentIndexEntry,
    normalizedQuery: string,
    queryTokens: readonly string[],
  ): PersistedDocumentSearchMatch {
    const haystack = this.normalizeNonEmpty(row.searchText)
    if (!haystack) {
      return { row, score: 0, lexicalScore: 0, matchedBy: [] }
    }

    let lexicalScore = 0
    const title = this.normalizeDocumentIndexSearchText(row.title)
    const breadcrumb = this.normalizeDocumentIndexSearchText(row.breadcrumb)
    const bodyText = this.normalizeDocumentIndexSearchText(row.bodyText ?? '')
    const numberText = this.normalizeDocumentIndexSearchText(row.number ?? '')
    const matchedBy: DocmanDocumentAnswerPackMatchField[] = []
    const pushMatch = (field: DocmanDocumentAnswerPackMatchField) => {
      if (!matchedBy.includes(field)) matchedBy.push(field)
    }

    if (haystack.includes(normalizedQuery)) lexicalScore += 24
    if (title.includes(normalizedQuery)) {
      lexicalScore += 48
      pushMatch('title')
    }
    if (breadcrumb.includes(normalizedQuery)) {
      lexicalScore += 20
      pushMatch('breadcrumb')
    }
    if (numberText && numberText.includes(normalizedQuery)) {
      lexicalScore += 18
      pushMatch('number')
    }
    if (bodyText && bodyText.includes(normalizedQuery)) {
      lexicalScore += 8
      pushMatch('bodyText')
    }

    const allTokensPresent = queryTokens.every((token) => haystack.includes(token))
    if (!allTokensPresent && lexicalScore === 0) {
      return { row, score: 0, lexicalScore: 0, matchedBy: [] }
    }
    if (allTokensPresent) lexicalScore += 12

    for (const token of queryTokens) {
      if (title.includes(token)) {
        lexicalScore += 12
        pushMatch('title')
      }
      if (breadcrumb.includes(token)) {
        lexicalScore += 6
        pushMatch('breadcrumb')
      }
      if (numberText && numberText.includes(token)) {
        lexicalScore += 5
        pushMatch('number')
      }
      if (bodyText && bodyText.includes(token)) {
        lexicalScore += 2
        pushMatch('bodyText')
      }
    }

    return { row, score: lexicalScore, lexicalScore, matchedBy }
  }

  private resolveDocumentRetrievalStrategy(
    value: DocmanDocumentRetrievalStrategy | undefined,
  ): DocmanDocumentRetrievalStrategy {
    return value === 'hybrid' || value === 'semantic' ? value : 'lexical'
  }

  private toDocumentAnswerPackProvenanceStrategy(
    retrievalStrategy: DocmanDocumentRetrievalStrategy,
  ): DocmanDocumentAnswerPackProvenance['strategy'] {
    return retrievalStrategy === 'semantic'
      ? 'semantic-answer-pack-v1'
      : retrievalStrategy === 'hybrid'
        ? 'hybrid-answer-pack-v1'
        : 'deterministic-answer-pack-v1'
  }

  private toDocumentSearchProvenance(
    retrievalStrategy: DocmanDocumentRetrievalStrategy,
    vectorState: ResolvedDocumentVectorState,
  ): DocmanDocumentSearchProvenance {
    return {
      strategy: this.toDocumentSearchStrategy(retrievalStrategy),
      retrievalStrategy,
      vectorAvailable: vectorState.vectorAvailable,
      vectorProvider: vectorState.vectorProvider,
      vectorModel: vectorState.vectorModel,
    }
  }

  private toDocumentSearchStrategy(
    retrievalStrategy: DocmanDocumentRetrievalStrategy,
  ): DocmanDocumentSearchProvenance['strategy'] {
    return retrievalStrategy === 'semantic'
      ? 'semantic-search-v1'
      : retrievalStrategy === 'hybrid'
        ? 'hybrid-search-v1'
        : 'lexical-search-v1'
  }

  private resolveScopeSearchDocumentSeed(document: IbmDocumentWithVersions): ScopeSearchDocumentSeed | null {
    const versions = Array.isArray(document.documentVersions) ? [...document.documentVersions] : []
    // Prefer the row marked isCurrent=true (set via docman.document-version.set-current).
    // Fall back to highest numeric version when no current row exists — keeps backward
    // compatibility for documents that pre-date the set-current invariant.
    const currentVersion = versions.find(
      (version) => version.isCurrent === true && this.normalizeNonEmpty(version.id),
    )
    const sortedVersions = versions
      .slice()
      .sort((left, right) => Number(right.version ?? 0) - Number(left.version ?? 0))
    const latestVersion = currentVersion ?? sortedVersions.find((version) => this.normalizeNonEmpty(version.id))
    const documentId = this.normalizeNonEmpty(document.id)
    const documentTitle = this.normalizeNonEmpty(document.title)
    const documentVersionId = this.normalizeNonEmpty(latestVersion?.id)
    if (!documentId || !documentTitle || !documentVersionId) return null
    return {
      documentId,
      documentTitle,
      documentSlug: this.normalizeNonEmpty(document.slug),
      documentVersionId,
      documentVersionTitle: this.normalizeNonEmpty(latestVersion?.title) ?? `v${Number(latestVersion?.version ?? 0) || '?'}`,
      documentVersionNumber: Number.isFinite(Number(latestVersion?.version))
        ? Number(latestVersion?.version)
        : undefined,
    }
  }

  private toScopeDocumentSearchHit(
    seed: ScopeSearchDocumentSeed,
    hit: DocmanDocumentSearchHit,
  ): DocmanScopeDocumentSearchHit {
    return {
      ...hit,
      documentId: seed.documentId,
      documentTitle: seed.documentTitle,
      documentSlug: seed.documentSlug,
      documentVersionId: seed.documentVersionId,
      documentVersionTitle: seed.documentVersionTitle,
      documentVersionNumber: seed.documentVersionNumber,
    }
  }

  private describeScopeSearchError(error: unknown): string {
    const info = effectErrorInfo(error)
    if (error instanceof Error && this.normalizeNonEmpty(error.message)) {
      return error.message
    }
    if (typeof info.unwrapped === 'string' && this.normalizeNonEmpty(info.unwrapped)) {
      return info.unwrapped
    }
    if (info.unwrapped instanceof Error && this.normalizeNonEmpty(info.unwrapped.message)) {
      return info.unwrapped.message
    }
    try {
      return JSON.stringify(info.unwrapped) ?? 'Unknown scope search error.'
    } catch {
      return 'Unknown scope search error.'
    }
  }

  private rankPersistedDocumentSearchRows(
    rows: readonly IbmDocumentIndexEntry[],
    normalizedQuery: string,
    queryTokens: readonly string[],
    vectorState: ResolvedDocumentVectorState,
  ): PersistedDocumentSearchMatch[] {
    return rows
      .filter((row) => row.itemKind === 'section' || row.itemKind === 'page')
      .map((row) => {
        const lexical = this.scorePersistedDocumentIndexRow(row, normalizedQuery, queryTokens)
        return this.applySemanticScoreToMatch(lexical, row, vectorState)
      })
      .filter((match) => match.score > 0)
  }

  private rankDocumentAnswerPackRows(
    rows: readonly IbmDocumentIndexEntry[],
    normalizedQuery: string,
    queryTokens: readonly string[],
    vectorState: ResolvedDocumentVectorState,
  ): PersistedDocumentSearchMatch[] {
    return rows
      .map((row) => {
        const lexical = this.analyzeDocumentAnswerPackRow(row, normalizedQuery, queryTokens)
        return this.applySemanticScoreToMatch(
          { row, ...lexical },
          row,
          vectorState,
        )
      })
      .filter((match) => match.score > 0)
  }

  private applySemanticScoreToMatch(
    baseMatch: PersistedDocumentSearchMatch,
    row: IbmDocumentIndexEntry,
    vectorState: ResolvedDocumentVectorState,
  ): PersistedDocumentSearchMatch {
    const semanticScore = this.resolvePersistedDocumentSemanticScore(row, vectorState)
    const matchedBy = [...baseMatch.matchedBy]
    if (semanticScore > 0.12 && !matchedBy.includes('semanticVector')) {
      matchedBy.push('semanticVector')
    }

    const score =
      vectorState.retrievalStrategy === 'semantic'
        ? semanticScore > 0.12
          ? semanticScore * 100 + baseMatch.lexicalScore * 0.2
          : 0
        : vectorState.retrievalStrategy === 'hybrid'
          ? baseMatch.lexicalScore + semanticScore * 48
          : baseMatch.lexicalScore

    return {
      ...baseMatch,
      matchedBy,
      semanticScore: semanticScore > 0 ? Number(semanticScore.toFixed(6)) : undefined,
      score: Number(score.toFixed(6)),
    }
  }

  private resolvePersistedDocumentSemanticScore(
    row: IbmDocumentIndexEntry,
    vectorState: ResolvedDocumentVectorState,
  ): number {
    if (!vectorState.vectorAvailable || !vectorState.queryVector?.length) return 0
    if (this.normalizeNonEmpty(row.embeddingProvider) !== this.normalizeNonEmpty(vectorState.vectorProvider)) return 0
    if (this.normalizeNonEmpty(row.embeddingModel) !== this.normalizeNonEmpty(vectorState.vectorModel)) return 0
    const storedVector = parseDocmanEmbeddingVector(row.embeddingVector)
    if (!storedVector?.length) return 0
    return Math.max(0, cosineSimilarity(vectorState.queryVector, storedVector))
  }

  private resolveDocumentVectorState(
    rows: readonly IbmDocumentIndexEntry[],
    normalizedQuery: string,
    retrievalStrategy: DocmanDocumentRetrievalStrategy,
    stage: string,
  ): Effect.Effect<ResolvedDocumentVectorState, DocumentServiceError> {
    if (retrievalStrategy === 'lexical') {
      return Effect.succeed({
        retrievalStrategy,
        vectorAvailable: false,
      })
    }

    const embeddedRow = rows.find(
      (row) =>
        Boolean(parseDocmanEmbeddingVector(row.embeddingVector)?.length) &&
        Boolean(this.normalizeNonEmpty(row.embeddingProvider)) &&
        Boolean(this.normalizeNonEmpty(row.embeddingModel)),
    )
    if (!embeddedRow) {
      return Effect.succeed({
        retrievalStrategy,
        vectorAvailable: false,
      })
    }

    const embeddedProvider = this.normalizeNonEmpty(embeddedRow.embeddingProvider)
    const embeddedModel = this.normalizeNonEmpty(embeddedRow.embeddingModel)
    const provider =
      embeddedProvider === this.embeddingProvider.provider && embeddedModel === this.embeddingProvider.model
        ? this.embeddingProvider
        : (() => {
            const localProvider = createDocmanLocalHashEmbeddingProvider()
            return embeddedProvider === localProvider.provider && embeddedModel === localProvider.model
              ? localProvider
              : undefined
          })()

    if (!provider) {
      return Effect.succeed({
        retrievalStrategy,
        vectorAvailable: false,
      })
    }

    return Effect.tryPromise({
      try: async () => {
        const result = await provider.embedMany({ texts: [normalizedQuery] })
        const queryVector = result.vectors[0]
        return {
          retrievalStrategy,
          vectorAvailable: Array.isArray(queryVector) && queryVector.length > 0,
          vectorProvider: result.provider,
          vectorModel: result.model,
          queryVector,
        } satisfies ResolvedDocumentVectorState
      },
      catch: (error) =>
        XfErrorFactory.upsertFailed({
          stage,
          operation: 'embeddingProvider.embedMany',
          message: 'Failed to build document retrieval query vector.',
          cause: error,
        }),
    })
  }

  private buildPersistedDocumentIndexExcerpt(
    row: IbmDocumentIndexEntry,
    queryTokens: readonly string[],
  ): string {
    const bodyText = this.normalizeNonEmpty(row.bodyText)
    if (bodyText) {
      const excerpt = this.extractExcerpt(bodyText, queryTokens)
      if (excerpt) return excerpt
    }

    const breadcrumbExcerpt = this.extractExcerpt(row.breadcrumb, queryTokens)
    if (breadcrumbExcerpt) return breadcrumbExcerpt

    return row.title
  }

  private extractExcerpt(source: string, queryTokens: readonly string[]): string {
    const normalizedSource = String(source ?? '').replace(/\s+/g, ' ').trim()
    if (!normalizedSource) return ''
    const loweredSource = normalizedSource.toLowerCase()

    let matchIndex = -1
    let matchedToken = ''
    for (const token of queryTokens) {
      const candidate = loweredSource.indexOf(token.toLowerCase())
      if (candidate === -1) continue
      if (matchIndex === -1 || candidate < matchIndex) {
        matchIndex = candidate
        matchedToken = token
      }
    }

    if (matchIndex === -1) {
      return normalizedSource.slice(0, 160)
    }

    const start = Math.max(0, matchIndex - 48)
    const end = Math.min(normalizedSource.length, matchIndex + Math.max(matchedToken.length, 24) + 80)
    const prefix = start > 0 ? '...' : ''
    const suffix = end < normalizedSource.length ? '...' : ''
    return `${prefix}${normalizedSource.slice(start, end).trim()}${suffix}`
  }

  private resolveDocumentIndexSearchLimit(value: number | undefined): number {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return 8
    return Math.max(1, Math.min(20, parsed))
  }

  private resolveDocumentAnswerPackLimit(value: number | undefined): number {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return 3
    return Math.max(1, Math.min(8, parsed))
  }

  private tokenizeDocumentIndexSearchTokens(value: string): string[] {
    return [...new Set(value.split(/\s+/).map((token) => token.trim()).filter(Boolean))]
  }

  private normalizeDocumentIndexSearchText(value: string): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/[`*_~>#=+|]/g, ' ')
      .replace(/\[[^\]]*]\(([^)]+)\)/g, ' ')
      .replace(/[^\p{L}\p{N}.\- ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private buildPersistedDocumentIndexEmbeddingText(row: Partial<IbmDocumentIndexEntry>): string {
    return this.normalizeDocumentIndexSearchText(
      [
        this.normalizeNonEmpty(row.number),
        this.normalizeNonEmpty(row.title),
        this.normalizeNonEmpty(row.breadcrumb),
        this.normalizeNonEmpty(row.summaryText),
        this.normalizeNonEmpty(row.bodyText),
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  private populatePersistedDocumentIndexEmbeddings<T extends Partial<IbmDocumentIndexEntry>>(
    rows: readonly T[],
    stage: string,
    operation: string,
  ): Effect.Effect<T[], DocumentServiceError> {
    if (rows.length === 0) return Effect.succeed([])

    const embeddingTexts = rows.map((row) => this.buildPersistedDocumentIndexEmbeddingText(row))
    return Effect.tryPromise({
      try: async () => {
        let result: Awaited<ReturnType<DocmanEmbeddingProvider['embedMany']>>
        try {
          result = await this.embeddingProvider.embedMany({ texts: embeddingTexts })
        } catch (error) {
          if (this.embeddingProvider.provider === createDocmanLocalHashEmbeddingProvider().provider) {
            throw error
          }
          this.logger?.warn(
            {
              stage,
              operation,
              provider: this.embeddingProvider.provider,
              model: this.embeddingProvider.model,
            },
            'Embedding provider failed; falling back to local hash embeddings.',
          )
          result = await createDocmanLocalHashEmbeddingProvider().embedMany({ texts: embeddingTexts })
        }
        return rows.map((row, index) => {
          const embeddingText = embeddingTexts[index]
          const vector = result.vectors[index]
          if (!embeddingText || !Array.isArray(vector) || vector.length === 0) {
            return {
              ...row,
              embeddingProvider: undefined,
              embeddingModel: undefined,
              embeddingHash: undefined,
              embeddingDimensions: undefined,
              embeddingVector: undefined,
            }
          }
          return {
            ...row,
            embeddingProvider: result.provider,
            embeddingModel: result.model,
            embeddingHash: buildDocmanEmbeddingHash(embeddingText),
            embeddingDimensions: result.dimensions || vector.length,
            embeddingVector: serializeDocmanEmbeddingVector(vector),
          }
        })
      },
      catch: (error) =>
        XfErrorFactory.upsertFailed({
          stage,
          operation,
          message: 'Failed to populate document retrieval embeddings.',
          cause: error,
        }),
    })
  }

  private refreshPersistedDocumentIndexEmbeddings(
    repository: IRepositoryPortDocumentIndexEntry,
    rows: readonly IbmDocumentIndexEntry[],
    stage: string,
    operation: string,
  ): Effect.Effect<readonly IbmDocumentIndexEntry[], DocumentServiceError> {
    if (rows.length === 0) return Effect.succeed(rows)

    return Effect.gen(this, function* (_) {
      const embeddedRows = yield* _(this.populatePersistedDocumentIndexEmbeddings(rows, stage, operation))
      const patches: Array<{ id: string; patch: Partial<IbmDocumentIndexEntry> }> = []
      for (const row of embeddedRows) {
        const id = this.normalizeNonEmpty(row.id)
        if (!id) continue
        patches.push({
          id,
          patch: {
            embeddingProvider: row.embeddingProvider,
            embeddingModel: row.embeddingModel,
            embeddingHash: row.embeddingHash,
            embeddingDimensions: row.embeddingDimensions,
            embeddingVector: row.embeddingVector,
          },
        })
      }

      yield* _(
        Effect.all(
          patches.map(({ id, patch }) =>
            repository.patchById(id, patch).pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'documentIndexEntryRepository.patchById',
                  factory: XfErrorFactory.upsertFailed,
                }),
              ),
            ),
          ),
          { concurrency: 6 },
        ),
      )

      return embeddedRows as readonly IbmDocumentIndexEntry[]
    })
  }

  private extractDocumentIndexBodyText(item: PageComposeItem): string {
    const source = item.contentParts.join('\n\n')
    if (!source.trim()) return ''

    return String(source)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, '').replace(/```/g, ' '))
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '$1')
      .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/^[ \t]*[-*+]\s+/gm, '')
      .replace(/^[ \t]*\d+\.\s+/gm, '')
      .replace(/^[ \t]*#{1,6}\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private resolvePersistedDocumentAuthoredSummaryText(
    rows: readonly IbmDocumentIndexEntry[],
    localeKey: DocumentIndexLocaleKey,
    stage: string,
    operation: string,
  ): Effect.Effect<string | undefined, DocumentServiceError> {
    const documentRow = rows.find((row) => row.itemKind === 'document')
    const documentId = this.normalizeNonEmpty(documentRow?.documentId)
    const documentVersionId = this.normalizeNonEmpty(documentRow?.documentVersionId)
    if (!documentId || !documentVersionId) return Effect.succeed(undefined)

    const localeState: LocaleState = {
      locale: localeKey.locale,
      fallbackLocale: localeKey.fallbackLocale,
    }
    const documentQueryOptions = this.withLocaleOptions<IbmDocument>(undefined, localeState, ['titleMl', 'summaryMl', 'descriptionMl'])

    return Effect.gen(this, function* (_) {
      const document = yield* _(
        this.documentRepository.findById(documentId, documentQueryOptions).pipe(
          Effect.mapError(
            mapDbError({
              stage,
              operation: `${operation}.documentRepository.findById`,
              factory: XfErrorFactory.notFound,
            })
          )
        )
      )
      const version = this.documentVersionRepository
        ? yield* _(
            this.documentVersionRepository.findById(documentVersionId).pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: `${operation}.documentVersionRepository.findById`,
                  factory: XfErrorFactory.notFound,
                })
              )
            )
          )
        : null

      const versionSummary = this.normalizeNonEmpty(version?.summary)
      if (versionSummary) return versionSummary

      const localizedDocumentSummary = document
        ? this.normalizeNonEmpty(
            this.resolveLocalizedValue(document.summaryMl as Record<string, string | undefined> | undefined, localeState),
          )
        : undefined
      if (localizedDocumentSummary) return localizedDocumentSummary

      return this.normalizeNonEmpty(document?.summary)
    })
  }

  private toPersistedDocumentSummaryPatches(
    rows: readonly IbmDocumentIndexEntry[],
    authoredDocumentSummary: string | undefined,
  ): Array<{ id: string; patch: Partial<IbmDocumentIndexEntry> }> {
    const metricsByAnchor = this.buildPersistedDocumentSummaryMetrics(rows, authoredDocumentSummary)
    const patches: Array<{ id: string; patch: Partial<IbmDocumentIndexEntry> }> = []

    for (const row of rows) {
      const id = this.normalizeNonEmpty(row.id)
      if (!id) continue
      const metrics = metricsByAnchor.get(row.anchor)
      if (!metrics) continue

      patches.push({
        id,
        patch: {
          summaryText: metrics.summaryText,
          sourceCharCount: metrics.sourceCharCount,
          sourceWordCount: metrics.sourceWordCount,
          summaryCharCount: metrics.summaryCharCount,
          summaryWordCount: metrics.summaryWordCount,
          updatedBy: DOCMAN_DOCUMENT_SUMMARY_BUILD_ACTOR,
        },
      })
    }

    return patches
  }

  private buildPersistedDocumentSummaryMetrics(
    rows: readonly IbmDocumentIndexEntry[],
    authoredDocumentSummary: string | undefined,
  ): Map<string, PersistedDocumentSummaryMetrics> {
    const sorted = [...rows].sort((left, right) => {
      const sortDelta = Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
      if (sortDelta !== 0) return sortDelta
      return String(left.id ?? '').localeCompare(String(right.id ?? ''))
    })
    const childrenByParentAnchor = new Map<string, IbmDocumentIndexEntry[]>()
    for (const row of sorted) {
      const parentAnchor = this.normalizeNonEmpty(row.parentAnchor)
      if (!parentAnchor) continue
      const siblings = childrenByParentAnchor.get(parentAnchor) ?? []
      siblings.push(row)
      childrenByParentAnchor.set(parentAnchor, siblings)
    }

    const metricsByAnchor = new Map<string, PersistedDocumentSummaryMetrics>()
    const visit = (row: IbmDocumentIndexEntry): PersistedDocumentSummaryMetrics => {
      const existing = metricsByAnchor.get(row.anchor)
      if (existing) return existing

      const childMetrics = (childrenByParentAnchor.get(row.anchor) ?? []).map((child) => visit(child))
      const ownBodyText = row.itemKind === 'page' ? this.normalizeDocumentSummarySourceText(row.bodyText) : ''
      const sourceText = this.normalizeDocumentSummarySourceText(
        [
          row.title,
          ownBodyText,
          childMetrics.map((entry) => entry.sourceText).filter(Boolean).join('\n\n'),
        ]
          .filter(Boolean)
          .join('\n\n'),
      ) || row.title
      const authoredSummary =
        row.itemKind === 'document' ? this.normalizeDocumentSummarySourceText(authoredDocumentSummary) : ''
      const summaryText = authoredSummary
        ? this.truncateDocumentSummaryText(authoredSummary, 220)
        : this.buildDeterministicDocumentSummaryText(sourceText, row.title)
      const metrics: PersistedDocumentSummaryMetrics = {
        sourceText,
        summaryText,
        sourceCharCount: sourceText.length,
        sourceWordCount: this.countDocumentSummaryWords(sourceText),
        summaryCharCount: summaryText.length,
        summaryWordCount: this.countDocumentSummaryWords(summaryText),
      }
      metricsByAnchor.set(row.anchor, metrics)
      return metrics
    }

    for (const row of sorted) {
      visit(row)
    }

    return metricsByAnchor
  }

  private normalizeDocumentSummarySourceText(value: unknown): string {
    return String(value ?? '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\|\s*[-:]{3,}\s*(?=\||$)/g, ' ')
      .replace(/\|/g, ' / ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private buildDeterministicDocumentSummaryText(sourceText: string, fallbackText: string): string {
    const fallback = this.normalizeDocumentSummarySourceText(fallbackText)
    const normalized = this.normalizeDocumentSummarySourceText(sourceText)
    if (!normalized) return fallback

    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean)

    if (sentences.length === 0) {
      return this.truncateDocumentSummaryText(normalized, 220)
    }

    const selected: string[] = []
    let length = 0
    for (const sentence of sentences) {
      const nextLength = length === 0 ? sentence.length : length + 1 + sentence.length
      if (selected.length > 0 && nextLength > 220) break
      selected.push(sentence)
      length = nextLength
      if (length >= 96) break
    }

    const summary = selected.join(' ').trim()
    if (summary) return this.truncateDocumentSummaryText(summary, 220)
    return this.truncateDocumentSummaryText(normalized, 220)
  }

  private truncateDocumentSummaryText(value: string, maxLength: number): string {
    const normalized = this.normalizeDocumentSummarySourceText(value)
    if (normalized.length <= maxLength) return normalized
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
  }

  private countDocumentSummaryWords(value: string): number {
    const normalized = this.normalizeDocumentSummarySourceText(value)
    if (!normalized) return 0
    return normalized.split(/\s+/).filter(Boolean).length
  }

  private buildPersistedDocumentPageRanges(
    pages: readonly ComposedPage[],
  ): Map<string, { start: number; end: number }> {
    const ranges = new Map<string, { start: number; end: number }>()
    for (const page of pages) {
      for (const chunk of page.chunks) {
        const existing = ranges.get(chunk.linkId)
        if (!existing) {
          ranges.set(chunk.linkId, { start: page.pageNumber, end: page.pageNumber })
          continue
        }
        existing.start = Math.min(existing.start, page.pageNumber)
        existing.end = Math.max(existing.end, page.pageNumber)
      }
    }
    return ranges
  }

  private buildDocumentIndexBreadcrumb(
    title: string,
    parentLinkId: string | undefined,
    breadcrumbByLinkId: Map<string, string>,
    documentTitle: string,
  ): string {
    const parentBreadcrumb = parentLinkId ? breadcrumbByLinkId.get(parentLinkId) : undefined
    if (parentBreadcrumb) return `${parentBreadcrumb} / ${title}`
    return `${documentTitle} / ${title}`
  }

  private renderDocumentSourceBundleFromResolved(resolved: ResolvedComposeDocument): {
    format: DocmanComposeSourceFormat
    formats: DocmanComposeSourceFormat[]
    content: string
    assets: DocmanResolvedAssetReference[]
  } {
    const lines: string[] = []
    this.prependModulePreambles(
      lines,
      this.uniqueModulePreambles(
        resolved.items
          .filter((item): item is PageComposeItem => item.kind === 'page')
          .map((item) => item.modulePreamble),
      ),
    )
    lines.push(`# ${resolved.title}`)

    const documentReleaseNotes = this.normalizeNonEmpty(resolved.documentReleaseNotes)
    if (documentReleaseNotes) {
      lines.push('')
      lines.push(`_Release Notes:_ ${documentReleaseNotes}`)
    }

    for (const item of resolved.items) {
      if (item.pageBreakBefore) {
        lines.push('', '<!-- pagebreak -->')
      }

      lines.push('')
      if (item.kind === 'section') {
        lines.push(...this.renderSectionHeading(item))
      } else {
        lines.push(...this.renderPageBody(item, 2 + item.depth))
      }

      if (item.pageBreakAfter) {
        lines.push('', '<!-- pagebreak -->')
      }
    }

    return {
      ...reduceDocmanComposeFormats(
        resolved.items
          .filter((item): item is PageComposeItem => item.kind === 'page')
          .map((item) => item.format),
      ),
      content: this.joinMarkdown(lines),
      assets: this.uniqueAssetRefs(
        resolved.items.flatMap((item) => (item.kind === 'page' ? item.assetRefs : [])),
      ),
    }
  }

  private renderSectionSourceBundleFromSection(
    documentTitle: string,
    resolved: ResolvedComposeDocument,
    sectionItem: SectionComposeItem,
  ): {
    format: DocmanComposeSourceFormat
    formats: DocmanComposeSourceFormat[]
    content: string
    assets: DocmanResolvedAssetReference[]
  } {
    const scopedItems = this.collectSubtreeItems(resolved.items, sectionItem.linkId)
    const lines: string[] = []
    this.prependModulePreambles(
      lines,
      this.uniqueModulePreambles(
        scopedItems
          .filter((item): item is PageComposeItem => item.kind === 'page')
          .map((item) => item.modulePreamble),
      ),
    )
    lines.push(`# ${documentTitle}`)

    for (const item of scopedItems) {
      lines.push('')
      if (item.pageBreakBefore) {
        lines.push('<!-- pagebreak -->', '')
      }
      if (item.kind === 'section') {
        lines.push(...this.renderSectionHeading(item))
      } else {
        lines.push(...this.renderPageBody(item, 2 + item.depth))
      }
      if (item.pageBreakAfter) {
        lines.push('', '<!-- pagebreak -->')
      }
    }

    return {
      ...reduceDocmanComposeFormats(
        scopedItems
          .filter((item): item is PageComposeItem => item.kind === 'page')
          .map((item) => item.format),
      ),
      content: this.joinMarkdown(lines),
      assets: this.uniqueAssetRefs(
        scopedItems.flatMap((item) => (item.kind === 'page' ? item.assetRefs : [])),
      ),
    }
  }

  private renderSinglePageItemSourceBundle(documentTitle: string, pageItem: PageComposeItem): {
    format: DocmanComposeSourceFormat
    formats: DocmanComposeSourceFormat[]
    content: string
    assets: DocmanResolvedAssetReference[]
  } {
    const lines: string[] = []
    this.prependModulePreambles(lines, this.uniqueModulePreambles([pageItem.modulePreamble]))
    lines.push(`# ${documentTitle}`, '')
    lines.push(...this.renderPageBody(pageItem, 2 + pageItem.depth))
    return {
      format: pageItem.format,
      formats: [pageItem.format],
      content: this.joinMarkdown(lines),
      assets: this.uniqueAssetRefs(pageItem.assetRefs),
    }
  }

  private renderPageSourceBundle(documentTitle: string, page: ComposedPage): {
    format: DocmanComposeSourceFormat
    formats: DocmanComposeSourceFormat[]
    content: string
    assets: DocmanResolvedAssetReference[]
  } {
    const lines: string[] = []
    this.prependModulePreambles(lines, page.modulePreambles)
    lines.push(`# ${documentTitle}`, '', `## Page ${page.pageNumber}`)
    if (page.chunks.length === 0) {
      lines.push('', '_No content for this composed page._')
      return {
        format: page.format,
        formats: [...page.formats],
        content: this.joinMarkdown(lines),
        assets: [],
      }
    }

    let currentLinkId: string | null = null

    for (const chunk of page.chunks) {
      if (currentLinkId !== chunk.linkId) {
        const headingPrefix = '#'.repeat(Math.max(2, Math.min(6, chunk.depth + 2)))
        lines.push('')
        if (chunk.titleVisible) {
          lines.push(`${headingPrefix} ${chunk.number} ${stripLeadingNumericPrefixForRender(chunk.title, chunk.number)}`)
        } else {
          lines.push(`<!-- ${chunk.number} (title hidden) -->`)
        }
        currentLinkId = chunk.linkId
      }

      const body = chunk.content.trim()
      if (body.length > 0) {
        lines.push('', body)
      }
    }

    return {
      format: page.format,
      formats: [...page.formats],
      content: this.joinMarkdown(lines),
      assets: this.uniqueAssetRefs(page.assets),
    }
  }

  private materializePublishContent(
    fragment: DocmanDocumentComposeFetchResult,
    targetDescriptor: DocmanPublishTargetDescriptor,
  ): {
    mediaType: string
    content: string
    warnings: DocmanPublishedFragmentWarning[]
  } {
    if (targetDescriptor.target === 'markdown') {
      return this.materializeMarkdownPublishContent(fragment, targetDescriptor)
    }

    return this.materializeHtmlPublishContent(fragment, targetDescriptor)
  }

  private materializeMarkdownPublishContent(
    fragment: DocmanDocumentComposeFetchResult,
    targetDescriptor: DocmanPublishTargetDescriptor,
  ): {
    mediaType: string
    content: string
    warnings: DocmanPublishedFragmentWarning[]
  } {
    return {
      mediaType: targetDescriptor.mediaType,
      content: fragment.content,
      warnings: [],
    }
  }

  private materializeHtmlPublishContent(
    fragment: DocmanDocumentComposeFetchResult,
    targetDescriptor: DocmanPublishTargetDescriptor,
  ): {
    mediaType: string
    content: string
    warnings: DocmanPublishedFragmentWarning[]
  } {
    const warnings: DocmanPublishedFragmentWarning[] = []
    const sourceParts = splitDocmanComposeSourceContent(fragment.format, fragment.content)

    if (this.normalizeNonEmpty(sourceParts.modulePreamble)) {
      this.pushPublishWarning(
        warnings,
        'mdx_module_preamble_omitted',
        'MDX import/export preamble is omitted from HTML materialization and is not executed.',
      )
    }

    const blocks = this.tokenizeHtmlMaterializationBlocks(sourceParts.body, warnings)
    const renderedBody = blocks
      .map((block) =>
        block.kind === 'markdown' ? this.renderMarkdownBlockToHtml(block.content) : block.content,
      )
      .filter((entry) => this.normalizeNonEmpty(entry))
      .join('\n')

    return {
      mediaType: targetDescriptor.mediaType,
      content: this.buildPublishedHtmlDocument(this.toPublishedHtmlTitle(fragment), renderedBody),
      warnings,
    }
  }

  private tokenizeHtmlMaterializationBlocks(
    source: string,
    warnings: DocmanPublishedFragmentWarning[],
  ): Array<{ kind: 'markdown' | 'raw'; content: string }> {
    const lines = String(source ?? '').split(/\r?\n/)
    const blocks: Array<{ kind: 'markdown' | 'raw'; content: string }> = []
    let markdownLines: string[] = []

    const flushMarkdown = () => {
      const content = markdownLines.join('\n').trim()
      markdownLines = []
      if (!content) return
      blocks.push({ kind: 'markdown', content })
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = String(lines[index] ?? '')
      const trimmed = line.trim()

      if (!trimmed) {
        markdownLines.push('')
        continue
      }

      if (PAGE_BREAK_LINE_RE.test(line)) {
        flushMarkdown()
        blocks.push({ kind: 'raw', content: DOCMAN_PAGEBREAK_HTML })
        this.pushPublishWarning(
          warnings,
          'pagebreak_rendered',
          'Compose pagebreak markers are rendered as horizontal separators in HTML output.',
        )
        continue
      }

      if (!this.isHtmlLikeStandaloneLine(trimmed)) {
        markdownLines.push(line)
        continue
      }

      flushMarkdown()

      const rawLines = [line]
      while (index + 1 < lines.length) {
        const nextLine = String(lines[index + 1] ?? '')
        const nextTrimmed = nextLine.trim()
        if (!nextTrimmed || !this.isHtmlLikeStandaloneLine(nextTrimmed) || PAGE_BREAK_LINE_RE.test(nextLine)) {
          break
        }
        rawLines.push(nextLine)
        index += 1
      }

      const rawBlock = rawLines.join('\n').trim()
      if (!rawBlock) continue
      blocks.push({ kind: 'raw', content: rawBlock })

      if (!HTML_COMMENT_LINE_RE.test(trimmed)) {
        this.pushPublishWarning(
          warnings,
          'raw_html_block_preserved',
          'Standalone HTML/JSX blocks are preserved literally in HTML materialization.',
        )
      }
    }

    flushMarkdown()
    return blocks
  }

  private renderMarkdownBlockToHtml(markdown: string): string {
    const content = String(markdown ?? '').trim()
    if (!content) return ''

    return renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: [remarkGfm],
        } as any,
        content,
      ),
    )
  }

  private buildPublishedHtmlDocument(title: string, bodyHtml: string): string {
    const body = this.normalizeNonEmpty(bodyHtml) ?? '<p><em>No content to materialize.</em></p>'
    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      `  <title>${this.escapeHtml(title)}</title>`,
      `  <style>${DOCMAN_PUBLISH_HTML_STYLES}</style>`,
      '</head>',
      '<body>',
      '  <main>',
      body
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n'),
      '  </main>',
      '</body>',
      '</html>',
    ].join('\n')
  }

  private toPublishedHtmlTitle(fragment: DocmanDocumentComposeFetchResult): string {
    const lines = String(fragment.content ?? '').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('# ')) {
        return trimmed.slice(2).trim() || 'Docman Document'
      }
    }

    if (fragment.kind === 'page' && fragment.pageNumber) {
      return `Document page ${fragment.pageNumber}`
    }
    if (fragment.kind === 'section' && fragment.sectionId) {
      return `Document section ${fragment.sectionId}`
    }
    if (fragment.kind === 'page' && fragment.pageVersionId) {
      return `Document page ${fragment.pageVersionId}`
    }
    return 'Docman Document'
  }

  private isHtmlLikeStandaloneLine(value: string): boolean {
    const normalized = String(value ?? '').trim()
    if (!normalized) return false
    return HTML_COMMENT_LINE_RE.test(normalized) || HTML_LIKE_BLOCK_LINE_RE.test(normalized)
  }

  private pushPublishWarning(
    warnings: DocmanPublishedFragmentWarning[],
    code: string,
    message: string,
  ): void {
    if (warnings.some((warning) => warning.code === code)) return
    warnings.push({ code, message })
  }

  private renderSectionHeading(item: SectionComposeItem): string[] {
    const headingLevel = Math.max(2, Math.min(6, 2 + item.depth))
    const headingPrefix = '#'.repeat(headingLevel)
    return [`${headingPrefix} ${item.number} ${stripLeadingNumericPrefixForRender(item.title, item.number)}`]
  }

  private renderPageBody(item: PageComposeItem, headingLevel: number): string[] {
    const lines: string[] = []
    const headingPrefix = '#'.repeat(Math.max(2, Math.min(6, headingLevel)))

    if (item.titleVisible) {
      lines.push(`${headingPrefix} ${item.number} ${stripLeadingNumericPrefixForRender(item.title, item.number)}`)
    } else {
      lines.push(`<!-- ${item.number} (title hidden) -->`)
    }

    const parts = item.contentParts.length > 0 ? item.contentParts : ['']
    for (let i = 0; i < parts.length; i++) {
      const body = (parts[i] ?? '').trim()
      if (body.length > 0) {
        lines.push('', body)
      }
      if (i < parts.length - 1) {
        lines.push('', '<!-- pagebreak -->')
      }
    }

    return lines
  }

  private splitContentByPageBreakMarkers(content: string): string[] {
    const text = String(content ?? '')
    if (!text) return ['']

    const lines = text.split(/\r?\n/)
    const parts: string[] = []
    let current: string[] = []

    for (const line of lines) {
      if (PAGE_BREAK_LINE_RE.test(line)) {
        parts.push(current.join('\n').trim())
        current = []
      } else {
        current.push(line)
      }
    }
    parts.push(current.join('\n').trim())

    return parts.length > 0 ? parts : ['']
  }

  private collectSubtreeItems(items: ComposeItem[], rootLinkId: string): ComposeItem[] {
    const byId = new Map<string, ComposeItem>()
    for (const item of items) {
      byId.set(item.linkId, item)
    }

    const isDescendant = (candidate: ComposeItem): boolean => {
      if (candidate.linkId === rootLinkId) return true
      let cursor = candidate.parentLinkId
      while (cursor) {
        if (cursor === rootLinkId) return true
        const parent = byId.get(cursor)
        if (!parent) return false
        cursor = parent.parentLinkId
      }
      return false
    }

    return items.filter((item) => isDescendant(item))
  }

  private resolveDocumentTitle(
    document: IbmDocument,
    documentVersion: IbmDocumentVersion,
    localeState: LocaleState,
  ): string {
    const versionTitle = this.normalizeNonEmpty(documentVersion.title)
    if (versionTitle) return versionTitle
    return this.resolveLocalizedValue(
      document.titleMl as Record<string, string | undefined> | undefined,
      localeState,
      document.title,
    )
  }

  private resolveSectionTitle(
    section: IbmSection,
    titleOverride: string | undefined,
    localeState: LocaleState,
  ): string {
    const override = this.normalizeNonEmpty(titleOverride)
    if (override) return override

    const title = this.resolveLocalizedValue(
      section.titleMl as Record<string, string | undefined> | undefined,
      localeState,
      section.title,
    )
    if (title) return title

    return 'Section'
  }

  private resolvePageTitle(
    page: IbmPage | null,
    pageVersion: IbmPageVersion,
    titleOverride: string | undefined,
    localeState: LocaleState,
  ): string {
    const override = this.normalizeNonEmpty(titleOverride)
    if (override) return override

    const versionTitle = this.normalizeNonEmpty(pageVersion.title)
    if (versionTitle) return versionTitle

    if (page) {
      const pageTitle = this.resolveLocalizedValue(
        page.titleMl as Record<string, string | undefined> | undefined,
        localeState,
        page.title,
      )
      if (pageTitle) return pageTitle
    }

    return `Page ${pageVersion.version}`
  }

  private resolvePageContent(pageVersion: IbmPageVersion, localeState: LocaleState): string {
    return this.resolveLocalizedValue(
      pageVersion.contentMl as Record<string, string | undefined> | undefined,
      localeState,
      pageVersion.content ?? '',
    )
  }

  private resolveComposePageSource(
    pageVersion: IbmPageVersion,
    localeState: LocaleState,
    stage: string,
    operation: string,
  ): Effect.Effect<
    {
      format: DocmanComposeSourceFormat
      modulePreamble?: string
      content: string
      assets: DocmanResolvedAssetReference[]
    },
    DocumentServiceError
  > {
    return Effect.gen(this, function* (_) {
      const format = resolveDocmanComposeSourceFormat(pageVersion.format)
      if (!format) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.upsertFailed({
              stage,
              operation,
              message: 'unsupported_compose_source_format',
              data: {
                pageVersionId: pageVersion.id,
                format: pageVersion.format,
                supportedFormats: ['md', 'mdx'],
              },
            })
          )
        )
      }

      const source = normalizeDocmanComposeSourceContent(
        format,
        this.resolvePageContent(pageVersion, localeState),
      )
      const assetTokens = listDocmanAssetReferenceTokens(source)
      if (assetTokens.length === 0) {
        const sourceParts = splitDocmanComposeSourceContent(format, source)
        return {
          format,
          modulePreamble: sourceParts.modulePreamble,
          content: sourceParts.body,
          assets: [],
        }
      }

      const assetRefs = yield* _(
        Effect.all(
          assetTokens.map((token) => this.resolveAssetReferenceToken(token, stage, `${operation}.asset`)),
        ),
      )

      const byToken = new Map(assetRefs.map((assetRef) => [assetRef.token, assetRef]))
      const resolvedSource = replaceDocmanAssetReferenceTokens(
        source,
        (token) => byToken.get(token.token)?.href ?? token.token,
      )
      const sourceParts = splitDocmanComposeSourceContent(format, resolvedSource)
      return {
        format,
        modulePreamble: sourceParts.modulePreamble,
        content: sourceParts.body,
        assets: this.uniqueAssetRefs(assetRefs),
      }
    })
  }

  private resolveVersionReleaseNotes(
    version: { releaseNotes?: string; releaseNotesMl?: Record<string, string | undefined> | null },
    localeState: LocaleState,
  ): string | undefined {
    const fallback = this.normalizeNonEmpty(version.releaseNotes)
    const localized = this.resolveLocalizedValue(
      (version.releaseNotesMl ?? undefined) as Record<string, string | undefined> | undefined,
      localeState,
      fallback ?? '',
    )
    return this.normalizeNonEmpty(localized) ?? fallback
  }

  private resolveAssetReferenceToken(
    token: ParsedDocmanAssetReferenceToken,
    stage: string,
    operation: string,
  ): Effect.Effect<DocmanResolvedAssetReference, DocumentServiceError> {
    return Effect.gen(this, function* (_) {
      const assetRepository = yield* _(
        this.requireDependency(this.assetRepository, 'assetRepository', stage, operation)
      )
      const assetVersionRepository = yield* _(
        this.requireDependency(this.assetVersionRepository, 'assetVersionRepository', stage, operation)
      )

      let asset = null as any
      const assetsByUid = yield* _(
        assetRepository
          .find({
            matchEq: { assetUid: token.ref },
            options: { limit: 1 },
          } as any)
          .pipe(
            Effect.mapError(
              mapDbError({ stage, operation: 'assetRepository.find(assetUid)', factory: XfErrorFactory.notFound }),
            ),
          )
      )
      asset = assetsByUid[0] ?? null

      if (!asset) {
        const assetsBySlug = yield* _(
          assetRepository
            .find({
              matchEq: { slug: token.ref },
              options: { limit: 1 },
            } as any)
            .pipe(
              Effect.mapError(
                mapDbError({ stage, operation: 'assetRepository.find(slug)', factory: XfErrorFactory.notFound }),
              ),
            )
        )
        asset = assetsBySlug[0] ?? null
      }

      if (!asset?.id) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.notFound({
              stage,
              operation,
              message: 'Asset reference could not be resolved.',
              identifier: { token: token.token, ref: token.ref },
            })
          )
        )
      }

      let assetVersion = null as any
      if (token.version !== null) {
        const versions = yield* _(
          assetVersionRepository
            .find({
              matchEq: { assetId: asset.id, version: token.version },
              options: { limit: 1 },
            } as any)
            .pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'assetVersionRepository.find(version)',
                  factory: XfErrorFactory.notFound,
                }),
              ),
            )
        )
        assetVersion = versions[0] ?? null
      } else if (this.normalizeNonEmpty(asset.currentVersionId)) {
        assetVersion = yield* _(
          assetVersionRepository.findById(String(asset.currentVersionId)).pipe(
            Effect.mapError(
              mapDbError({
                stage,
                operation: 'assetVersionRepository.findById(currentVersionId)',
                factory: XfErrorFactory.notFound,
              }),
            ),
          )
        )
      }

      if (!assetVersion) {
        const versions = yield* _(
          assetVersionRepository
            .find({
              matchEq: { assetId: asset.id },
              options: { sort: [{ field: 'version', type: 'desc' }], limit: 50 },
            } as any)
            .pipe(
              Effect.mapError(
                mapDbError({
                  stage,
                  operation: 'assetVersionRepository.find(latest)',
                  factory: XfErrorFactory.notFound,
                }),
              ),
            )
        )
        assetVersion =
          versions.find((entry) => this.normalizeNonEmpty(entry.status) === 'ready') ??
          versions[0] ??
          null
      }

      if (!assetVersion?.id) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.notFound({
              stage,
              operation,
              message: 'Asset version could not be resolved.',
              identifier: { token: token.token, assetId: asset.id, version: token.version ?? asset.currentVersionId },
            })
          )
        )
      }

      const href = this.resolveAssetHref(assetVersion)
      if (!href) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.upsertFailed({
              stage,
              operation,
              message: 'asset_reference_missing_source_url',
              data: { token: token.token, assetId: asset.id, assetVersionId: assetVersion.id },
            })
          )
        )
      }

      return {
        token: token.token,
        ref: token.ref,
        assetId: asset.id,
        assetVersionId: assetVersion.id,
        assetVersion: Number(assetVersion.version) || 0,
        assetUid: this.normalizeNonEmpty(asset.assetUid),
        slug: this.normalizeNonEmpty(asset.slug),
        title: this.normalizeNonEmpty(asset.title),
        altText: this.normalizeNonEmpty(asset.altText),
        kind: String(asset.kind ?? ''),
        mime: String(assetVersion.mime ?? ''),
        href,
        width: Number.isFinite(Number(assetVersion.width)) ? Number(assetVersion.width) : undefined,
        height: Number.isFinite(Number(assetVersion.height)) ? Number(assetVersion.height) : undefined,
      }
    })
  }

  private resolveAssetHref(assetVersion: {
    sourceUrl?: string | null
  }): string | undefined {
    return this.normalizeNonEmpty(assetVersion.sourceUrl)
  }

  private uniqueAssetRefs(assetRefs: DocmanResolvedAssetReference[]): DocmanResolvedAssetReference[] {
    const unique = new Map<string, DocmanResolvedAssetReference>()
    for (const assetRef of assetRefs) {
      const key = `${assetRef.assetVersionId}:${assetRef.token}`
      if (!unique.has(key)) unique.set(key, assetRef)
    }
    return [...unique.values()]
  }

  private uniqueModulePreambles(values: Iterable<string | undefined>): string[] {
    const unique = new Map<string, string>()
    for (const value of values) {
      const normalized = this.normalizeNonEmpty(value)
      if (!normalized || unique.has(normalized)) continue
      unique.set(normalized, normalized)
    }
    return [...unique.values()]
  }

  private prependModulePreambles(lines: string[], modulePreambles: string[]): void {
    if (modulePreambles.length === 0) return
    lines.push(modulePreambles.join('\n\n'), '')
  }

  private stripDocumentListOptions(options: DocumentListOptions): DbQueryOptions<IbmDocument> | undefined {
    const {
      includeVersionInfo: _includeVersionInfo,
      locale: _locale,
      fallbackLocale: _fallbackLocale,
      ...query
    } = options ?? {}
    return Object.keys(query).length > 0 ? (query as DbQueryOptions<IbmDocument>) : undefined
  }

  private resolveLocaleOptions(options?: DocumentLocaleOptions): LocaleState {
    return {
      locale: this.normalizeLocale(options?.locale ?? this.locale),
      fallbackLocale: this.normalizeLocale(options?.fallbackLocale),
    }
  }

  private normalizeLocale(value?: string): string | undefined {
    if (typeof value !== 'string') return undefined
    const normalized = value.trim().toLowerCase()
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeNonEmpty(value?: string | null): string | undefined {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  private resolveLocalizedValue(
    value: Record<string, string | undefined> | undefined,
    localeState: LocaleState,
    fallbackText = '',
  ): string {
    if (!value) return fallbackText

    const locale = this.normalizeLocale(localeState.locale)
    if (locale) {
      const exact = value[locale]
      if (typeof exact === 'string' && exact.trim().length > 0) return exact
    }

    const fallbackLocale = this.normalizeLocale(localeState.fallbackLocale)
    if (fallbackLocale) {
      const fallback = value[fallbackLocale]
      if (typeof fallback === 'string' && fallback.trim().length > 0) return fallback
    }

    const first = Object.values(value).find((entry) => typeof entry === 'string' && entry.trim().length > 0)
    return first ?? fallbackText
  }

  private buildLanguageCandidates(localeState: LocaleState): string[] {
    const candidates: string[] = []
    const push = (value?: string) => {
      const normalized = this.normalizeLocale(value)
      if (!normalized) return
      if (!candidates.includes(normalized)) candidates.push(normalized)
    }

    push(localeState.locale)
    push(localeState.fallbackLocale)
    return candidates
  }

  private withLocaleOptions<T>(
    options: DbQueryOptions<T> | undefined,
    localeState: LocaleState,
    mlgFields: string[],
  ): DbQueryOptions<T> | undefined {
    const projectionOptions = { ...((options?.projectionOptions ?? {}) as Record<string, unknown>) }
    const hasLanguages = Array.isArray(projectionOptions.languages) && projectionOptions.languages.length > 0
    const languages = this.buildLanguageCandidates(localeState)
    if (!hasLanguages && languages.length > 0) {
      projectionOptions.languages = languages
    }

    const hasDefaultLocaleSelection = hasLanguages || languages.length > 0
    if (!options && !hasDefaultLocaleSelection) {
      return undefined
    }

    const mlgFieldsResolved = options?.mlgFields && options.mlgFields.length > 0 ? options.mlgFields : [...mlgFields]

    return {
      ...(options ?? {}),
      mlgFields: mlgFieldsResolved,
      projectionOptions,
    } as DbQueryOptions<T>
  }

  private traverseLinks<T extends {
    id?: string
    parentLinkId?: string | null
    position: number
    numbering?: string
    depth?: number
  }>(
    links: T[],
    parentNumber: string | undefined,
    baseDepth: number,
  ): TraversedLink<T>[] {
    if (!Array.isArray(links) || links.length === 0) return []

    const byId = new Map<string, T>()
    for (const link of links) {
      if (link.id) {
        byId.set(link.id, link)
      }
    }

    const childrenByParent = new Map<string, T[]>()
    const roots: T[] = []

    for (const link of links) {
      const parentId = this.normalizeNonEmpty(link.parentLinkId)
      if (!parentId || !byId.has(parentId)) {
        roots.push(link)
        continue
      }
      const arr = childrenByParent.get(parentId) ?? []
      arr.push(link)
      childrenByParent.set(parentId, arr)
    }

    const sortByPosition = (values: T[]) =>
      [...values].sort((a, b) => {
        const posDelta = Number(a.position ?? 0) - Number(b.position ?? 0)
        if (posDelta !== 0) return posDelta
        return String(a.id).localeCompare(String(b.id))
      })

    const visited = new Set<string>()
    const result: TraversedLink<T>[] = []

    const walk = (nodes: T[], nodeParentNumber: string | undefined, depth: number) => {
      let ordinal = 1
      for (const node of sortByPosition(nodes)) {
        const nodeId = node.id
        if (!nodeId) continue
        if (visited.has(nodeId)) continue
        visited.add(nodeId)

        const number = this.resolveNumber(nodeParentNumber, node.numbering, ordinal)
        const effectiveDepth = Number.isInteger(node.depth) ? Number(node.depth) : depth

        result.push({
          link: node,
          depth: effectiveDepth,
          number,
        })

        const children = childrenByParent.get(nodeId) ?? []
        walk(children, number, depth + 1)
        ordinal += 1
      }
    }

    walk(roots, parentNumber, baseDepth)

    for (const link of sortByPosition(links)) {
      if (!link.id || visited.has(link.id)) continue
      walk([link], parentNumber, baseDepth)
    }

    return result
  }

  private resolveNumber(parentNumber: string | undefined, explicit: string | undefined, ordinal: number): string {
    const normalized = this.normalizeNonEmpty(explicit)
    if (normalized) {
      if (!parentNumber) return normalized
      if (normalized.startsWith(`${parentNumber}.`)) {
        return normalized
      }
      return `${parentNumber}.${normalized}`
    }

    const segment = String(ordinal)
    return parentNumber ? `${parentNumber}.${segment}` : segment
  }

  private pushUnique(target: string[], value: string): void {
    if (!target.includes(value)) {
      target.push(value)
    }
  }

  private joinMarkdown(lines: string[]): string {
    const merged = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    return merged.length > 0 ? `${merged}\n` : ''
  }

  private resolveCascadeDependencies(
    stage: string,
    operation: string,
  ): Effect.Effect<DocmanCascadeDeleteDependencies, DocumentServiceError> {
    return Effect.gen(this, function* (_) {
      return {
        documentRepository: this.documentRepository,
        documentVersionRepository: yield* _(
          this.requireDependency(this.documentVersionRepository, 'documentVersionRepository', stage, operation)
        ),
        documentSectionLinkRepository: yield* _(
          this.requireDependency(this.documentSectionLinkRepository, 'documentSectionLinkRepository', stage, operation)
        ),
        sectionRepository: yield* _(
          this.requireDependency(this.sectionRepository, 'sectionRepository', stage, operation)
        ),
        pageRepository: yield* _(this.requireDependency(this.pageRepository, 'pageRepository', stage, operation)),
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
  ): Effect.Effect<T, DocumentServiceError> {
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
  ): DocumentServiceError {
    if (cause && typeof cause === 'object' && '_tag' in cause) {
      return cause as DocumentServiceError
    }
    return XfErrorFactory.upsertFailed({
      stage,
      operation,
      message: 'document_cascade_delete_failed',
      cause,
    })
  }
}
