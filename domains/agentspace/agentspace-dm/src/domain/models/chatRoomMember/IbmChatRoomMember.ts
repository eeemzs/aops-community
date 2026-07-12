import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { chatRoomMemberZodSchema, chatRoomMemberZodSchemaInsert } from './zod.schema.js'

export type IbmChatRoomMember = z.infer<typeof chatRoomMemberZodSchema>
export type IbmChatRoomMemberInsert = z.infer<typeof chatRoomMemberZodSchemaInsert>

export const ibmChatRoomMemberKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'roomId',
  'agentId',
  'roleKey',
  'brief',
  'status',
  'lastReadSeq',
  'joinedAt',
  'leftAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmChatRoomMember)[]

type _VerifyKeys = EnsureAllKeys<IbmChatRoomMember, typeof ibmChatRoomMemberKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmChatRoomMemberMlgKeys = DotNestedMlgKeys<IbmChatRoomMember>

export const bmChatRoomMemberMlgFields = mlgFieldsOf<IbmChatRoomMember>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmChatRoomMember, typeof bmChatRoomMemberMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
