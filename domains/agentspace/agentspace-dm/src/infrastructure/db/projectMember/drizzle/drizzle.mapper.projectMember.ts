import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmProjectMember } from '../../../../domain/models/index.js'
import { IdbProjectMemberDrizzle, ProjectMemberColumnsDrizzle } from './drizzle.schema.projectMember.js'

const conversions: FieldConversionLookup<IbmProjectMember, ProjectMemberColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperProjectMemberDrizzle = createBmDbMapper<IbmProjectMember, IdbProjectMemberDrizzle, ProjectMemberColumnsDrizzle>(conversions);
