import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmDocument } from '../../../../domain/models/index.js'
import { IdbDocumentDrizzle, DocumentColumnsDrizzle } from './drizzle.schema.document.js'

const conversions: FieldConversionLookup<IbmDocument, DocumentColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  groupId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperDocumentDrizzle = createBmDbMapper<IbmDocument, IdbDocumentDrizzle, DocumentColumnsDrizzle>(conversions);
