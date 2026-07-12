import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IDiscussionOutputZodCtx } from './resources.js'

export const discussionOutputZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  topicId: z.string(),
  outputKind: z.string(),
  ownerAgentId: z.string(),
  content: z.string(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

export const discussionOutputZodSchemaInsert = discussionOutputZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createDiscussionOutputZodSchemaWithContext = (_ctx?: IDiscussionOutputZodCtx) => {
  return discussionOutputZodSchema.strict()
}
