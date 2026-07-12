import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { discussionTopicZodSchema, discussionTopicZodSchemaInsert } from './zod.schema.js'

export type IbmDiscussionTopic = z.infer<typeof discussionTopicZodSchema>
export type IbmDiscussionTopicInsert = z.infer<typeof discussionTopicZodSchemaInsert>

export const ibmDiscussionTopicKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'projectId',
  'parentTopicId',
  'lineageKind',
  'referencedOutputs',
  'referencedTurnRefs',
  'referencedMemoryRefs',
  'abandonReason',
  'slug',
  'title',
  'question',
  'participants',
  'initiatorAgentId',
  'status',
  'blockedOn',
  'blockingTurnSeq',
  'subjectType',
  'subjectId',
  'rules',
  'tags',
  'lastSeq',
  'lastTurnAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmDiscussionTopic)[]

type _VerifyKeys = EnsureAllKeys<IbmDiscussionTopic, typeof ibmDiscussionTopicKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmDiscussionTopicMlgKeys = DotNestedMlgKeys<IbmDiscussionTopic>

export const bmDiscussionTopicMlgFields = mlgFieldsOf<IbmDiscussionTopic>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmDiscussionTopic, typeof bmDiscussionTopicMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
