import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IProjectZodCtx } from './resources.js'

export const projectZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    slug: z.string().optional(),
    status: z.string().optional(),
    visibility: z.string().optional(),
    projectType: z.string().optional(),
    ownerId: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const projectZodSchemaInsert = projectZodSchema.omit({
  id: true,
  scopeId: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createProjectZodSchemaWithContext = (ctx?: IProjectZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return projectZodSchema.strict()
}
