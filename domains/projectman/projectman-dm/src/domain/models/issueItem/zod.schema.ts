import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ISSUE_SOURCES, ISSUE_SEVERITIES, ISSUE_STATUSES } from '../../types.js'
import { IIssueItemZodCtx } from './resources.js'

export const issueItemZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    sprintId: z.string().nullable().optional(),
    kanbanTaskId: z.string().nullable().optional(),
    microTaskItemId: z.string().nullable().optional(),
    reviewRequestId: z.string().nullable().optional(),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(ISSUE_STATUSES),
    severity: z.enum(ISSUE_SEVERITIES),
    source: z.enum(ISSUE_SOURCES),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
    meta: z.unknown().optional(),
    openedAt: z.date().optional(),
    resolvedAt: z.date().nullable().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const issueItemZodSchemaInsert = issueItemZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createIssueItemZodSchemaWithContext = (_ctx?: IIssueItemZodCtx) => {
  return issueItemZodSchema.strict()
}
