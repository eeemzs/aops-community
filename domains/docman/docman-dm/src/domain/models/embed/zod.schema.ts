import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const embedZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    embedUid: z.string(),
    type: z.enum(['image','table','mermaid']),
    title: z.string().optional(),
    content: z.string().optional(),
    url: z.string().optional(),
    path: z.string().optional(),
    mime: z.string().optional(),
    meta: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const embedZodSchemaInsert = embedZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
