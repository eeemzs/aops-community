import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { codexChatThreadZodSchema, codexChatThreadZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmCodexChatThread = z.infer<typeof codexChatThreadZodSchema>
export type IbmCodexChatThreadInsert = z.infer<typeof codexChatThreadZodSchemaInsert>

export const ibmCodexChatThreadKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'externalThreadId',
  'scopeLabel',
  'cwd',
  'title',
  'tags',
  'lastPrompt',
  'lastAssistant',
  'tokenInput',
  'tokenOutput',
  'tokenTotal',
  'lastMessageAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmCodexChatThread)[]

type _VerifyKeys = EnsureAllKeys<IbmCodexChatThread, typeof ibmCodexChatThreadKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmCodexChatThreadMlgKeys = DotNestedMlgKeys<IbmCodexChatThread>

export const bmCodexChatThreadMlgFields = mlgFieldsOf<IbmCodexChatThread>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmCodexChatThread, typeof bmCodexChatThreadMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
