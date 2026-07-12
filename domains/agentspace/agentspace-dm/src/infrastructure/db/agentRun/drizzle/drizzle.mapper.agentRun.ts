import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmAgentRun } from '../../../../domain/models/index.js'
import { IdbAgentRunDrizzle, AgentRunColumnsDrizzle } from './drizzle.schema.agentRun.js'

const conversions: FieldConversionLookup<IbmAgentRun, AgentRunColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperAgentRunDrizzle = createBmDbMapper<IbmAgentRun, IdbAgentRunDrizzle, AgentRunColumnsDrizzle>(conversions);
