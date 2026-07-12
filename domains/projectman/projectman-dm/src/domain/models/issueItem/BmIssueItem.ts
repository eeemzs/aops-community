import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmIssueItem } from './IbmIssueItem.js'
import type { ZodType } from 'zod'
import { IIssueItemMlgTags, IIssueItemZodCtx, issueItemResources } from './resources.js'
import { createIssueItemZodSchemaWithContext } from './zod.schema.js'
import { bmIssueItemMlgFields } from './IbmIssueItem.js'

export class BmIssueItem extends BmBase<IbmIssueItem, IIssueItemMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmIssueItem> = bmIssueItemMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmIssueItem>) {
    super({ data, locale, fallbackLocale, logger }, issueItemResources)
  }

  public buildSchemas(zodCtx: IIssueItemZodCtx): Record<string, ZodType> {
    return {
      default: createIssueItemZodSchemaWithContext(zodCtx),
    }
  }
}
