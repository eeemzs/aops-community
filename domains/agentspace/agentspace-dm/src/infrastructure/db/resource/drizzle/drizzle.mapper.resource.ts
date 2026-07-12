import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmResource } from '../../../../domain/models/index.js'
import { IdbResourceDrizzle, ResourceColumnsDrizzle } from './drizzle.schema.resource.js'

const conversions: FieldConversionLookup<IbmResource, ResourceColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperResourceDrizzle = createBmDbMapper<IbmResource, IdbResourceDrizzle, ResourceColumnsDrizzle>(conversions);
