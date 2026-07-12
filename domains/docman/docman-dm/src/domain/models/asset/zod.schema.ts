import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const assetZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    assetUid: z.string(),
    kind: z.enum(['image', 'file', 'document', 'attachment']),
    title: z.string().optional(),
    slug: z.string().optional(),
    altText: z.string().optional(),
    currentVersionId: z.string().uuid().optional(),
    meta: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const assetZodSchemaInsert = assetZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
