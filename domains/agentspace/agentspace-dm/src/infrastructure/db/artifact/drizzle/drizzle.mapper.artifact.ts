import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmArtifact } from '../../../../domain/models/index.js'
import { IdbArtifactDrizzle, ArtifactColumnsDrizzle } from './drizzle.schema.artifact.js'

const conversions: FieldConversionLookup<IbmArtifact, ArtifactColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperArtifactDrizzle = createBmDbMapper<IbmArtifact, IdbArtifactDrizzle, ArtifactColumnsDrizzle>(conversions);
