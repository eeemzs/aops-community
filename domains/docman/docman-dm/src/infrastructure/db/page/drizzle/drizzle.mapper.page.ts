import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmPage } from '../../../../domain/models/index.js'
import { IdbPageDrizzle, PageColumnsDrizzle } from './drizzle.schema.page.js'

const conversions: FieldConversionLookup<IbmPage, PageColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperPageDrizzle = createBmDbMapper<IbmPage, IdbPageDrizzle, PageColumnsDrizzle>(conversions);

