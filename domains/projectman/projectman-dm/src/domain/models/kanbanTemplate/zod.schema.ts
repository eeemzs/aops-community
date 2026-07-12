import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IKanbanTemplateZodCtx } from './resources.js'

export const kanbanTemplateColumnSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  wipLimit: z.number().int().min(0).optional(),
  position: z.number().int().min(0).optional(),
})

export const kanbanTemplateBoardSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  position: z.number().int().min(0).optional(),
  columns: z.array(kanbanTemplateColumnSchema).min(1),
})

export const kanbanTemplateDefinitionSchema = z.object({
  boards: z.array(kanbanTemplateBoardSchema).min(1),
})

export const kanbanTemplateZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    definition: kanbanTemplateDefinitionSchema,
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const kanbanTemplateZodSchemaInsert = kanbanTemplateZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createKanbanTemplateZodSchemaWithContext = (_ctx?: IKanbanTemplateZodCtx) => {
  return kanbanTemplateZodSchema.strict()
}
