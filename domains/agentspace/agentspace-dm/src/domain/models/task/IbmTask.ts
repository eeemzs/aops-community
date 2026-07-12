import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { taskZodSchema, taskZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmTask = z.infer<typeof taskZodSchema>
export type IbmTaskInsert = z.infer<typeof taskZodSchemaInsert>

export const ibmTaskKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'columnId',
  'sprintId',
  'promptVersionId',
  'parentTaskId',
  'type',
  'title',
  'description',
  'input',
  'meta',
  'assignee',
  'position',
  'priority',
  'dueAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmTask)[]

type _VerifyKeys = EnsureAllKeys<IbmTask, typeof ibmTaskKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmTaskMlgKeys = DotNestedMlgKeys<IbmTask>

export const bmTaskMlgFields = mlgFieldsOf<IbmTask>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmTask, typeof bmTaskMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
