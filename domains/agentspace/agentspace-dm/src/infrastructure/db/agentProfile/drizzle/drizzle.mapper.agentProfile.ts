import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmAgentProfile } from '../../../../domain/models/index.js'
import { AgentProfileColumnsDrizzle, IdbAgentProfileDrizzle } from './drizzle.schema.agentProfile.js'

const conversions: FieldConversionLookup<IbmAgentProfile, AgentProfileColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperAgentProfileDrizzle = createBmDbMapper<IbmAgentProfile, IdbAgentProfileDrizzle, AgentProfileColumnsDrizzle>(conversions)
