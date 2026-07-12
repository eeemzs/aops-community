import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { kanbanBoardColumnZodSchema, kanbanBoardColumnZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmKanbanBoardColumn = z.infer<typeof kanbanBoardColumnZodSchema>
export type IbmKanbanBoardColumnInsert = z.infer<typeof kanbanBoardColumnZodSchemaInsert>

export const ibmKanbanBoardColumnKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'boardId',
  'columnId',
  'position',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmKanbanBoardColumn)[]

type _VerifyKeys = EnsureAllKeys<IbmKanbanBoardColumn, typeof ibmKanbanBoardColumnKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmKanbanBoardColumnMlgKeys = DotNestedMlgKeys<IbmKanbanBoardColumn>

export const bmKanbanBoardColumnMlgFields = mlgFieldsOf<IbmKanbanBoardColumn>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmKanbanBoardColumn, typeof bmKanbanBoardColumnMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
