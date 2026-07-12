import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmMemoryItem } from './IbmMemoryItem.js'
import { IMemoryItemMlgTags, IMemoryItemZodCtx, memoryItemResources } from './resources.js'
import { createMemoryItemZodSchemaWithContext } from './zod.schema.js'
import { bmMemoryItemMlgFields } from './IbmMemoryItem.js'

export class BmMemoryItem extends BmBase<IbmMemoryItem, IMemoryItemMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmMemoryItem> = bmMemoryItemMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmMemoryItem>) {
    super({ data, locale, fallbackLocale, logger }, memoryItemResources)
  }

  public buildSchemas(zodCtx: IMemoryItemZodCtx) {
    return {
      default: createMemoryItemZodSchemaWithContext(zodCtx),
    }
  }
}

