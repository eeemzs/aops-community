import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSnippet } from '../../../../domain/models/index.js'
import { IdbSnippetDrizzle, SnippetColumnsDrizzle } from './drizzle.schema.snippet.js'

const conversions: FieldConversionLookup<IbmSnippet, SnippetColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperSnippetDrizzle = createBmDbMapper<IbmSnippet, IdbSnippetDrizzle, SnippetColumnsDrizzle>(conversions);

