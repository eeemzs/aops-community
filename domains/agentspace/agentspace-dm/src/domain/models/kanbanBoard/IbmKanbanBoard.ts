import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { kanbanBoardZodSchema, kanbanBoardZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmKanbanBoard = z.infer<typeof kanbanBoardZodSchema>
export type IbmKanbanBoardInsert = z.infer<typeof kanbanBoardZodSchemaInsert>

export const ibmKanbanBoardKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'name',
  'description',
] as const satisfies readonly (keyof IbmKanbanBoard)[]

type _VerifyKeys = EnsureAllKeys<IbmKanbanBoard, typeof ibmKanbanBoardKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmKanbanBoardMlgKeys = DotNestedMlgKeys<IbmKanbanBoard>

export const bmKanbanBoardMlgFields = mlgFieldsOf<IbmKanbanBoard>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmKanbanBoard, typeof bmKanbanBoardMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
