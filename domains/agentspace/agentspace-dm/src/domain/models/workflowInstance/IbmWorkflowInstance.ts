import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { workflowInstanceZodSchema, workflowInstanceZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmWorkflowInstance = z.infer<typeof workflowInstanceZodSchema>
export type IbmWorkflowInstanceInsert = z.infer<typeof workflowInstanceZodSchemaInsert>

export const ibmWorkflowInstanceKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'workflowInstanceId',
  'definitionId',
  'mode',
  'status',
  'subjectType',
  'subjectId',
  'subjectLabel',
  'subjectMeta',
  'input',
  'currentStepId',
  'activeApprovalId',
  'runtimeProfile',
  'runRecordIds',
  'steps',
  'definitionSnapshot',
  'meta',
  'openedAt',
  'closedAt',
] as const satisfies readonly (keyof IbmWorkflowInstance)[]

type _VerifyKeys = EnsureAllKeys<IbmWorkflowInstance, typeof ibmWorkflowInstanceKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmWorkflowInstanceMlgKeys = DotNestedMlgKeys<IbmWorkflowInstance>

export const bmWorkflowInstanceMlgFields = mlgFieldsOf<IbmWorkflowInstance>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmWorkflowInstance, typeof bmWorkflowInstanceMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
