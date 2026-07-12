import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { agentSessionZodSchema, agentSessionZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmAgentSession = z.infer<typeof agentSessionZodSchema>
export type IbmAgentSessionInsert = z.infer<typeof agentSessionZodSchemaInsert>

export const ibmAgentSessionKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'missionId',
  'sessionId',
  'agent',
  'profile',
  'model',
  'status',
  'startedAt',
  'endedAt',
] as const satisfies readonly (keyof IbmAgentSession)[]

type _VerifyKeys = EnsureAllKeys<IbmAgentSession, typeof ibmAgentSessionKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmAgentSessionMlgKeys = DotNestedMlgKeys<IbmAgentSession>

export const bmAgentSessionMlgFields = mlgFieldsOf<IbmAgentSession>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmAgentSession, typeof bmAgentSessionMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
