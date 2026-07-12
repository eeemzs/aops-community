import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { AGENT_SESSION_STATUSES } from '../../types.js'
import { IAgentSessionZodCtx } from './resources.js'

export const agentSessionZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    missionId: z.string().optional(),
    sessionId: z.string(),
    agent: z.string(),
    profile: z.string().optional(),
    model: z.string().optional(),
    status: z.enum(AGENT_SESSION_STATUSES),
    startedAt: z.date().optional(),
    endedAt: z.date().optional(),
  })

/* Insert schema */
export const agentSessionZodSchemaInsert = agentSessionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createAgentSessionZodSchemaWithContext = (ctx?: IAgentSessionZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return agentSessionZodSchema.strict()
}
