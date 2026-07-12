import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { chatRoomBindingZodSchema, chatRoomBindingZodSchemaInsert } from './zod.schema.js'

export type IbmChatRoomBinding = z.infer<typeof chatRoomBindingZodSchema>
export type IbmChatRoomBindingInsert = z.infer<typeof chatRoomBindingZodSchemaInsert>

export const ibmChatRoomBindingKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'roomId',
  'bindingType',
  'refId',
  'uri',
  'title',
  'note',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmChatRoomBinding)[]

type _VerifyKeys = EnsureAllKeys<IbmChatRoomBinding, typeof ibmChatRoomBindingKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmChatRoomBindingMlgKeys = DotNestedMlgKeys<IbmChatRoomBinding>

export const bmChatRoomBindingMlgFields = mlgFieldsOf<IbmChatRoomBinding>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmChatRoomBinding, typeof bmChatRoomBindingMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
