import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { historyZodSchema, historyZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmHistory = z.infer<typeof historyZodSchema>
export type IbmHistoryInsert = z.infer<typeof historyZodSchemaInsert>

export const ibmHistoryKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'projectId',
  'boardId',
  'slug',
  'name',
  'description',
  'status',
  'tags',
  'meta',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmHistory)[]

type _VerifyKeys = EnsureAllKeys<IbmHistory, typeof ibmHistoryKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmHistoryMlgKeys = DotNestedMlgKeys<IbmHistory>

export const bmHistoryMlgFields = mlgFieldsOf<IbmHistory>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmHistory, typeof bmHistoryMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
