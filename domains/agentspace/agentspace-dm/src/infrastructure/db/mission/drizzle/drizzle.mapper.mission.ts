import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmMission } from '../../../../domain/models/index.js'
import { IdbMissionDrizzle, MissionColumnsDrizzle } from './drizzle.schema.mission.js'

const conversions: FieldConversionLookup<IbmMission, MissionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
};

export const mapperMissionDrizzle = createBmDbMapper<IbmMission, IdbMissionDrizzle, MissionColumnsDrizzle>(conversions);
