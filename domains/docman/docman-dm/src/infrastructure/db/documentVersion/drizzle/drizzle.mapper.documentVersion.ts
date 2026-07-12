import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmDocumentVersion } from '../../../../domain/models/index.js'
import { IdbDocumentVersionDrizzle, DocumentVersionColumnsDrizzle } from './drizzle.schema.documentVersion.js'

const conversions: FieldConversionLookup<IbmDocumentVersion, DocumentVersionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  documentId: { toDomain: uuidToString, toDb: stringToUuid },
  basedOnVersionId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperDocumentVersionDrizzle = createBmDbMapper<IbmDocumentVersion, IdbDocumentVersionDrizzle, DocumentVersionColumnsDrizzle>(conversions);

