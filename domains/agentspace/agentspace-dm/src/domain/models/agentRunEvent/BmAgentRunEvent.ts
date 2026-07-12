import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmAgentRunEvent } from './IbmAgentRunEvent.js'
import { IAgentRunEventMlgTags, IAgentRunEventZodCtx, agentRunEventResources } from './resources.js'
import { createAgentRunEventZodSchemaWithContext } from './zod.schema.js'
import { bmAgentRunEventMlgFields } from './IbmAgentRunEvent.js'

export class BmAgentRunEvent extends BmBase<IbmAgentRunEvent, IAgentRunEventMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmAgentRunEvent> = bmAgentRunEventMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmAgentRunEvent>) {
    super({ data, locale, fallbackLocale, logger }, agentRunEventResources)
  }

  public buildSchemas(zodCtx: IAgentRunEventZodCtx) {
    return {
      default: createAgentRunEventZodSchemaWithContext(zodCtx),
    }
  }
}
