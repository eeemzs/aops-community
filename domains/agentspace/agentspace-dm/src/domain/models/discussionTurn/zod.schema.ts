import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { DISCUSSION_TURN_ADDRESSED_TO, DISCUSSION_TURN_KINDS } from '../../types.js'
import { IDiscussionTurnZodCtx } from './resources.js'

export const discussionTurnZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  topicId: z.string(),
  seq: z.number().int().min(1),
  agentId: z.string(),
  kind: z.enum(DISCUSSION_TURN_KINDS),
  text: z.string(),
  addressedTo: z.enum(DISCUSSION_TURN_ADDRESSED_TO).optional(),
  replyToSeq: z.number().int().min(1).optional(),
  idempotencyKey: z.string().optional(),
  createdBy: z.string().optional(),
})

export const discussionTurnZodSchemaInsert = discussionTurnZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createDiscussionTurnZodSchemaWithContext = (_ctx?: IDiscussionTurnZodCtx) => {
  return discussionTurnZodSchema.strict()
}
