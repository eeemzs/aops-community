import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'

export const documentGroupZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    groupUid: z.string(),
    parentGroupId: z.string().optional(),
    parentGroupUid: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    meta: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const documentGroupZodSchemaInsert = documentGroupZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()
