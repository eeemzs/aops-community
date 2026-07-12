import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { chatRoomZodSchema, chatRoomZodSchemaInsert } from './zod.schema.js'

export type IbmChatRoom = z.infer<typeof chatRoomZodSchema>
export type IbmChatRoomInsert = z.infer<typeof chatRoomZodSchemaInsert>

export const ibmChatRoomKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'projectId',
  'slug',
  'title',
  'kind',
  'purpose',
  'guidanceMarkdown',
  'status',
  'dmKey',
  'lastSeq',
  'lastMessageAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmChatRoom)[]

type _VerifyKeys = EnsureAllKeys<IbmChatRoom, typeof ibmChatRoomKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmChatRoomMlgKeys = DotNestedMlgKeys<IbmChatRoom>

export const bmChatRoomMlgFields = mlgFieldsOf<IbmChatRoom>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmChatRoom, typeof bmChatRoomMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
