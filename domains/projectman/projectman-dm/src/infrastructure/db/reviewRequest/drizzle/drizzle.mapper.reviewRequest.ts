import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmReviewRequest } from '../../../../domain/models/index.js'
import { IdbReviewRequestDrizzle, ReviewRequestColumnsDrizzle } from './drizzle.schema.reviewRequest.js'

const stringToNullableUuid = (value?: string | null): string | null | undefined => {
  if (value === null) return null
  return stringToUuid(value)
}

const conversions: FieldConversionLookup<IbmReviewRequest, ReviewRequestColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  sprintId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  kanbanTaskId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  microTaskItemId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  parentReviewRequestId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  rootReviewRequestId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperReviewRequestDrizzle = createBmDbMapper<IbmReviewRequest, IdbReviewRequestDrizzle, ReviewRequestColumnsDrizzle>(conversions);
