import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmScope } from '../../../../domain/models/index.js'
import { IdbScopeDrizzle, ScopeColumnsDrizzle } from './drizzle.schema.scope.js'

const conversions: FieldConversionLookup<IbmScope, ScopeColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  parentScopeId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperScopeDrizzle = createBmDbMapper<IbmScope, IdbScopeDrizzle, ScopeColumnsDrizzle>(conversions)
