import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { EXPERIENCE_ITEM_TYPES, scopeableFields } from '../../types.js'
import { IExperienceItemZodCtx } from './resources.js'

export const experienceItemZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeableFields,
    type: z.enum(EXPERIENCE_ITEM_TYPES),
    title: z.string(),
    problem: z.string().optional(),
    solution: z.string().optional(),
    content: z.string(),
    areas: z.array(z.string()).optional(),
    stack: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    sourceRefs: z.array(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    confidence: z.string().optional(),
    reusability: z.string().optional(),
    meta: z.unknown().optional(),
  })

export const experienceItemZodSchemaInsert = experienceItemZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

export const createExperienceItemZodSchemaWithContext = (_ctx?: IExperienceItemZodCtx) => {
  return experienceItemZodSchema.strict()
}
