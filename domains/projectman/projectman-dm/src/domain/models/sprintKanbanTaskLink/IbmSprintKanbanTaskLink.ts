import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { sprintKanbanTaskLinkZodSchema, sprintKanbanTaskLinkZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmSprintKanbanTaskLink = z.infer<typeof sprintKanbanTaskLinkZodSchema>
export type IbmSprintKanbanTaskLinkInsert = z.infer<typeof sprintKanbanTaskLinkZodSchemaInsert>

export const ibmSprintKanbanTaskLinkKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'projectId',
  'sprintId',
  'kanbanTaskId',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmSprintKanbanTaskLink)[]

type _VerifyKeys = EnsureAllKeys<IbmSprintKanbanTaskLink, typeof ibmSprintKanbanTaskLinkKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmSprintKanbanTaskLinkMlgKeys = DotNestedMlgKeys<IbmSprintKanbanTaskLink>

export const bmSprintKanbanTaskLinkMlgFields = mlgFieldsOf<IbmSprintKanbanTaskLink>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmSprintKanbanTaskLink, typeof bmSprintKanbanTaskLinkMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
