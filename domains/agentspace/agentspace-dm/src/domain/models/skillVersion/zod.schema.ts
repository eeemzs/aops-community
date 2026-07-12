import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { SKILL_VERSION_STATUSES } from '../../types.js'
import { ISkillVersionZodCtx } from './resources.js'

export const skillVersionFileZodSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  kind: z.string().optional(),
  encoding: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().min(0).optional(),
  sha256: z.string().optional(),
})

export const skillVersionZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    projectId: z.string(),
    skillId: z.string(),
    version: z.number().int().min(1),
    status: z.enum(SKILL_VERSION_STATUSES),
    content: z.string(),
    entryFile: z.string().optional(),
    skillStandard: z.string().optional(),
    files: z.array(skillVersionFileZodSchema).optional(),
    meta: z.unknown().optional(),
    refType: z.string().optional(),
    refId: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
    publishedAt: z.date().optional(),
  })

/* Insert schema */
export const skillVersionZodSchemaInsert = skillVersionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createSkillVersionZodSchemaWithContext = (ctx?: ISkillVersionZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return skillVersionZodSchema.strict()
}
