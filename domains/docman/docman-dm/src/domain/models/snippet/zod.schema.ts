import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const snippetZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    snippetUid: z.string(),
    title: z.string().optional(),
    language: z.string(),
    code: z.string(),
    description: z.string().optional(),
    meta: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const snippetZodSchemaInsert = snippetZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
