import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { agentProfileZodSchema, agentProfileZodSchemaInsert } from './zod.schema.js'

export type IbmAgentProfile = z.infer<typeof agentProfileZodSchema>
export type IbmAgentProfileInsert = z.infer<typeof agentProfileZodSchemaInsert>

export const ibmAgentProfileKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'projectId',
  'slug',
  'name',
  'role',
  'version',
  'kind',
  'defaultAgents',
  'capabilities',
  'allowedSurfaces',
  'requiresApprovalFor',
  'promptRef',
  'skillRefs',
  'resourceRefs',
  'overlayRefs',
  'additionalContextRefs',
  'body',
  'tags',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmAgentProfile)[]

type _VerifyKeys = EnsureAllKeys<IbmAgentProfile, typeof ibmAgentProfileKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmAgentProfileMlgKeys = DotNestedMlgKeys<IbmAgentProfile>

export const bmAgentProfileMlgFields = mlgFieldsOf<IbmAgentProfile>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmAgentProfile, typeof bmAgentProfileMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
