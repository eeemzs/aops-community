import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { workflowDefinitionZodSchema, workflowDefinitionZodSchemaInsert } from './zod.schema.js'

export type IbmWorkflowDefinition = z.infer<typeof workflowDefinitionZodSchema>
export type IbmWorkflowDefinitionInsert = z.infer<typeof workflowDefinitionZodSchemaInsert>

export const ibmWorkflowDefinitionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'definitionId',
  'name',
  'mode',
  'subjectType',
  'runtimeProfile',
  'steps',
  'policies',
  'meta',
] as const satisfies readonly (keyof IbmWorkflowDefinition)[]

type _VerifyKeys = EnsureAllKeys<IbmWorkflowDefinition, typeof ibmWorkflowDefinitionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmWorkflowDefinitionMlgKeys = DotNestedMlgKeys<IbmWorkflowDefinition>

export const bmWorkflowDefinitionMlgFields = mlgFieldsOf<IbmWorkflowDefinition>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmWorkflowDefinition, typeof bmWorkflowDefinitionMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
