import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IAgentRunZodCtx } from './resources.js'

export const agentRunZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    projectId: z.string().nullable().optional(),
    agentSessionId: z.string(),
    taskId: z.string().nullable().optional(),
    runId: z.string(),
    sessionId: z.string(),
    agent: z.string(),
    profile: z.string().optional(),
    model: z.string().optional(),
    outputFormat: z.string().optional(),
    tokensUsed: z.number().int().min(0).optional(),
    costUsd: z.number().nonnegative().optional(),
    exitCode: z.number().int().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    resultText: z.string().optional(),
    meta: z.unknown().optional(),
    startedAt: z.date().optional(),
    endedAt: z.date().optional(),
    durationMs: z.number().int().min(0).optional(),
  })

/* Insert schema */
export const agentRunZodSchemaInsert = agentRunZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createAgentRunZodSchemaWithContext = (ctx?: IAgentRunZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return agentRunZodSchema.strict()
}
