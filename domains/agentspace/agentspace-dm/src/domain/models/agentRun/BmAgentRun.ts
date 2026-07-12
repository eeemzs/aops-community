import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmAgentRun } from './IbmAgentRun.js'
import { IAgentRunMlgTags, IAgentRunZodCtx, agentRunResources } from './resources.js'
import { createAgentRunZodSchemaWithContext } from './zod.schema.js'
import { bmAgentRunMlgFields } from './IbmAgentRun.js'

export class BmAgentRun extends BmBase<IbmAgentRun, IAgentRunMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmAgentRun> = bmAgentRunMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmAgentRun>) {
    super({ data, locale, fallbackLocale, logger }, agentRunResources)
  }

  public buildSchemas(zodCtx: IAgentRunZodCtx) {
    return {
      default: createAgentRunZodSchemaWithContext(zodCtx),
    }
  }
}

