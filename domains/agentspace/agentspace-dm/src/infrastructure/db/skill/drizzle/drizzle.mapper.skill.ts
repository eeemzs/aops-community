import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSkill } from '../../../../domain/models/index.js'
import { IdbSkillDrizzle, SkillColumnsDrizzle } from './drizzle.schema.skill.js'

const conversions: FieldConversionLookup<IbmSkill, SkillColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperSkillDrizzle = createBmDbMapper<IbmSkill, IdbSkillDrizzle, SkillColumnsDrizzle>(conversions);
