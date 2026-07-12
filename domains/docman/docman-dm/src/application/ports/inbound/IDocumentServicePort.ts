import { Effect } from 'effect'
import { DocumentServiceError } from '../../errors/DocumentServiceError.js'
import { IbmDocument, IbmDocumentIndexEntry, IbmDocumentInsert, IbmDocumentVersion } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { DocmanDocumentDeleteReport } from '../../services/documentCascadeDelete.js'

export type DocumentLocaleOptions = {
  locale?: string
  fallbackLocale?: string
}

export type DocmanComposeSourceFormat = 'md' | 'mdx'

export type DocumentListOptions = DbQueryOptions<IbmDocument> & DocumentLocaleOptions & {
  includeVersionInfo?: boolean
}

export type IbmDocumentWithVersions = IbmDocument & {
  documentVersions?: IbmDocumentVersion[]
}

export type DocmanPageNodeIndexItem = {
  linkId: string
  pageVersionId: string
  pageId: string
  format: DocmanComposeSourceFormat
  number: string
  depth: number
  position: number
  title: string
  titleVisible: boolean
  pageBreakBefore: boolean
  pageBreakAfter: boolean
  parentLinkId?: string
  directives?: unknown
}

export type DocmanSectionNodeIndexItem = {
  linkId: string
  sectionId: string
  number: string
  depth: number
  position: number
  title: string
  pageBreakBefore: boolean
  pageBreakAfter: boolean
  parentLinkId?: string
  directives?: unknown
}

export type DocmanComposedPageIndex = {
  pageNumber: number
  format: DocmanComposeSourceFormat
  formats: DocmanComposeSourceFormat[]
  itemNumbers: string[]
  pageVersionIds: string[]
}

export type DocmanDocumentComposeIndexItem =
  | ({ kind: 'section' } & DocmanSectionNodeIndexItem)
  | ({ kind: 'page' } & DocmanPageNodeIndexItem)

export type DocmanDocumentComposeKind = 'document' | 'section' | 'page'
export type DocmanPublishTarget = 'markdown' | 'html'
export type DocmanDocumentIndexEntryKind = 'section' | 'page'
export type DocmanDocumentSummaryEntryKind = 'document' | 'section' | 'page'
export type DocmanDocumentRetrievalStrategy = 'lexical' | 'hybrid' | 'semantic'

export type DocmanPublishedFragmentWarning = {
  code: string
  message: string
}

export type DocmanResolvedAssetReference = {
  token: string
  ref: string
  assetId: string
  assetVersionId: string
  assetVersion: number
  assetUid?: string
  slug?: string
  title?: string
  altText?: string
  kind: string
  mime: string
  href: string
  width?: number
  height?: number
}

export type DocmanDocumentComposeFetchInput = DocumentLocaleOptions & {
  documentVersionId: string
  sectionId?: string
  pageVersionId?: string
  pageNumber?: number
}

export type DocmanDocumentComposeFetchResult = {
  documentVersionId: string
  kind: DocmanDocumentComposeKind
  format: DocmanComposeSourceFormat
  formats: DocmanComposeSourceFormat[]
  content: string
  assets: DocmanResolvedAssetReference[]
  pageNumber?: number
  sectionId?: string
  pageVersionId?: string
}

export type DocmanDocumentPublishMaterializeInput = DocmanDocumentComposeFetchInput & {
  target: DocmanPublishTarget
}

export type DocmanDocumentPublishMaterializeResult = DocmanDocumentComposeFetchResult & {
  target: DocmanPublishTarget
  mediaType: string
  warnings: DocmanPublishedFragmentWarning[]
}

export type DocmanDocumentComposeIndex = {
  documentId: string
  documentVersionId: string
  title: string
  items: DocmanDocumentComposeIndexItem[]
  pages: DocmanComposedPageIndex[]
}

export type DocmanDocumentIndexBuildInput = DocumentLocaleOptions & {
  documentVersionId: string
}

export type DocmanDocumentIndexGetInput = DocumentLocaleOptions & {
  documentVersionId: string
}

export type DocmanDocumentSummaryBuildInput = DocumentLocaleOptions & {
  documentVersionId: string
}

export type DocmanDocumentSummaryGetInput = DocumentLocaleOptions & {
  documentVersionId: string
}

export type DocmanDocumentSearchInput = DocumentLocaleOptions & {
  documentVersionId: string
  q: string
  limit?: number
  retrievalStrategy?: DocmanDocumentRetrievalStrategy
}

export type DocmanScopeDocumentSearchInput = DocumentLocaleOptions & {
  scopeId: string
  q: string
  limit?: number
  retrievalStrategy?: DocmanDocumentRetrievalStrategy
}

export type DocmanDocumentAnswerPackInput = DocumentLocaleOptions & {
  documentVersionId: string
  q: string
  limit?: number
  retrievalStrategy?: DocmanDocumentRetrievalStrategy
}

