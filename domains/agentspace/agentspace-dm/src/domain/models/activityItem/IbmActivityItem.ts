import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { activityItemZodSchema, activityItemZodSchemaInsert } from './zod.schema.js'

export type IbmActivityItem = z.infer<typeof activityItemZodSchema>
export type IbmActivityItemInsert = z.infer<typeof activityItemZodSchemaInsert>

export const ibmActivityItemKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'projectId',
  'sourceKind',
  'sourceId',
  'action',
  'status',
  'summary',
  'refs',
  'payload',
  'meta',
] as const satisfies readonly (keyof IbmActivityItem)[]

type _VerifyKeys = EnsureAllKeys<IbmActivityItem, typeof ibmActivityItemKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmActivityItemMlgKeys = DotNestedMlgKeys<IbmActivityItem>

export const bmActivityItemMlgFields = mlgFieldsOf<IbmActivityItem>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmActivityItem, typeof bmActivityItemMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
