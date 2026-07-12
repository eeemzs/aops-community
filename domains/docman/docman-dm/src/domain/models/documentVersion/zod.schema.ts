import { z } from 'zod'
import { IbmZodSchema, mlgZodSchemaUnion } from '@aopslab/xf-bm'

export const documentVersionZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    documentId: z.string(),
    version: z.number().int(),
    label: z.string().optional(),
    status: z.enum(['draft','published','archived']),
    title: z.string().optional(),
    summary: z.string().optional(),
    releaseNotes: z.string().optional(),
    releaseNotesMl: mlgZodSchemaUnion.optional(),
    isCurrent: z.boolean().optional(),
    basedOnVersionId: z.string().optional(),
    publishedAt: z.date().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const documentVersionZodSchemaInsert = documentVersionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
