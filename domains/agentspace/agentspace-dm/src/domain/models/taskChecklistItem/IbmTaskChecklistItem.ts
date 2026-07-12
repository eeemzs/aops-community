import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { taskChecklistItemZodSchema, taskChecklistItemZodSchemaInsert } from './zod.schema.js'

export type IbmTaskChecklistItem = z.infer<typeof taskChecklistItemZodSchema>
export type IbmTaskChecklistItemInsert = z.infer<typeof taskChecklistItemZodSchemaInsert>

export const ibmTaskChecklistItemKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'taskId',
  'content',
  'isDone',
  'position',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmTaskChecklistItem)[]

type _VerifyKeys = EnsureAllKeys<IbmTaskChecklistItem, typeof ibmTaskChecklistItemKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmTaskChecklistItemMlgKeys = DotNestedMlgKeys<IbmTaskChecklistItem>
export const bmTaskChecklistItemMlgFields = mlgFieldsOf<IbmTaskChecklistItem>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmTaskChecklistItem, typeof bmTaskChecklistItemMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
