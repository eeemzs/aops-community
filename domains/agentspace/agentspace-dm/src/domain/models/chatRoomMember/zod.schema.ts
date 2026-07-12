import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { CHAT_ROOM_MEMBER_STATUSES } from '../../types.js'
import { IChatRoomMemberZodCtx } from './resources.js'

export const chatRoomMemberZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  roomId: z.string(),
  agentId: z.string(),
  roleKey: z.string(),
  brief: z.string().optional(),
  status: z.enum(CHAT_ROOM_MEMBER_STATUSES),
  lastReadSeq: z.number().int().min(0),
  joinedAt: z.date(),
  leftAt: z.date().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

export const chatRoomMemberZodSchemaInsert = chatRoomMemberZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createChatRoomMemberZodSchemaWithContext = (_ctx?: IChatRoomMemberZodCtx) => {
  return chatRoomMemberZodSchema.strict()
}
