import type { IbmDocument, IbmDocumentInsert } from '@aopslab/domain-dm-docman/models'
import type {
  DocmanComposeSourceFormat,
  DocmanDocumentAnswerPackInput,
  DocmanDocumentAnswerPackResult,
  DocmanDocumentComposeFetchInput,
  DocmanDocumentComposeFetchResult,
  DocmanDocumentComposeIndex,
  DocmanDocumentIndexBuildInput,
  DocmanDocumentIndexGetInput,
  DocmanDocumentIndexSnapshot,
  DocmanDocumentSummaryBuildInput,
  DocmanDocumentSummaryGetInput,
  DocmanDocumentSummarySnapshot,
  DocmanDocumentSearchInput,
  DocmanDocumentSearchResult,
  DocmanDocumentPublishMaterializeInput,
  DocmanDocumentPublishMaterializeResult,
  DocmanDocumentVersionImportHeadingsInput,
  DocmanDocumentVersionImportHeadingsResult,
  DocmanScopeDocumentSearchInput,
  DocmanScopeDocumentSearchResult,
  DocmanPublishTarget,
  DocmanPublishedFragmentWarning,
  DocumentListOptions,
  DocmanResolvedAssetReference,
  IbmDocumentWithVersions,
} from '@aopslab/domain-dm-docman/ports'
import type { DocumentSectionLinkUsageItem } from '@aopslab/domain-dm-docman/repository-ports'

// Re-export core service/model types so host apps can import a single source from @aopslab/domain-kit-docman.
export type {
  DocmanDocumentComposeFetchInput,
  DocmanDocumentComposeFetchResult,
  DocmanDocumentComposeIndex,
  DocmanDocumentAnswerPackInput,
  DocmanDocumentAnswerPackResult,
  DocmanDocumentIndexBuildInput,
  DocmanDocumentIndexGetInput,
  DocmanDocumentIndexSnapshot,
  DocmanDocumentSummaryBuildInput,
  DocmanDocumentSummaryGetInput,
  DocmanDocumentSummarySnapshot,
  DocmanDocumentSearchInput,
  DocmanDocumentSearchResult,
  DocmanScopeDocumentSearchInput,
  DocmanScopeDocumentSearchResult,
  DocmanDocumentPublishMaterializeInput,
  DocmanDocumentPublishMaterializeResult,
  DocmanDocumentVersionImportHeadingsInput,
  DocmanDocumentVersionImportHeadingsResult,
  DocmanComposeSourceFormat,
  DocmanPublishTarget,
  DocmanPublishedFragmentWarning,
  DocmanResolvedAssetReference,
  DocumentListOptions,
  IbmDocument,
  IbmDocumentInsert,
  IbmDocumentWithVersions,
}

export type DocmanCrudEntity =
  | 'document'
  | 'document-group'
  | 'document-version'
  | 'section'
  | 'page'
  | 'page-version'
  | 'document-section-link'
  | 'section-page-link'
  | 'snippet'
  | 'page-snippet-link'
  | 'asset'
  | 'asset-version'
  | 'embed'
  | 'page-embed-link'

export type DocmanCrudKind = 'list' | 'get' | 'create' | 'update' | 'delete'

export type DocmanCrudOperationId = `${DocmanCrudEntity}.${DocmanCrudKind}`

type DocmanCrudInput<TId extends DocmanCrudOperationId> = TId extends `${string}.list`
  ? {
      filter?: Record<string, unknown>
      options?: DocumentListOptions
    }
  : TId extends `${string}.get`
    ? {
        id: string
        options?: DocumentListOptions
      }
    : TId extends `${string}.create`
      ? {
          data: Record<string, unknown>
        }
      : TId extends `${string}.update`
        ? {
            id: string
            patch: Record<string, unknown>
          }
        : {
            id: string
          }

type DocmanCrudOutput<TId extends DocmanCrudOperationId> = TId extends `${string}.list`
  ? unknown[]
  : TId extends `${string}.get`
    ? unknown | null
    : TId extends `${string}.create` | `${string}.update`
      ? unknown
      : unknown

export type DocmanDocumentListOperationInput = {
  filter?: Partial<IbmDocument>
  options?: DocumentListOptions
}

export type DocmanDocumentGetOperationInput = {
  id: string
  options?: DocumentListOptions
}

export type DocmanDocumentCreateOperationInput = {
  data: IbmDocumentInsert
}

export type DocmanDocumentUpdateOperationInput = {
  id: string
  patch: Partial<IbmDocument>
}

