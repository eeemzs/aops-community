import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmFeedbackItem } from '../../../../domain/models/index.js'
import { IdbFeedbackItemDrizzle, FeedbackItemColumnsDrizzle } from './drizzle.schema.feedbackItem.js'

const stringToNullableUuid = (value?: string | null): string | null | undefined => {
  if (value === null) return null
  return stringToUuid(value)
}

const conversions: FieldConversionLookup<IbmFeedbackItem, FeedbackItemColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  sprintId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  kanbanTaskId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  microTaskItemId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperFeedbackItemDrizzle = createBmDbMapper<IbmFeedbackItem, IdbFeedbackItemDrizzle, FeedbackItemColumnsDrizzle>(conversions);
