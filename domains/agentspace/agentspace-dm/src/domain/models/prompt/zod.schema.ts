import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { PROMPT_STATUSES, scopeableFields } from '../../types.js'
import { IPromptZodCtx } from './resources.js'

export const promptZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeableFields,
    name: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(PROMPT_STATUSES).default('draft'),
    currentVersionId: z.string().nullable().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const promptZodSchemaInsert = promptZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createPromptZodSchemaWithContext = (ctx?: IPromptZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return promptZodSchema.strict()
}
