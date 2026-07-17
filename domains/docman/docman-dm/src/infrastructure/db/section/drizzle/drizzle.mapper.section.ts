import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSection } from '../../../../domain/models/index.js'
import { IdbSectionDrizzle, SectionColumnsDrizzle } from './drizzle.schema.section.js'

const conversions: FieldConversionLookup<IbmSection, SectionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperSectionDrizzle = createBmDbMapper<IbmSection, IdbSectionDrizzle, SectionColumnsDrizzle>(conversions);
