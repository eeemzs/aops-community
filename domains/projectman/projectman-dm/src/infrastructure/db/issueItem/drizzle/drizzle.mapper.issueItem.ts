import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmIssueItem } from '../../../../domain/models/index.js'
import { IdbIssueItemDrizzle, IssueItemColumnsDrizzle } from './drizzle.schema.issueItem.js'

const stringToNullableUuid = (value?: string | null): string | null | undefined => {
  if (value === null) return null
  return stringToUuid(value)
}

const conversions: FieldConversionLookup<IbmIssueItem, IssueItemColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  sprintId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  kanbanTaskId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  microTaskItemId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  reviewRequestId: { toDomain: uuidToString, toDb: stringToNullableUuid as any },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperIssueItemDrizzle = createBmDbMapper<IbmIssueItem, IdbIssueItemDrizzle, IssueItemColumnsDrizzle>(conversions);
