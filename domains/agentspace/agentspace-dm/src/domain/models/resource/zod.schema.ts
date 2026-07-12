import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { RESOURCE_TYPES, scopeableFields } from '../../types.js'
import { IResourceZodCtx } from './resources.js'

export const resourceZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeableFields,
    name: z.string(),
    description: z.string().optional(),
    resourceType: z.enum(RESOURCE_TYPES),
    uri: z.string().optional(),
    tags: z.array(z.string()).optional(),
    refType: z.string().optional(),
    refId: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
    meta: z.unknown().optional(),
  })

/* Insert schema */
export const resourceZodSchemaInsert = resourceZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createResourceZodSchemaWithContext = (_ctx?: IResourceZodCtx) => {
  return resourceZodSchema.strict()
}
