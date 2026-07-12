import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { discussionOutputZodSchema, discussionOutputZodSchemaInsert } from './zod.schema.js'

export type IbmDiscussionOutput = z.infer<typeof discussionOutputZodSchema>
export type IbmDiscussionOutputInsert = z.infer<typeof discussionOutputZodSchemaInsert>

export const ibmDiscussionOutputKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'topicId',
  'outputKind',
  'ownerAgentId',
  'content',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmDiscussionOutput)[]

type _VerifyKeys = EnsureAllKeys<IbmDiscussionOutput, typeof ibmDiscussionOutputKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmDiscussionOutputMlgKeys = DotNestedMlgKeys<IbmDiscussionOutput>

export const bmDiscussionOutputMlgFields = mlgFieldsOf<IbmDiscussionOutput>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmDiscussionOutput, typeof bmDiscussionOutputMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
