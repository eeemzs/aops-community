import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmProjectPath } from '../../../../domain/models/index.js'
import { IdbProjectPathDrizzle, ProjectPathColumnsDrizzle } from './drizzle.schema.projectPath.js'

const conversions: FieldConversionLookup<IbmProjectPath, ProjectPathColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperProjectPathDrizzle = createBmDbMapper<IbmProjectPath, IdbProjectPathDrizzle, ProjectPathColumnsDrizzle>(conversions);
