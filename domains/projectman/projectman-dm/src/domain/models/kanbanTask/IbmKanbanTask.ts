import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { kanbanTaskZodSchema, kanbanTaskZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmKanbanTask = z.infer<typeof kanbanTaskZodSchema>
export type IbmKanbanTaskInsert = z.infer<typeof kanbanTaskZodSchemaInsert>

export const ibmKanbanTaskKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'boardId',
  'boardColumnId',
  'sprintId',
  'title',
  'taskCode',
  'slug',
  'description',
  'progress',
  'position',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmKanbanTask)[]

type _VerifyKeys = EnsureAllKeys<IbmKanbanTask, typeof ibmKanbanTaskKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmKanbanTaskMlgKeys = DotNestedMlgKeys<IbmKanbanTask>

export const bmKanbanTaskMlgFields = mlgFieldsOf<IbmKanbanTask>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmKanbanTask, typeof bmKanbanTaskMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
