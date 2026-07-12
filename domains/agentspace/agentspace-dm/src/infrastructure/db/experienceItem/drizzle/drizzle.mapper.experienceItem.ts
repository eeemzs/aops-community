import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmExperienceItem } from '../../../../domain/models/index.js'
import { ExperienceItemColumnsDrizzle, IdbExperienceItemDrizzle } from './drizzle.schema.experienceItem.js'

const conversions: FieldConversionLookup<IbmExperienceItem, ExperienceItemColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperExperienceItemDrizzle = createBmDbMapper<IbmExperienceItem, IdbExperienceItemDrizzle, ExperienceItemColumnsDrizzle>(conversions)
