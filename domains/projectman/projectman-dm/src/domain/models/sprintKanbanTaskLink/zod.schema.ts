import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ISprintKanbanTaskLinkZodCtx } from './resources.js'

export const sprintKanbanTaskLinkZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    projectId: z.string(),
    sprintId: z.string(),
    kanbanTaskId: z.string(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const sprintKanbanTaskLinkZodSchemaInsert = sprintKanbanTaskLinkZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createSprintKanbanTaskLinkZodSchemaWithContext = (_ctx?: ISprintKanbanTaskLinkZodCtx) => {
  return sprintKanbanTaskLinkZodSchema.strict()
}
