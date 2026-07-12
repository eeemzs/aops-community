import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { MISSION_STATUSES, scopeableFields } from '../../types.js'
import { IMissionZodCtx } from './resources.js'

export const missionRefZodSchema = z.object({
  refType: z.string().optional(),
  refId: z.string().optional(),
  uri: z.string().optional(),
  title: z.string().optional(),
  note: z.string().optional(),
}).strict()

export const missionLineageZodSchema = z.object({
  parentMissionId: z.string().optional(),
}).strict()

export const missionZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeableFields,
    slug: z.string().optional(),
    status: z.enum(MISSION_STATUSES),
    objective: z.string(),
    taskDefinition: z.string().optional(),
    successCriteria: z.array(z.string()).optional(),
    constraints: z.array(z.string()).optional(),
    policy: z.record(z.string(), z.unknown()).optional(),
    roles: z.record(z.string(), z.unknown()).optional(),
    references: z.array(missionRefZodSchema).optional(),
    visionDocRef: missionRefZodSchema.optional(),
    activeImplementationPlanRef: missionRefZodSchema.optional(),
    lineage: missionLineageZodSchema.optional(),
    sourceTemplateRef: missionRefZodSchema.optional(),
    bodyMarkdown: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
    meta: z.unknown().optional(),
  })

/* Insert schema */
export const missionZodSchemaInsert = missionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).extend({
  status: z.enum(MISSION_STATUSES).optional(),
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createMissionZodSchemaWithContext = (_ctx?: IMissionZodCtx) => {
  return missionZodSchema.strict()
}
