import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const sectionPageLinkZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    sectionId: z.string(),
    pageVersionId: z.string(),
    position: z.number().int(),
    numbering: z.string().optional(),
    titleOverride: z.string().optional(),
    titleVisible: z.boolean().optional(),
    pageBreakBefore: z.boolean().optional(),
    pageBreakAfter: z.boolean().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const sectionPageLinkZodSchemaInsert = sectionPageLinkZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
