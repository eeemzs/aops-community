import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import type { ZodType } from 'zod'
import { IbmPlanningLineage } from './IbmPlanningLineage.js'
import {
  IPlanningLineageMlgTags,
  IPlanningLineageZodCtx,
  planningLineageResources,
} from './resources.js'
import { createPlanningLineageZodSchemaWithContext } from './zod.schema.js'
import { bmPlanningLineageMlgFields } from './IbmPlanningLineage.js'

export class BmPlanningLineage extends BmBase<IbmPlanningLineage, IPlanningLineageMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmPlanningLineage> = bmPlanningLineageMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmPlanningLineage>) {
    super({ data, locale, fallbackLocale, logger }, planningLineageResources)
  }

  public buildSchemas(zodCtx: IPlanningLineageZodCtx): Record<string, ZodType> {
    return {
      default: createPlanningLineageZodSchemaWithContext(zodCtx),
    }
  }
}
