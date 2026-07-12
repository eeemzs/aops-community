import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmDiscussionOutput } from '../../../../domain/models/index.js'
import {
  DiscussionOutputColumnsDrizzle,
  IdbDiscussionOutputDrizzle,
} from './drizzle.schema.discussionOutput.js'

const conversions: FieldConversionLookup<IbmDiscussionOutput, DiscussionOutputColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperDiscussionOutputDrizzle = createBmDbMapper<
  IbmDiscussionOutput,
  IdbDiscussionOutputDrizzle,
  DiscussionOutputColumnsDrizzle
>(conversions)
