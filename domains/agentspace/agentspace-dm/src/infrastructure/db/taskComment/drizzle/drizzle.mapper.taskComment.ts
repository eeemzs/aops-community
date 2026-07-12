import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmTaskComment } from '../../../../domain/models/index.js'
import { IdbTaskCommentDrizzle, TaskCommentColumnsDrizzle } from './drizzle.schema.taskComment.js'

const conversions: FieldConversionLookup<IbmTaskComment, TaskCommentColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperTaskCommentDrizzle = createBmDbMapper<IbmTaskComment, IdbTaskCommentDrizzle, TaskCommentColumnsDrizzle>(conversions);
