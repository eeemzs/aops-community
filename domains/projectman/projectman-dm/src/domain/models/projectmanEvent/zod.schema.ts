import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IProjectmanEventZodCtx } from './resources.js'

export const projectmanEventZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    entityType: z.string(),
    entityId: z.string(),
    action: z.string(),
    payload: z.unknown().optional(),
    actorId: z.string().optional(),
  })

/* Insert schema */
export const projectmanEventZodSchemaInsert = projectmanEventZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createProjectmanEventZodSchemaWithContext = (_ctx?: IProjectmanEventZodCtx) => {
  return projectmanEventZodSchema.strict()
}
