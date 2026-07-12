import { z } from 'zod'
import { IbmZodSchema, mlgZodSchemaUnion } from '@aopslab/xf-bm'

export const documentZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    documentUid: z.string(),
    groupId: z.string().optional(),
    groupUid: z.string().optional(),
    slug: z.string().optional(),
    title: z.string(),
    titleMl: mlgZodSchemaUnion.optional(),
    summary: z.string().optional(),
    summaryMl: mlgZodSchemaUnion.optional(),
    description: z.string().optional(),
    descriptionMl: mlgZodSchemaUnion.optional(),
    status: z.enum(['draft','published','archived']),
    visibility: z.enum(['public','private','internal']),
    tags: z.array(z.string()).optional(),
    pageSize: z.string().optional(),
    meta: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const documentZodSchemaInsert = documentZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
