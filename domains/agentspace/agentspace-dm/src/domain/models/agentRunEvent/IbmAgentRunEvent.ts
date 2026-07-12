import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { agentRunEventZodSchema, agentRunEventZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmAgentRunEvent = z.infer<typeof agentRunEventZodSchema>
export type IbmAgentRunEventInsert = z.infer<typeof agentRunEventZodSchemaInsert>

export const ibmAgentRunEventKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'agentRunId',
  'runId',
  'eventId',
  'sequence',
  'eventType',
  'status',
  'payload',
  'meta',
  'emittedAt',
] as const satisfies readonly (keyof IbmAgentRunEvent)[]

type _VerifyKeys = EnsureAllKeys<IbmAgentRunEvent, typeof ibmAgentRunEventKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmAgentRunEventMlgKeys = DotNestedMlgKeys<IbmAgentRunEvent>

export const bmAgentRunEventMlgFields = mlgFieldsOf<IbmAgentRunEvent>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmAgentRunEvent, typeof bmAgentRunEventMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
