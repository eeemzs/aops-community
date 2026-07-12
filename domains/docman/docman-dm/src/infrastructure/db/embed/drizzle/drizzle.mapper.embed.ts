import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmEmbed } from '../../../../domain/models/index.js'
import { IdbEmbedDrizzle, EmbedColumnsDrizzle } from './drizzle.schema.embed.js'

const conversions: FieldConversionLookup<IbmEmbed, EmbedColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperEmbedDrizzle = createBmDbMapper<IbmEmbed, IdbEmbedDrizzle, EmbedColumnsDrizzle>(conversions);
