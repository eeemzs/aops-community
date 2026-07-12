import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmAsset } from '../../../../domain/models/index.js'
import { AssetColumnsDrizzle, IdbAssetDrizzle } from './drizzle.schema.asset.js'

const conversions: FieldConversionLookup<IbmAsset, AssetColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  currentVersionId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperAssetDrizzle = createBmDbMapper<IbmAsset, IdbAssetDrizzle, AssetColumnsDrizzle>(conversions)
