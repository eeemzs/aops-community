import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmMission } from './IbmMission.js'
import { IMissionMlgTags, IMissionZodCtx, missionResources } from './resources.js'
import { createMissionZodSchemaWithContext } from './zod.schema.js'
import { bmMissionMlgFields } from './IbmMission.js'

export class BmMission extends BmBase<IbmMission, IMissionMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmMission> = bmMissionMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmMission>) {
    super({ data, locale, fallbackLocale, logger }, missionResources)
  }

  public buildSchemas(zodCtx: IMissionZodCtx) {
    return {
      default: createMissionZodSchemaWithContext(zodCtx),
    }
  }
}
