import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmAgentSession } from '../../../../domain/models/index.js'
import { IdbAgentSessionDrizzle, AgentSessionColumnsDrizzle } from './drizzle.schema.agentSession.js'

const conversions: FieldConversionLookup<IbmAgentSession, AgentSessionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  missionId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperAgentSessionDrizzle = createBmDbMapper<IbmAgentSession, IdbAgentSessionDrizzle, AgentSessionColumnsDrizzle>(conversions);
