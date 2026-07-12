import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { codexChatMessageZodSchema, codexChatMessageZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmCodexChatMessage = z.infer<typeof codexChatMessageZodSchema>
export type IbmCodexChatMessageInsert = z.infer<typeof codexChatMessageZodSchemaInsert>

export const ibmCodexChatMessageKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'threadId',
  'externalThreadId',
  'role',
  'text',
  'turnId',
  'itemId',
  'messageAt',
  'seq',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmCodexChatMessage)[]

type _VerifyKeys = EnsureAllKeys<IbmCodexChatMessage, typeof ibmCodexChatMessageKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmCodexChatMessageMlgKeys = DotNestedMlgKeys<IbmCodexChatMessage>

export const bmCodexChatMessageMlgFields = mlgFieldsOf<IbmCodexChatMessage>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmCodexChatMessage, typeof bmCodexChatMessageMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
