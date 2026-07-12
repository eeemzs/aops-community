import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmAgentSession } from './IbmAgentSession.js'
import { IAgentSessionMlgTags, IAgentSessionZodCtx, agentSessionResources } from './resources.js'
import { createAgentSessionZodSchemaWithContext } from './zod.schema.js'
import { bmAgentSessionMlgFields } from './IbmAgentSession.js'

export class BmAgentSession extends BmBase<IbmAgentSession, IAgentSessionMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmAgentSession> = bmAgentSessionMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmAgentSession>) {
    super({ data, locale, fallbackLocale, logger }, agentSessionResources)
  }

  public buildSchemas(zodCtx: IAgentSessionZodCtx) {
    return {
      default: createAgentSessionZodSchemaWithContext(zodCtx),
    }
  }
}

