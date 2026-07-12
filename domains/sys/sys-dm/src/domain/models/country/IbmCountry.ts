import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { countryZodSchema, countryZodSchemaInsert } from './zod.schema.js'

export type IbmCountry = z.infer<typeof countryZodSchema>
export type IbmCountryInsert = z.infer<typeof countryZodSchemaInsert>

export const ibmCountryKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'iso2Code',
  'name',
  'phoneCode',
  'suggested',
] as const satisfies readonly (keyof IbmCountry)[]

type _VerifyKeys = EnsureAllKeys<IbmCountry, typeof ibmCountryKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmCountryMlgKeys = DotNestedMlgKeys<IbmCountry>

export const bmCountryMlgFields = mlgFieldsOf<IbmCountry>()()

type _VerifyMlgFields = EnsureExactMlgKeys<IbmCountry, typeof bmCountryMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
