import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const pageEmbedLinkZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    pageVersionId: z.string(),
    embedId: z.string(),
    position: z.number().int(),
    caption: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const pageEmbedLinkZodSchemaInsert = pageEmbedLinkZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
