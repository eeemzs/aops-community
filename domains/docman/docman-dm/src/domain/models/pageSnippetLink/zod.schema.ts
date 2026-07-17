import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const pageSnippetLinkZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    pageVersionId: z.string(),
    snippetId: z.string(),
    position: z.number().int(),
    caption: z.string().optional(),
    showLineNumbers: z.boolean().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const pageSnippetLinkZodSchemaInsert = pageSnippetLinkZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
