import { Effect } from 'effect'
import { DocumentVersionServiceError } from '../../errors/DocumentVersionServiceError.js'
import { IbmDocumentVersion, IbmDocumentVersionInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { DocmanDocumentVersionDeleteReport } from '../../services/documentCascadeDelete.js'

export type DocmanDocumentVersionSetCurrentInput = {
  documentVersionId: string
  documentId?: string
  publish?: boolean
  publishedAt?: Date | string
  expectedPreviousVersionId?: string
}

export type DocmanDocumentVersionSetCurrentResult = {
  documentId: string
  currentVersionId: string
  previousCurrentVersionIds: string[]
  changed: boolean
  publishedAt: Date | null
  status: string | null
  warnings: string[]
}

export type DocmanParsedHeadingGraphNodeKind = 'section' | 'page'

export type DocmanParsedHeadingGraphNode = {
  kind: DocmanParsedHeadingGraphNodeKind
  title: string
  depth?: number
  slug?: string
  bodyMarkdown?: string
  children?: DocmanParsedHeadingGraphNode[]
}

export type DocmanParsedHeadingGraph = {
  sourceHash?: string
  sourcePath?: string
  nodes: DocmanParsedHeadingGraphNode[]
}

export type DocmanHeadingImportExistingGraphPolicy = 'error' | 'append' | 'replace'
export type DocmanHeadingImportSlugStrategy = 'hash-suffix-on-collision' | 'kebab-from-title'
export type DocmanHeadingImportBodyAssignment = 'leaf-page-content'
export type DocmanHeadingImportPagePolicy = 'h4-and-below'

export type DocmanDocumentVersionImportHeadingsInput = {
  documentVersionId: string
  scopeId: string
  parsedGraph: DocmanParsedHeadingGraph
  options?: {
    dryRun?: boolean
    existingGraphPolicy?: DocmanHeadingImportExistingGraphPolicy
    slugStrategy?: DocmanHeadingImportSlugStrategy
    bodyAssignment?: DocmanHeadingImportBodyAssignment
    headingToPagePolicy?: DocmanHeadingImportPagePolicy
    synthesizeOverviewPages?: boolean
  }
  createdBy?: string
  updatedBy?: string
}

export type DocmanHeadingImportWarning = {
  code: string
  message: string
  path?: string
}

export type DocmanImportedSectionGraphItem = {
  title: string
  slug?: string
  depth: number
  position: number
  parentLinkId?: string
  sectionId?: string
  documentSectionLinkId?: string
}

export type DocmanImportedPageGraphItem = {
  title: string
  depth: number
  position: number
  parentLinkId?: string
  pageId?: string
  pageVersionId?: string
  documentSectionLinkId?: string
  sectionPageLinkId?: string
}

export type DocmanDocumentVersionImportHeadingsResult = {
  documentVersionId: string
  dryRun: boolean
  summary: {
    sectionsCreated: number
    pagesCreated: number
    documentLinksCreated: number
    sectionPageLinksCreated: number
    warnings: DocmanHeadingImportWarning[]
  }
  graph: {
    sections: DocmanImportedSectionGraphItem[]
    pages: DocmanImportedPageGraphItem[]
  }
}

export interface IDocumentVersionServicePort {
  getById(id: string, options?: DbQueryOptions<IbmDocumentVersion>): Effect.Effect<IbmDocumentVersion | null, DocumentVersionServiceError>
  create(data: IbmDocumentVersionInsert): Effect.Effect<IbmDocumentVersion, DocumentVersionServiceError>
  listDocumentVersions(filter?: Partial<IbmDocumentVersion>, options?: DbQueryOptions<IbmDocumentVersion>): Effect.Effect<IbmDocumentVersion[], DocumentVersionServiceError>
  updateDocumentVersion(id: string, patch: Partial<IbmDocumentVersion>): Effect.Effect<IbmDocumentVersion, DocumentVersionServiceError>
  removeDocumentVersion(id: string): Effect.Effect<void, DocumentVersionServiceError>
  removeDocumentVersionSafe(id: string): Effect.Effect<DocmanDocumentVersionDeleteReport, DocumentVersionServiceError>
  importHeadings(input: DocmanDocumentVersionImportHeadingsInput): Effect.Effect<DocmanDocumentVersionImportHeadingsResult, DocumentVersionServiceError>
  setCurrent(input: DocmanDocumentVersionSetCurrentInput): Effect.Effect<DocmanDocumentVersionSetCurrentResult, DocumentVersionServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmDocumentVersion | null, DocumentVersionServiceError>
  //<==//
}

export interface IDocumentVersionLookupPort {
  getById(id: string): Effect.Effect<IbmDocumentVersion | null, DocumentVersionServiceError>
}
