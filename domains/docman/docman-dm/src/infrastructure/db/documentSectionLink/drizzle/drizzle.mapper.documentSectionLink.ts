import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmDocumentSectionLink } from '../../../../domain/models/index.js'
import { IdbDocumentSectionLinkDrizzle, DocumentSectionLinkColumnsDrizzle } from './drizzle.schema.documentSectionLink.js'

const conversions: FieldConversionLookup<IbmDocumentSectionLink, DocumentSectionLinkColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  documentVersionId: { toDomain: uuidToString, toDb: stringToUuid },
  sectionId: { toDomain: uuidToString, toDb: stringToUuid },
  pageVersionId: { toDomain: uuidToString, toDb: stringToUuid },
  parentLinkId: {
    toDomain: uuidToString,
    toDb: (value) => (value === null ? null : stringToUuid(value))
  },
}

export const mapperDocumentSectionLinkDrizzle = createBmDbMapper<IbmDocumentSectionLink, IdbDocumentSectionLinkDrizzle, DocumentSectionLinkColumnsDrizzle>(conversions);
