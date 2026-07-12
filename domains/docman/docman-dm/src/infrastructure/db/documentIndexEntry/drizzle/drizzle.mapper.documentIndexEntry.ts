import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmDocumentIndexEntry } from '../../../../domain/models/index.js'
import { DocumentIndexEntryColumnsDrizzle, IdbDocumentIndexEntryDrizzle } from './drizzle.schema.documentIndexEntry.js'

const conversions: FieldConversionLookup<IbmDocumentIndexEntry, DocumentIndexEntryColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  documentVersionId: { toDomain: uuidToString, toDb: stringToUuid },
  documentId: { toDomain: uuidToString, toDb: stringToUuid },
  linkId: { toDomain: uuidToString, toDb: stringToUuid },
  parentLinkId: { toDomain: uuidToString, toDb: stringToUuid },
  sectionId: { toDomain: uuidToString, toDb: stringToUuid },
  pageId: { toDomain: uuidToString, toDb: stringToUuid },
  pageVersionId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperDocumentIndexEntryDrizzle = createBmDbMapper<
  IbmDocumentIndexEntry,
  IdbDocumentIndexEntryDrizzle,
  DocumentIndexEntryColumnsDrizzle
>(conversions)
