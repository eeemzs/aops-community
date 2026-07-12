import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { PROJECT_MEMBER_ROLES } from '../../types.js'
import { IProjectMemberZodCtx } from './resources.js'

export const projectMemberZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    projectId: z.string(),
    userId: z.string(),
    role: z.enum(PROJECT_MEMBER_ROLES),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const projectMemberZodSchemaInsert = projectMemberZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createProjectMemberZodSchemaWithContext = (ctx?: IProjectMemberZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return projectMemberZodSchema.strict()
}
