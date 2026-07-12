import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IChatRoomBindingZodCtx } from './resources.js'

export const chatRoomBindingZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  roomId: z.string(),
  bindingType: z.string(),
  refId: z.string().optional(),
  uri: z.string().optional(),
  title: z.string().optional(),
  note: z.string().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

export const chatRoomBindingZodSchemaInsert = chatRoomBindingZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createChatRoomBindingZodSchemaWithContext = (_ctx?: IChatRoomBindingZodCtx) => {
  return chatRoomBindingZodSchema.strict()
}
