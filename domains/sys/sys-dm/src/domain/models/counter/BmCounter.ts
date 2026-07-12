import { BmBase, type BmBaseConstructorParams } from '@aopslab/xf-bm'
import type { IbmCounter } from './IbmCounter.js'
import { counterResources, type ICounterMlgTags, type ICounterZodCtx } from './resources.js'
import { counterZodSchema } from './zod.schema.js'

export class BmCounter extends BmBase<IbmCounter, ICounterMlgTags> {
  public static mlgFields: Partial<keyof IbmCounter>[] = []

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmCounter>) {
    super({ data, locale, fallbackLocale, logger }, counterResources)
  }

  public buildSchemas(_zodCtx?: ICounterZodCtx) {
    return {
      default: counterZodSchema,
    }
  }
}
