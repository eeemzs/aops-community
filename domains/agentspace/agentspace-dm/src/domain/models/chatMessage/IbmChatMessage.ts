import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { chatMessageZodSchema, chatMessageZodSchemaInsert } from './zod.schema.js'

export type IbmChatMessage = z.infer<typeof chatMessageZodSchema>
export type IbmChatMessageInsert = z.infer<typeof chatMessageZodSchemaInsert>

export const ibmChatMessageKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'roomId',
  'seq',
  'authorAgentId',
  'kind',
  'text',
  'mentions',
  'replyToSeq',
  'idempotencyKey',
  'createdBy',
] as const satisfies readonly (keyof IbmChatMessage)[]

type _VerifyKeys = EnsureAllKeys<IbmChatMessage, typeof ibmChatMessageKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmChatMessageMlgKeys = DotNestedMlgKeys<IbmChatMessage>

export const bmChatMessageMlgFields = mlgFieldsOf<IbmChatMessage>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmChatMessage, typeof bmChatMessageMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
