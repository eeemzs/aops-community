import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { missionZodSchema, missionZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmMission = z.infer<typeof missionZodSchema>
export type IbmMissionInsert = z.infer<typeof missionZodSchemaInsert>

export const ibmMissionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'slug',
  'status',
  'objective',
  'taskDefinition',
  'successCriteria',
  'constraints',
  'policy',
  'roles',
  'references',
  'visionDocRef',
  'activeImplementationPlanRef',
  'lineage',
  'sourceTemplateRef',
  'bodyMarkdown',
  'createdBy',
  'updatedBy',
  'meta',
] as const satisfies readonly (keyof IbmMission)[]

type _VerifyKeys = EnsureAllKeys<IbmMission, typeof ibmMissionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmMissionMlgKeys = DotNestedMlgKeys<IbmMission>

export const bmMissionMlgFields = mlgFieldsOf<IbmMission>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmMission, typeof bmMissionMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
