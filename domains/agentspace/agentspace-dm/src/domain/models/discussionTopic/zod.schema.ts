import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { DISCUSSION_BLOCKED_ON, DISCUSSION_LINEAGE_KINDS, DISCUSSION_TOPIC_STATUSES } from '../../types.js'
import { IDiscussionTopicZodCtx } from './resources.js'

export const discussionTopicRulesSchema = z
  .object({
    turnOrder: z.array(z.string()).optional(),
    minTurnsBeforeConclude: z.number().int().min(0).optional(),
    requireQuestionAnswer: z.boolean().optional(),
  })
  .strict()

export const discussionTopicZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  projectId: z.string().optional(),
  parentTopicId: z.string().optional(),
  lineageKind: z.enum(DISCUSSION_LINEAGE_KINDS).optional(),
  referencedOutputs: z.array(z.string()).optional(),
  referencedTurnRefs: z.array(z.string()).optional(),
  referencedMemoryRefs: z.array(z.string()).optional(),
  abandonReason: z.string().optional(),
  slug: z.string(),
  title: z.string(),
  question: z.string(),
  participants: z.array(z.string()).optional(),
  initiatorAgentId: z.string(),
  status: z.enum(DISCUSSION_TOPIC_STATUSES),
  blockedOn: z.enum(DISCUSSION_BLOCKED_ON).optional(),
  blockingTurnSeq: z.number().int().min(1).optional(),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
  rules: discussionTopicRulesSchema.optional(),
  tags: z.array(z.string()).optional(),
  lastSeq: z.number().int().min(0),
  lastTurnAt: z.date().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

export const discussionTopicZodSchemaInsert = discussionTopicZodSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    tenantId: true,
  })
  .strict()

export const createDiscussionTopicZodSchemaWithContext = (_ctx?: IDiscussionTopicZodCtx) => {
  return discussionTopicZodSchema.strict()
}
