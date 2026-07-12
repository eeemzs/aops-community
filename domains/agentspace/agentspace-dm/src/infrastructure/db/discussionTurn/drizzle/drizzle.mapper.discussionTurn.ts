import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmDiscussionTurn } from '../../../../domain/models/index.js'
import {
  DiscussionTurnColumnsDrizzle,
  IdbDiscussionTurnDrizzle,
} from './drizzle.schema.discussionTurn.js'

const conversions: FieldConversionLookup<IbmDiscussionTurn, DiscussionTurnColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperDiscussionTurnDrizzle = createBmDbMapper<
  IbmDiscussionTurn,
  IdbDiscussionTurnDrizzle,
  DiscussionTurnColumnsDrizzle
>(conversions)
