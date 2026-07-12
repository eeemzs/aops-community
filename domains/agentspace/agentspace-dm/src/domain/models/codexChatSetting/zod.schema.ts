import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import {
  CODEX_CHAT_EXECUTION_MODES,
  CODEX_CHAT_REASONING_EFFORTS,
  CODEX_CHAT_SANDBOX_MODES,
} from '../../types.js'
import { ICodexChatSettingZodCtx } from './resources.js'

const CODEX_CHAT_SERVICE_TIERS = ['fast', 'flex'] as const
const CODEX_CHAT_PERSONALITIES = ['friendly', 'pragmatic', 'none'] as const
const CODEX_CHAT_APPROVALS_REVIEWERS = ['user', 'guardian_subagent'] as const

export const codexChatSettingZodSchema = z.object({
  ...IbmZodSchema.shape,
  projectId: z.string(),
  userId: z.string(),
  binaryPath: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modelProvider: z.string().nullable().optional(),
  reasoningEffort: z.enum(CODEX_CHAT_REASONING_EFFORTS).nullable().optional(),
  profile: z.string().nullable().optional(),
  serviceTier: z.enum(CODEX_CHAT_SERVICE_TIERS).nullable().optional(),
  personality: z.enum(CODEX_CHAT_PERSONALITIES).nullable().optional(),
  approvalsReviewer: z.enum(CODEX_CHAT_APPROVALS_REVIEWERS).nullable().optional(),
  executionMode: z.enum(CODEX_CHAT_EXECUTION_MODES),
  sandboxMode: z.enum(CODEX_CHAT_SANDBOX_MODES),
  manualCwd: z.string().nullable().optional(),
  autoStart: z.boolean().optional(),
  persistExtendedHistory: z.boolean().optional(),
  experimentalApi: z.boolean().optional(),
  optOutNotificationMethods: z.string().nullable().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

/* Insert schema */
export const codexChatSettingZodSchemaInsert = codexChatSettingZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createCodexChatSettingZodSchemaWithContext = (_ctx?: ICodexChatSettingZodCtx) => {
  return codexChatSettingZodSchema.strict()
}
