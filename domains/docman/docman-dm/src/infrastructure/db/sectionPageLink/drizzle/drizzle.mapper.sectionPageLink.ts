import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSectionPageLink } from '../../../../domain/models/index.js'
import { IdbSectionPageLinkDrizzle, SectionPageLinkColumnsDrizzle } from './drizzle.schema.sectionPageLink.js'

const conversions: FieldConversionLookup<IbmSectionPageLink, SectionPageLinkColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  sectionId: { toDomain: uuidToString, toDb: stringToUuid },
  pageVersionId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperSectionPageLinkDrizzle = createBmDbMapper<IbmSectionPageLink, IdbSectionPageLinkDrizzle, SectionPageLinkColumnsDrizzle>(conversions);
