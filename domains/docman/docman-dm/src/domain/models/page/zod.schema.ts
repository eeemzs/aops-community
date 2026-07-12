import { z } from 'zod'
import { IbmZodSchema, mlgZodSchemaUnion } from '@aopslab/xf-bm'

export const pageZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    pageUid: z.string(),
    title: z.string(),
    titleMl: mlgZodSchemaUnion.optional(),
    kind: z.string().optional(),
    meta: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const pageZodSchemaInsert = pageZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
