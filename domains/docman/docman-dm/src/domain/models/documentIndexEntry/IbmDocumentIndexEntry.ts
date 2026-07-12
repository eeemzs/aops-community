import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import {
  documentIndexEntryItemKindZodSchema,
  documentIndexEntryZodSchema,
  documentIndexEntryZodSchemaInsert,
} from './zod.schema.js'

export type IbmDocumentIndexEntry = z.infer<typeof documentIndexEntryZodSchema>
export type IbmDocumentIndexEntryInsert = z.infer<typeof documentIndexEntryZodSchemaInsert>
export type DocmanDocumentIndexEntryItemKind = z.infer<typeof documentIndexEntryItemKindZodSchema>

export const ibmDocumentIndexEntryKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
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
  'summaryText',
  'sourceCharCount',
  'sourceWordCount',
  'summaryCharCount',
  'summaryWordCount',
  'searchText',
  'embeddingProvider',
  'embeddingModel',
  'embeddingHash',
  'embeddingDimensions',
  'embeddingVector',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmDocumentIndexEntry)[]

type _VerifyKeys = EnsureAllKeys<IbmDocumentIndexEntry, typeof ibmDocumentIndexEntryKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys
