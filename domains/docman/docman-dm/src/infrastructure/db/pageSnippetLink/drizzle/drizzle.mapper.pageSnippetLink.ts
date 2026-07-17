import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmPageSnippetLink } from '../../../../domain/models/index.js'
import { IdbPageSnippetLinkDrizzle, PageSnippetLinkColumnsDrizzle } from './drizzle.schema.pageSnippetLink.js'

const conversions: FieldConversionLookup<IbmPageSnippetLink, PageSnippetLinkColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  pageVersionId: { toDomain: uuidToString, toDb: stringToUuid },
  snippetId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperPageSnippetLinkDrizzle = createBmDbMapper<IbmPageSnippetLink, IdbPageSnippetLinkDrizzle, PageSnippetLinkColumnsDrizzle>(conversions);
