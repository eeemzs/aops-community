import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmProjectmanEvent } from './IbmProjectmanEvent.js'
import type { ZodType } from 'zod'
import { IProjectmanEventMlgTags, IProjectmanEventZodCtx, projectmanEventResources } from './resources.js'
import { createProjectmanEventZodSchemaWithContext } from './zod.schema.js'
import { bmProjectmanEventMlgFields } from './IbmProjectmanEvent.js'

export class BmProjectmanEvent extends BmBase<IbmProjectmanEvent, IProjectmanEventMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmProjectmanEvent> = bmProjectmanEventMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmProjectmanEvent>) {
    super({ data, locale, fallbackLocale, logger }, projectmanEventResources)
  }

  public buildSchemas(zodCtx: IProjectmanEventZodCtx): Record<string, ZodType> {
    return {
      default: createProjectmanEventZodSchemaWithContext(zodCtx),
    }
  }
}
