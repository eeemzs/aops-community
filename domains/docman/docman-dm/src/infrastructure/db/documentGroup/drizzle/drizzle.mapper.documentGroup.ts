import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmDocumentGroup } from '../../../../domain/models/index.js'
import { IdbDocumentGroupDrizzle, DocumentGroupColumnsDrizzle } from './drizzle.schema.documentGroup.js'

const conversions: FieldConversionLookup<IbmDocumentGroup, DocumentGroupColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  parentGroupId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperDocumentGroupDrizzle = createBmDbMapper<IbmDocumentGroup, IdbDocumentGroupDrizzle, DocumentGroupColumnsDrizzle>(conversions);
