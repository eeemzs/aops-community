import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IAgentRunEventZodCtx } from './resources.js'

export const agentRunEventZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    agentRunId: z.string(),
    runId: z.string(),
    eventId: z.string(),
    sequence: z.number().int().positive(),
    eventType: z.string(),
    status: z.string().optional(),
    payload: z.unknown().optional(),
    meta: z.unknown().optional(),
    emittedAt: z.date(),
  })

/* Insert schema */
export const agentRunEventZodSchemaInsert = agentRunEventZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createAgentRunEventZodSchemaWithContext = (ctx?: IAgentRunEventZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return agentRunEventZodSchema.strict()
}
