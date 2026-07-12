import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { sprintItemZodSchema, sprintItemZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSprintItem = z.infer<typeof sprintItemZodSchema>
export type IbmSprintItemInsert = z.infer<typeof sprintItemZodSchemaInsert>

export const ibmSprintItemKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'sprintId',
  'title',
  'status',
  'position',
  'openedAt',
  'closedAt',
  'refType',
  'refId',
  'notes',
  'createdBy',
  'updatedBy',
  'meta',
] as const satisfies readonly (keyof IbmSprintItem)[]

type _VerifyKeys = EnsureAllKeys<IbmSprintItem, typeof ibmSprintItemKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmSprintItemMlgKeys = DotNestedMlgKeys<IbmSprintItem>

export const bmSprintItemMlgFields = mlgFieldsOf<IbmSprintItem>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmSprintItem, typeof bmSprintItemMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
