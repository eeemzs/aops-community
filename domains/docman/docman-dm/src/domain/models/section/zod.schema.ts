import { z } from 'zod'
import { IbmZodSchema, mlgZodSchemaUnion } from '@aopslab/xf-bm'

export const sectionZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    sectionUid: z.string(),
    title: z.string(),
    titleMl: mlgZodSchemaUnion.optional(),
    kind: z.string().optional(),
    slug: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const sectionZodSchemaInsert = sectionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
