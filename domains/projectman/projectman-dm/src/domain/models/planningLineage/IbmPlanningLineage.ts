import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { planningLineageZodSchema, planningLineageZodSchemaInsert } from './zod.schema.js'

export type IbmPlanningLineage = z.infer<typeof planningLineageZodSchema>
export type IbmPlanningLineageInsert = z.infer<typeof planningLineageZodSchemaInsert>

export const ibmPlanningLineageKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'projectId',
  'operation',
  'sourceType',
  'sourceId',
  'targetType',
  'targetId',
  'copyDepth',
  'sourceProjectId',
  'targetProjectId',
  'details',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmPlanningLineage)[]

type _VerifyKeys = EnsureAllKeys<IbmPlanningLineage, typeof ibmPlanningLineageKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmPlanningLineageMlgKeys = DotNestedMlgKeys<IbmPlanningLineage>

export const bmPlanningLineageMlgFields = mlgFieldsOf<IbmPlanningLineage>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmPlanningLineage, typeof bmPlanningLineageMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
