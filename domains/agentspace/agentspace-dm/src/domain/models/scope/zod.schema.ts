import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { SCOPE_TYPES } from '../../types.js'
import { IScopeZodCtx } from './resources.js'

export const scopeZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    type: z.enum(SCOPE_TYPES),
    parentScopeId: z.string().nullable().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const scopeZodSchemaInsert = scopeZodSchema
  .omit({
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createScopeZodSchemaWithContext = (_ctx?: IScopeZodCtx) => {
  return scopeZodSchema.strict()
}
