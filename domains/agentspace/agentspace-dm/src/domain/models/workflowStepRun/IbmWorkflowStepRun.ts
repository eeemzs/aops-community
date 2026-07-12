import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { workflowStepRunZodSchema, workflowStepRunZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmWorkflowStepRun = z.infer<typeof workflowStepRunZodSchema>
export type IbmWorkflowStepRunInsert = z.infer<typeof workflowStepRunZodSchemaInsert>

export const ibmWorkflowStepRunKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'workflowId',
  'workflowInstanceId',
  'stepId',
  'sequence',
  'kind',
  'title',
  'status',
  'agentRunId',
  'approvalId',
  'childWorkflowId',
  'childWorkflowInstanceId',
  'input',
  'approval',
  'error',
  'meta',
  'openedAt',
  'closedAt',
] as const satisfies readonly (keyof IbmWorkflowStepRun)[]

type _VerifyKeys = EnsureAllKeys<IbmWorkflowStepRun, typeof ibmWorkflowStepRunKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmWorkflowStepRunMlgKeys = DotNestedMlgKeys<IbmWorkflowStepRun>

export const bmWorkflowStepRunMlgFields = mlgFieldsOf<IbmWorkflowStepRun>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmWorkflowStepRun, typeof bmWorkflowStepRunMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
