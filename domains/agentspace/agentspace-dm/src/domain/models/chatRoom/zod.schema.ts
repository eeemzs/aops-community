import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { CHAT_ROOM_KINDS, CHAT_ROOM_STATUSES } from '../../types.js'
import { IChatRoomZodCtx } from './resources.js'

export const chatRoomZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  projectId: z.string().optional(),
  slug: z.string(),
  title: z.string(),
  kind: z.enum(CHAT_ROOM_KINDS),
  purpose: z.string().optional(),
  guidanceMarkdown: z.string().optional(),
  status: z.enum(CHAT_ROOM_STATUSES),
  dmKey: z.string().optional(),
  lastSeq: z.number().int().min(0),
  lastMessageAt: z.date().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

export const chatRoomZodSchemaInsert = chatRoomZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createChatRoomZodSchemaWithContext = (_ctx?: IChatRoomZodCtx) => {
  return chatRoomZodSchema.strict()
}
