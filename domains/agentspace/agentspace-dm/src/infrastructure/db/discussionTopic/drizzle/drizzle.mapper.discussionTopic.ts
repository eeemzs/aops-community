import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmDiscussionTopic } from '../../../../domain/models/index.js'
import {
  DiscussionTopicColumnsDrizzle,
  IdbDiscussionTopicDrizzle,
} from './drizzle.schema.discussionTopic.js'

const conversions: FieldConversionLookup<IbmDiscussionTopic, DiscussionTopicColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperDiscussionTopicDrizzle = createBmDbMapper<
  IbmDiscussionTopic,
  IdbDiscussionTopicDrizzle,
  DiscussionTopicColumnsDrizzle
>(conversions)
