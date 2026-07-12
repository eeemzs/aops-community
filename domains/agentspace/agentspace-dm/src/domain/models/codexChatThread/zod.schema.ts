import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ICodexChatThreadZodCtx } from './resources.js'

export const codexChatThreadZodSchema = z.object({
  ...IbmZodSchema.shape,
    scopeId: z.string(),
  externalThreadId: z.string(),
  scopeLabel: z.string().optional(),
  cwd: z.string().optional(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  lastPrompt: z.string().optional(),
  lastAssistant: z.string().optional(),
  tokenInput: z.number().int().min(0).nullable().optional(),
  tokenOutput: z.number().int().min(0).nullable().optional(),
  tokenTotal: z.number().int().min(0).nullable().optional(),
  lastMessageAt: z.date().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

/* Insert schema */
export const codexChatThreadZodSchemaInsert = codexChatThreadZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createCodexChatThreadZodSchemaWithContext = (_ctx?: ICodexChatThreadZodCtx) => {
  return codexChatThreadZodSchema.strict()
}
