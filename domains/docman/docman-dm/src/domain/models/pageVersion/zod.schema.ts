import { z } from 'zod'
import { IbmZodSchema, mlgZodSchemaUnion } from '@aopslab/xf-bm'

export const pageVersionZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    pageId: z.string(),
    version: z.number().int(),
    title: z.string().optional(),
    format: z.enum(['md','mdx']),
    content: z.string().optional(),
    contentMl: mlgZodSchemaUnion.optional(),
    contentData: z.unknown().optional(),
    directives: z.unknown().optional(),
    status: z.enum(['draft','published','archived']),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const pageVersionZodSchemaInsert = pageVersionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
