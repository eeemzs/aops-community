import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { REVIEW_REQUEST_OUTCOMES, REVIEW_REQUEST_PRIORITIES, REVIEW_REQUEST_SOURCES, REVIEW_REQUEST_STATUSES } from '../../types.js'
import { IReviewRequestZodCtx } from './resources.js'

export const reviewRequestResultZodSchema = z
  .object({
    id: z.string(),
    reviewer: z.string(),
    outcome: z.enum(REVIEW_REQUEST_OUTCOMES),
    summary: z.string(),
    positives: z.array(z.string()).optional(),
    concerns: z.array(z.string()).optional(),
    objections: z.array(z.string()).optional(),
    references: z.array(z.string()).optional(),
    issueIds: z.array(z.string()).optional(),
    basedOnSeqRange: z.object({ from: z.number(), to: z.number() }).optional(),
    collabResultEventId: z.string().optional(),
    idempotencyKey: z.string().optional(),
    meta: z.unknown().optional(),
    createdAt: z.date(),
  })
  .strict()

export const reviewRequestZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    sprintId: z.string().nullable().optional(),
    kanbanTaskId: z.string().nullable().optional(),
    microTaskItemId: z.string().nullable().optional(),
    collabSessionId: z.string().nullable().optional(),
    collabRequestEventId: z.string().nullable().optional(),
    collabResultEventIds: z.array(z.string()).optional(),
    parentReviewRequestId: z.string().nullable().optional(),
    rootReviewRequestId: z.string().nullable().optional(),
    title: z.string(),
    description: z.string().optional(),
    reviewScope: z.string().optional(),
    instructions: z.string().optional(),
    references: z.array(z.string()).optional(),
    status: z.enum(REVIEW_REQUEST_STATUSES),
    priority: z.enum(REVIEW_REQUEST_PRIORITIES),
    source: z.enum(REVIEW_REQUEST_SOURCES),
    tags: z.array(z.string()).optional(),
    requestedBy: z.string().optional(),
    targetAgent: z.string().optional(),
    targetSlot: z.string().optional(),
    results: z.array(reviewRequestResultZodSchema).optional(),
    idempotencyKey: z.string().optional(),
    notes: z.string().optional(),
    meta: z.unknown().optional(),
    requestedAt: z.date().optional(),
    closedAt: z.date().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const reviewRequestZodSchemaInsert = reviewRequestZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

export const createReviewRequestZodSchemaWithContext = (_ctx?: IReviewRequestZodCtx) => {
  return reviewRequestZodSchema.strict()
}
