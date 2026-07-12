import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmHistory } from '../../../../domain/models/index.js'
import { IdbHistoryDrizzle, HistoryColumnsDrizzle } from './drizzle.schema.history.js'

const conversions: FieldConversionLookup<IbmHistory, HistoryColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  projectId: { toDomain: uuidToString, toDb: stringToUuid },
  boardId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperHistoryDrizzle = createBmDbMapper<IbmHistory, IdbHistoryDrizzle, HistoryColumnsDrizzle>(conversions)
