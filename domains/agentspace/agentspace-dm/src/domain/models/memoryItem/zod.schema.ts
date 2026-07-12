import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { MEMORY_ITEM_DURABILITIES, MEMORY_ITEM_KINDS, scopeableFields } from '../../types.js'
import { IMemoryItemZodCtx } from './resources.js'

export const memoryItemZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeableFields,
    kind: z.enum(MEMORY_ITEM_KINDS),
    durability: z.enum(MEMORY_ITEM_DURABILITIES),
    content: z.string(),
    tags: z.array(z.string()).optional(),
    importance: z.number().int().min(0).optional(),
    sourceType: z.string().optional(),
    sourceId: z.string().optional(),
    meta: z.unknown().optional(),
  })

/* Insert schema */
export const memoryItemZodSchemaInsert = memoryItemZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createMemoryItemZodSchemaWithContext = (ctx?: IMemoryItemZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return memoryItemZodSchema.strict()
}
