import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const documentIndexEntryItemKindZodSchema = z.enum(['document', 'section', 'page'])

export const documentIndexEntryZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    documentVersionId: z.string().uuid(),
    documentId: z.string().uuid(),
    locale: z.string().optional(),
    fallbackLocale: z.string().optional(),
    itemKind: documentIndexEntryItemKindZodSchema,
    sortOrder: z.number().int().nonnegative(),
    buildFingerprint: z.string(),
    linkId: z.string().uuid().optional(),
    parentLinkId: z.string().uuid().optional(),
    anchor: z.string(),
    parentAnchor: z.string().optional(),
    number: z.string().optional(),
    depth: z.number().int().nonnegative(),
    position: z.number().int().nonnegative(),
    title: z.string(),
    breadcrumb: z.string(),
    titleVisible: z.boolean(),
    pageBreakBefore: z.boolean(),
    pageBreakAfter: z.boolean(),
    sectionId: z.string().uuid().optional(),
    sectionUid: z.string().optional(),
    sectionSlug: z.string().optional(),
    pageId: z.string().uuid().optional(),
    pageUid: z.string().optional(),
    pageVersionId: z.string().uuid().optional(),
    format: z.enum(['md', 'mdx']).optional(),
    pageNumberStart: z.number().int().positive().optional(),
    pageNumberEnd: z.number().int().positive().optional(),
    bodyText: z.string().optional(),
    summaryText: z.string().optional(),
    sourceCharCount: z.number().int().nonnegative().optional(),
    sourceWordCount: z.number().int().nonnegative().optional(),
    summaryCharCount: z.number().int().nonnegative().optional(),
    summaryWordCount: z.number().int().nonnegative().optional(),
    searchText: z.string(),
    embeddingProvider: z.string().optional(),
    embeddingModel: z.string().optional(),
    embeddingHash: z.string().optional(),
    embeddingDimensions: z.number().int().positive().optional(),
    embeddingVector: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const documentIndexEntryZodSchemaInsert = documentIndexEntryZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
