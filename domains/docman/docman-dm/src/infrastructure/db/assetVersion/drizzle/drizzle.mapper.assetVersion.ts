import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmAssetVersion } from '../../../../domain/models/index.js'
import { AssetVersionColumnsDrizzle, IdbAssetVersionDrizzle } from './drizzle.schema.assetVersion.js'

const conversions: FieldConversionLookup<IbmAssetVersion, AssetVersionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  assetId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperAssetVersionDrizzle = createBmDbMapper<IbmAssetVersion, IdbAssetVersionDrizzle, AssetVersionColumnsDrizzle>(conversions)
