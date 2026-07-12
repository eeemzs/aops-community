import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IProjectPathZodCtx } from './resources.js'

export const projectPathZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    projectId: z.string(),
    pathKey: z.string(),
    path: z.string(),
    description: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const projectPathZodSchemaInsert = projectPathZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createProjectPathZodSchemaWithContext = (ctx?: IProjectPathZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return projectPathZodSchema.strict()
}
