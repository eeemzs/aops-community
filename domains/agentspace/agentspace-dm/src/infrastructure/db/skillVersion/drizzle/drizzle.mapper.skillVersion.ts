import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSkillVersion } from '../../../../domain/models/index.js'
import { IdbSkillVersionDrizzle, SkillVersionColumnsDrizzle } from './drizzle.schema.skillVersion.js'

const conversions: FieldConversionLookup<IbmSkillVersion, SkillVersionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperSkillVersionDrizzle = createBmDbMapper<IbmSkillVersion, IdbSkillVersionDrizzle, SkillVersionColumnsDrizzle>(conversions);
