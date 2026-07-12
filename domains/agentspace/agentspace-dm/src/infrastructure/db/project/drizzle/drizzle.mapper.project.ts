import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmProject } from '../../../../domain/models/index.js'
import { IdbProjectDrizzle, ProjectColumnsDrizzle } from './drizzle.schema.project.js'

const conversions: FieldConversionLookup<IbmProject, ProjectColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperProjectDrizzle = createBmDbMapper<IbmProject, IdbProjectDrizzle, ProjectColumnsDrizzle>(conversions);
