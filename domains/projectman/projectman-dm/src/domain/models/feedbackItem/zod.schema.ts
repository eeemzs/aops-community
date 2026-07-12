import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { FEEDBACK_SOURCES, FEEDBACK_SEVERITIES, FEEDBACK_STATUSES, FEEDBACK_TYPES } from '../../types.js'
import { IFeedbackItemZodCtx } from './resources.js'

export const feedbackItemZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    sprintId: z.string().nullable().optional(),
    kanbanTaskId: z.string().nullable().optional(),
    microTaskItemId: z.string().nullable().optional(),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(FEEDBACK_STATUSES),
    type: z.enum(FEEDBACK_TYPES),
    severity: z.enum(FEEDBACK_SEVERITIES),
    source: z.enum(FEEDBACK_SOURCES),
    tags: z.array(z.string()).optional(),
    suggestion: z.string().optional(),
    notes: z.string().optional(),
    meta: z.unknown().optional(),
    recordedAt: z.date().optional(),
    handledAt: z.date().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const feedbackItemZodSchemaInsert = feedbackItemZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createFeedbackItemZodSchemaWithContext = (_ctx?: IFeedbackItemZodCtx) => {
  return feedbackItemZodSchema.strict()
}
