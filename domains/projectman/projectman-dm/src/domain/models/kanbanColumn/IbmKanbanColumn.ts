import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { kanbanColumnZodSchema, kanbanColumnZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmKanbanColumn = z.infer<typeof kanbanColumnZodSchema>
export type IbmKanbanColumnInsert = z.infer<typeof kanbanColumnZodSchemaInsert>

export const ibmKanbanColumnKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'name',
  'slug',
  'description',
  'wipLimit',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmKanbanColumn)[]

type _VerifyKeys = EnsureAllKeys<IbmKanbanColumn, typeof ibmKanbanColumnKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmKanbanColumnMlgKeys = DotNestedMlgKeys<IbmKanbanColumn>

export const bmKanbanColumnMlgFields = mlgFieldsOf<IbmKanbanColumn>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmKanbanColumn, typeof bmKanbanColumnMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