export type DocmanDocumentIndexSnapshotEntry = Pick<
  IbmDocumentIndexEntry,
  | 'linkId'
  | 'parentLinkId'
  | 'anchor'
  | 'parentAnchor'
  | 'number'
  | 'depth'
  | 'position'
  | 'title'
  | 'breadcrumb'
  | 'titleVisible'
  | 'pageBreakBefore'
  | 'pageBreakAfter'
  | 'sectionId'
  | 'sectionUid'
  | 'sectionSlug'
  | 'pageId'
  | 'pageUid'
  | 'pageVersionId'
  | 'format'
  | 'pageNumberStart'
  | 'pageNumberEnd'
> & {
  itemKind: DocmanDocumentIndexEntryKind
}

export type DocmanDocumentSearchHit = Pick<
  IbmDocumentIndexEntry,
  | 'anchor'
  | 'parentAnchor'
  | 'number'
  | 'depth'
  | 'title'
  | 'breadcrumb'
  | 'sectionId'
  | 'sectionUid'
  | 'sectionSlug'
  | 'pageId'
  | 'pageUid'
  | 'pageVersionId'
  | 'format'
  | 'pageNumberStart'
  | 'pageNumberEnd'
> & {
  itemKind: DocmanDocumentIndexEntryKind
  score: number
  excerpt: string
  matchedBy: DocmanDocumentAnswerPackMatchField[]
  lexicalScore: number
  semanticScore?: number
}

export type DocmanDocumentSearchProvenance = {
  strategy: 'lexical-search-v1' | 'hybrid-search-v1' | 'semantic-search-v1'
  retrievalStrategy: DocmanDocumentRetrievalStrategy
  vectorAvailable: boolean
  vectorProvider?: string
  vectorModel?: string
}

export type DocmanDocumentIndexSnapshot = {
  documentId?: string
  documentVersionId: string
  title?: string
  locale?: string
  fallbackLocale?: string
  built: boolean
  buildFingerprint?: string
  documentAnchor?: string
  entries: DocmanDocumentIndexSnapshotEntry[]
  counts: {
    sections: number
    pages: number
  }
}

export type DocmanDocumentSummarySnapshotEntry = Pick<
  IbmDocumentIndexEntry,
  | 'linkId'
  | 'parentLinkId'
  | 'anchor'
  | 'parentAnchor'
  | 'number'
  | 'depth'
  | 'position'
  | 'title'
  | 'breadcrumb'
  | 'titleVisible'
  | 'pageBreakBefore'
  | 'pageBreakAfter'
  | 'sectionId'
  | 'sectionUid'
  | 'sectionSlug'
  | 'pageId'
  | 'pageUid'
  | 'pageVersionId'
  | 'format'
  | 'pageNumberStart'
  | 'pageNumberEnd'
> & {
  itemKind: DocmanDocumentSummaryEntryKind
  summaryText: string
  sourceCharCount: number
  sourceWordCount: number
  summaryCharCount: number
  summaryWordCount: number
}

export type DocmanDocumentSummarySnapshot = {
  documentId?: string
  documentVersionId: string
  title?: string
  locale?: string
  fallbackLocale?: string
  built: boolean
  buildFingerprint?: string
  documentAnchor?: string
  entries: DocmanDocumentSummarySnapshotEntry[]
  counts: {
    documents: number
    sections: number
    pages: number
  }
}

export type DocmanDocumentSearchResult = {
  documentVersionId: string
  locale?: string
  fallbackLocale?: string
  q: string
  built: boolean
  buildFingerprint?: string
  hits: DocmanDocumentSearchHit[]
  provenance: DocmanDocumentSearchProvenance
}

export type DocmanScopeDocumentSearchHit = DocmanDocumentSearchHit & {
  documentId: string
  documentTitle: string
  documentSlug?: string
  documentVersionId: string
  documentVersionTitle: string
  documentVersionNumber?: number
}

export type DocmanScopeDocumentSearchFailure = {
  documentId?: string
  documentTitle?: string
  documentVersionId?: string
  stage: 'resolve-latest-version' | 'build-index' | 'search'
  message: string
}

export type DocmanScopeDocumentSearchBuildReport = {
  autoBuiltDocumentVersionIds: string[]
  failures: DocmanScopeDocumentSearchFailure[]
}

export type DocmanScopeDocumentSearchProvenance = {
  strategy: 'lexical-search-v1' | 'hybrid-search-v1' | 'semantic-search-v1'
  retrievalStrategy: DocmanDocumentRetrievalStrategy
  totalDocumentCount: number
  searchedDocumentCount: number
  autoBuiltDocumentCount: number
  failedDocumentCount: number
}

export type DocmanScopeDocumentSearchResult = {
  scopeId: string
  locale?: string
  fallbackLocale?: string
  q: string
  hits: DocmanScopeDocumentSearchHit[]
  provenance: DocmanScopeDocumentSearchProvenance
  buildReport: DocmanScopeDocumentSearchBuildReport
}

