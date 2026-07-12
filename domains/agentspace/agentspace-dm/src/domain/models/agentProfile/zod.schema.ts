import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { scopeableFields } from '../../types.js'
import { IAgentProfileZodCtx } from './resources.js'

export const agentProfileZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeableFields,
    projectId: z.string().optional(),
    slug: z.string(),
    name: z.string(),
    role: z.string(),
    version: z.number().optional(),
    kind: z.string().optional(),
    defaultAgents: z.array(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    allowedSurfaces: z.array(z.string()).optional(),
    requiresApprovalFor: z.array(z.string()).optional(),
    promptRef: z.string().optional(),
    skillRefs: z.array(z.string()).optional(),
    resourceRefs: z.array(z.string()).optional(),
    overlayRefs: z.array(z.string()).optional(),
    additionalContextRefs: z.array(z.string()).optional(),
    body: z.string().optional(),
    tags: z.array(z.string()).optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const agentProfileZodSchemaInsert = agentProfileZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

export const createAgentProfileZodSchemaWithContext = (_ctx?: IAgentProfileZodCtx) => {
  return agentProfileZodSchema.strict()
}
