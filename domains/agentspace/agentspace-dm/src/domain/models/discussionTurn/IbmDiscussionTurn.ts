import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { discussionTurnZodSchema, discussionTurnZodSchemaInsert } from './zod.schema.js'

export type IbmDiscussionTurn = z.infer<typeof discussionTurnZodSchema>
export type IbmDiscussionTurnInsert = z.infer<typeof discussionTurnZodSchemaInsert>

export const ibmDiscussionTurnKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'topicId',
  'seq',
  'agentId',
  'kind',
  'text',
  'addressedTo',
  'replyToSeq',
  'idempotencyKey',
  'createdBy',
] as const satisfies readonly (keyof IbmDiscussionTurn)[]

type _VerifyKeys = EnsureAllKeys<IbmDiscussionTurn, typeof ibmDiscussionTurnKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmDiscussionTurnMlgKeys = DotNestedMlgKeys<IbmDiscussionTurn>

export const bmDiscussionTurnMlgFields = mlgFieldsOf<IbmDiscussionTurn>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmDiscussionTurn, typeof bmDiscussionTurnMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