export type DocmanDocumentAnswerPackMatchField =
  | 'title'
  | 'breadcrumb'
  | 'number'
  | 'bodyText'
  | 'summaryText'
  | 'semanticVector'

export type DocmanDocumentAnswerPackAnswerSource = 'summary' | 'excerpt' | 'title' | 'none'

export type DocmanDocumentAnswerPackCitation = Pick<
  IbmDocumentIndexEntry,
  | 'anchor'
  | 'parentAnchor'
  | 'number'
  | 'depth'
  | 'title'
  | 'breadcrumb'
  | 'sectionId'
  | 'sectionUid'
  | 'sectionSlug'
  | 'pageId'
  | 'pageUid'
  | 'pageVersionId'
  | 'format'
  | 'pageNumberStart'
  | 'pageNumberEnd'
> & {
  itemKind: DocmanDocumentSummaryEntryKind
  score: number
  excerpt: string
  matchedBy: DocmanDocumentAnswerPackMatchField[]
  summaryText?: string
  lexicalScore: number
  semanticScore?: number
}

export type DocmanDocumentAnswerPackProvenance = {
  strategy: 'deterministic-answer-pack-v1' | 'hybrid-answer-pack-v1' | 'semantic-answer-pack-v1'
  retrievalStrategy: DocmanDocumentRetrievalStrategy
  citationCount: number
  selectedAnchor?: string
  selectedItemKind?: DocmanDocumentSummaryEntryKind
  primaryMatchedBy: DocmanDocumentAnswerPackMatchField[]
  vectorAvailable: boolean
  vectorProvider?: string
  vectorModel?: string
}

export type DocmanDocumentAnswerPackResult = {
  documentVersionId: string
  locale?: string
  fallbackLocale?: string
  q: string
  built: boolean
  buildFingerprint?: string
  answer: string
  answerSource: DocmanDocumentAnswerPackAnswerSource
  citations: DocmanDocumentAnswerPackCitation[]
  provenance: DocmanDocumentAnswerPackProvenance
}

export interface IDocumentServicePort {
  getById(id: string, options?: DbQueryOptions<IbmDocument>): Effect.Effect<IbmDocument | null, DocumentServiceError>
  create(data: IbmDocumentInsert): Effect.Effect<IbmDocument, DocumentServiceError>
  listDocuments(
    filter?: Partial<IbmDocument>,
    options?: DocumentListOptions,
  ): Effect.Effect<IbmDocumentWithVersions[], DocumentServiceError>
  updateDocument(id: string, patch: Partial<IbmDocument>): Effect.Effect<IbmDocument, DocumentServiceError>
  removeDocument(id: string): Effect.Effect<void, DocumentServiceError>
  removeDocumentSafe(id: string, confirmName: string): Effect.Effect<DocmanDocumentDeleteReport, DocumentServiceError>
  buildDocumentIndex(
    documentVersionId: string,
    options?: DocumentLocaleOptions,
  ): Effect.Effect<DocmanDocumentComposeIndex, DocumentServiceError>
  buildPersistedDocumentIndex(
    input: DocmanDocumentIndexBuildInput,
  ): Effect.Effect<DocmanDocumentIndexSnapshot, DocumentServiceError>
  getPersistedDocumentIndex(
    input: DocmanDocumentIndexGetInput,
  ): Effect.Effect<DocmanDocumentIndexSnapshot, DocumentServiceError>
  buildPersistedDocumentSummary(
    input: DocmanDocumentSummaryBuildInput,
  ): Effect.Effect<DocmanDocumentSummarySnapshot, DocumentServiceError>
  getPersistedDocumentSummary(
    input: DocmanDocumentSummaryGetInput,
  ): Effect.Effect<DocmanDocumentSummarySnapshot, DocumentServiceError>
  searchPersistedDocumentIndex(
    input: DocmanDocumentSearchInput,
  ): Effect.Effect<DocmanDocumentSearchResult, DocumentServiceError>
  searchScopePersistedDocumentIndex(
    input: DocmanScopeDocumentSearchInput,
  ): Effect.Effect<DocmanScopeDocumentSearchResult, DocumentServiceError>
  getDocumentAnswerPack(
    input: DocmanDocumentAnswerPackInput,
  ): Effect.Effect<DocmanDocumentAnswerPackResult, DocumentServiceError>
  fetchComposedFragment(
    input: DocmanDocumentComposeFetchInput,
  ): Effect.Effect<DocmanDocumentComposeFetchResult, DocumentServiceError>
  materializePublishedFragment(
    input: DocmanDocumentPublishMaterializeInput,
  ): Effect.Effect<DocmanDocumentPublishMaterializeResult, DocumentServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmDocument | null, DocumentServiceError>
  //<==//
}

export interface IDocumentLookupPort {
  getById(id: string): Effect.Effect<IbmDocument | null, DocumentServiceError>
}
