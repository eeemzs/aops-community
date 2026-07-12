import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { TAG_SCOPE_TYPES } from '../../types.js'
import { ITagZodCtx } from './resources.js'

export const tagZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    scopeType: z.enum(TAG_SCOPE_TYPES),
    name: z.string(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const tagZodSchemaInsert = tagZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createTagZodSchemaWithContext = (ctx?: ITagZodCtx) => {
  void ctx
  return tagZodSchema.strict()
}
