import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmHistory } from './IbmHistory.js'
import type { ZodType } from 'zod'
import { IHistoryMlgTags, IHistoryZodCtx, historyResources } from './resources.js'
import { createHistoryZodSchemaWithContext } from './zod.schema.js'
import { bmHistoryMlgFields } from './IbmHistory.js'

export class BmHistory extends BmBase<IbmHistory, IHistoryMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmHistory> = bmHistoryMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmHistory>) {
    super({ data, locale, fallbackLocale, logger }, historyResources)
  }

  public buildSchemas(zodCtx: IHistoryZodCtx): Record<string, ZodType> {
    return {
      default: createHistoryZodSchemaWithContext(zodCtx),
    }
  }
}
