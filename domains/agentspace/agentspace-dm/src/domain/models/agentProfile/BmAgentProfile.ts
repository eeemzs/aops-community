import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmAgentProfile, bmAgentProfileMlgFields } from './IbmAgentProfile.js'
import { IAgentProfileMlgTags, IAgentProfileZodCtx, agentProfileResources } from './resources.js'
import { createAgentProfileZodSchemaWithContext } from './zod.schema.js'

export class BmAgentProfile extends BmBase<IbmAgentProfile, IAgentProfileMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmAgentProfile> = bmAgentProfileMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmAgentProfile>) {
    super({ data, locale, fallbackLocale, logger }, agentProfileResources)
  }

  public buildSchemas(zodCtx: IAgentProfileZodCtx) {
    return {
      default: createAgentProfileZodSchemaWithContext(zodCtx),
    }
  }
}
