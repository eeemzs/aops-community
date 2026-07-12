import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { issueItemZodSchema, issueItemZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmIssueItem = z.infer<typeof issueItemZodSchema>
export type IbmIssueItemInsert = z.infer<typeof issueItemZodSchemaInsert>

export const ibmIssueItemKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'sprintId',
  'kanbanTaskId',
  'microTaskItemId',
  'reviewRequestId',
  'title',
  'description',
  'status',
  'severity',
  'source',
  'tags',
  'notes',
  'meta',
  'openedAt',
  'resolvedAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmIssueItem)[]

type _VerifyKeys = EnsureAllKeys<IbmIssueItem, typeof ibmIssueItemKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmIssueItemMlgKeys = DotNestedMlgKeys<IbmIssueItem>

export const bmIssueItemMlgFields = mlgFieldsOf<IbmIssueItem>()(
  // add more nested fields as needed, e.g. 'options.option_name'
)

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmIssueItem, typeof bmIssueItemMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
