import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { agentRunZodSchema, agentRunZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmAgentRun = z.infer<typeof agentRunZodSchema>
export type IbmAgentRunInsert = z.infer<typeof agentRunZodSchemaInsert>

export const ibmAgentRunKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'projectId',
  'agentSessionId',
  'taskId',
  'runId',
  'sessionId',
  'agent',
  'profile',
  'model',
  'outputFormat',
  'tokensUsed',
  'costUsd',
  'exitCode',
  'stdout',
  'stderr',
  'resultText',
  'meta',
  'startedAt',
  'endedAt',
  'durationMs',
] as const satisfies readonly (keyof IbmAgentRun)[]

type _VerifyKeys = EnsureAllKeys<IbmAgentRun, typeof ibmAgentRunKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmAgentRunMlgKeys = DotNestedMlgKeys<IbmAgentRun>

export const bmAgentRunMlgFields = mlgFieldsOf<IbmAgentRun>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmAgentRun, typeof bmAgentRunMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
