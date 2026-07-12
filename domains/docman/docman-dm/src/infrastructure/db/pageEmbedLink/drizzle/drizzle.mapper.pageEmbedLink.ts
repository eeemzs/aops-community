import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmPageEmbedLink } from '../../../../domain/models/index.js'
import { IdbPageEmbedLinkDrizzle, PageEmbedLinkColumnsDrizzle } from './drizzle.schema.pageEmbedLink.js'

const conversions: FieldConversionLookup<IbmPageEmbedLink, PageEmbedLinkColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperPageEmbedLinkDrizzle = createBmDbMapper<IbmPageEmbedLink, IdbPageEmbedLinkDrizzle, PageEmbedLinkColumnsDrizzle>(conversions);
