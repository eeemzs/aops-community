import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmCountry } from './IbmCountry.js'
import { ICountryMlgTags, ICountryZodCtx, countryResources } from './resources.js'
import { createCountryZodSchemaWithContext } from './zod.schema.js'
import { bmCountryMlgFields } from './IbmCountry.js'

export class BmCountry extends BmBase<IbmCountry, ICountryMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmCountry> = bmCountryMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmCountry>) {
    super({ data, locale, fallbackLocale, logger }, countryResources)
  }

  public buildSchemas(zodCtx: ICountryZodCtx) {
    return {
      default: createCountryZodSchemaWithContext(zodCtx),
    }
  }
}
