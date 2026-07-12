import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { CODEX_CHAT_MESSAGE_ROLES } from '../../types.js'
import { ICodexChatMessageZodCtx } from './resources.js'

export const codexChatMessageZodSchema = z.object({
  ...IbmZodSchema.shape,
  projectId: z.string(),
  threadId: z.string(),
  externalThreadId: z.string().optional(),
  role: z.enum(CODEX_CHAT_MESSAGE_ROLES),
  text: z.string(),
  turnId: z.string().optional(),
  itemId: z.string().optional(),
  messageAt: z.date(),
  seq: z.number().int().min(1),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

/* Insert schema */
export const codexChatMessageZodSchemaInsert = codexChatMessageZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createCodexChatMessageZodSchemaWithContext = (_ctx?: ICodexChatMessageZodCtx) => {
  return codexChatMessageZodSchema.strict()
}
