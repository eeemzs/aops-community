import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { PROMPT_VERSION_STATUSES } from '../../types.js'
import { IPromptVersionZodCtx } from './resources.js'

export const promptVersionZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    projectId: z.string(),
    promptId: z.string(),
    version: z.number().int().min(1),
    status: z.enum(PROMPT_VERSION_STATUSES),
    content: z.string(),
    variables: z.unknown().optional(),
    meta: z.unknown().optional(),
    publishedAt: z.date().optional(),
    refType: z.string().optional(),
    refId: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const promptVersionZodSchemaInsert = promptVersionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createPromptVersionZodSchemaWithContext = (ctx?: IPromptVersionZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return promptVersionZodSchema.strict()
}
