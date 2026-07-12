import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmPageVersion } from '../../../../domain/models/index.js'
import { IdbPageVersionDrizzle, PageVersionColumnsDrizzle } from './drizzle.schema.pageVersion.js'

const conversions: FieldConversionLookup<IbmPageVersion, PageVersionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  pageId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperPageVersionDrizzle = createBmDbMapper<IbmPageVersion, IdbPageVersionDrizzle, PageVersionColumnsDrizzle>(conversions);