export type DocmanDocumentComposeIndexOperationInput = {
  documentVersionId: string
  options?: {
    locale?: string
    fallbackLocale?: string
  }
}

export type DocmanDocumentIndexBuildOperationInput = DocmanDocumentIndexBuildInput
export type DocmanDocumentIndexGetOperationInput = DocmanDocumentIndexGetInput
export type DocmanDocumentSummaryBuildOperationInput = DocmanDocumentSummaryBuildInput
export type DocmanDocumentSummaryGetOperationInput = DocmanDocumentSummaryGetInput
export type DocmanDocumentSearchOperationInput = DocmanDocumentSearchInput
export type DocmanScopeDocumentSearchOperationInput = DocmanScopeDocumentSearchInput
export type DocmanDocumentAnswerPackOperationInput = DocmanDocumentAnswerPackInput

export type DocmanDocumentDeleteSafeOperationInput = {
  id: string
  confirmName: string
}

export type DocmanDocumentVersionDeleteSafeOperationInput = {
  id: string
}

export type DocmanDocumentVersionImportHeadingsOperationInput = DocmanDocumentVersionImportHeadingsInput

export type DocmanDocumentVersionSetCurrentOperationInput = {
  documentVersionId: string
  documentId?: string
  publish?: boolean
  publishedAt?: Date | string
  expectedPreviousVersionId?: string
}

export type DocmanDocumentVersionSetCurrentOperationOutput = {
  documentId: string
  currentVersionId: string
  previousCurrentVersionIds: string[]
  changed: boolean
  publishedAt: Date | null
  status: string | null
  warnings: string[]
}

export type DocmanDocumentSectionLinkUsageListOperationInput = {
  sectionId: string
}

type DocmanCustomOperationInputById = {
  'document.compose.index': DocmanDocumentComposeIndexOperationInput
  'document.index.build': DocmanDocumentIndexBuildOperationInput
  'document.index.get': DocmanDocumentIndexGetOperationInput
  'document.summary.build': DocmanDocumentSummaryBuildOperationInput
  'document.summary.get': DocmanDocumentSummaryGetOperationInput
  'document.search': DocmanDocumentSearchOperationInput
  'document.scope.search': DocmanScopeDocumentSearchOperationInput
  'document.answer-pack': DocmanDocumentAnswerPackOperationInput
  'document.compose.fetch': DocmanDocumentComposeFetchInput
  'document.publish.materialize': DocmanDocumentPublishMaterializeInput
  'document.delete.safe': DocmanDocumentDeleteSafeOperationInput
  'document-version.delete.safe': DocmanDocumentVersionDeleteSafeOperationInput
  'document-version.import-headings': DocmanDocumentVersionImportHeadingsOperationInput
  'document-version.set-current': DocmanDocumentVersionSetCurrentOperationInput
  'document-section-link.usage.list': DocmanDocumentSectionLinkUsageListOperationInput
}

type DocmanCustomOperationOutputById = {
  'document.compose.index': DocmanDocumentComposeIndex
  'document.index.build': DocmanDocumentIndexSnapshot
  'document.index.get': DocmanDocumentIndexSnapshot
  'document.summary.build': DocmanDocumentSummarySnapshot
  'document.summary.get': DocmanDocumentSummarySnapshot
  'document.search': DocmanDocumentSearchResult
  'document.scope.search': DocmanScopeDocumentSearchResult
  'document.answer-pack': DocmanDocumentAnswerPackResult
  'document.compose.fetch': DocmanDocumentComposeFetchResult
  'document.publish.materialize': DocmanDocumentPublishMaterializeResult
  'document.delete.safe': unknown
  'document-version.delete.safe': unknown
  'document-version.import-headings': DocmanDocumentVersionImportHeadingsResult
  'document-version.set-current': DocmanDocumentVersionSetCurrentOperationOutput
  'document-section-link.usage.list': DocumentSectionLinkUsageItem[]
}

export type DocmanOperationInputById = {
  [TId in DocmanCrudOperationId]: DocmanCrudInput<TId>
} & DocmanCustomOperationInputById

export type DocmanOperationOutputById = {
  [TId in DocmanCrudOperationId]: DocmanCrudOutput<TId>
} & DocmanCustomOperationOutputById

export type DocmanTypedOperationId = Extract<keyof DocmanOperationInputById, string>

export type DocmanOperationHostContextInput = {
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
}

export type DocmanOperationInput<TId extends DocmanTypedOperationId> = DocmanOperationInputById[TId] & DocmanOperationHostContextInput
export type DocmanOperationOutput<TId extends DocmanTypedOperationId> = DocmanOperationOutputById[TId]
