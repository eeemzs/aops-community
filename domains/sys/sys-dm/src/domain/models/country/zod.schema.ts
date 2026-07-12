import { z } from 'zod'
import { IbmZodSchema, omitZodShape } from '@aopslab/xf-bm'
import { ICountryZodCtx } from './resources.js'

export const countryZodSchema = z.object({
  ...IbmZodSchema.shape,
  iso2Code: z.string().trim().min(2).max(2),
  name: z.string().trim().min(1),
  phoneCode: z.string().trim().min(1),
  suggested: z.boolean().optional(),
})

export const countryZodSchemaInsert = z
  .object(
    omitZodShape(countryZodSchema.shape, ['id', 'createdAt', 'updatedAt', 'tenantId'])
  )
  .strict()

export const createCountryZodSchemaWithContext = (_ctx?: ICountryZodCtx) => {
  return countryZodSchema.strict()
}
