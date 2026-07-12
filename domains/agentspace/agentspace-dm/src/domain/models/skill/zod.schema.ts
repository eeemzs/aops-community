import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { scopeableFields } from '../../types.js'
import { ISkillZodCtx } from './resources.js'

export const skillZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeableFields,
    name: z.string(),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    tags: z.array(z.string()).optional(),
    currentVersionId: z.string().nullable().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const skillZodSchemaInsert = skillZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createSkillZodSchemaWithContext = (ctx?: ISkillZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return skillZodSchema.strict()
}
