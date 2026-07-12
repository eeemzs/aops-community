import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { CHAT_MESSAGE_KINDS } from '../../types.js'
import { IChatMessageZodCtx } from './resources.js'

export const chatMessageZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  roomId: z.string(),
  seq: z.number().int().min(1),
  authorAgentId: z.string(),
  kind: z.enum(CHAT_MESSAGE_KINDS),
  text: z.string(),
  mentions: z.array(z.string()).optional(),
  replyToSeq: z.number().int().min(1).optional(),
  idempotencyKey: z.string().optional(),
  createdBy: z.string().optional(),
})

export const chatMessageZodSchemaInsert = chatMessageZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createChatMessageZodSchemaWithContext = (_ctx?: IChatMessageZodCtx) => {
  return chatMessageZodSchema.strict()
}
