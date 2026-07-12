import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmArtifactLink } from '../../../../domain/models/index.js'
import { IdbArtifactLinkDrizzle, ArtifactLinkColumnsDrizzle } from './drizzle.schema.artifactLink.js'

const conversions: FieldConversionLookup<IbmArtifactLink, ArtifactLinkColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperArtifactLinkDrizzle = createBmDbMapper<IbmArtifactLink, IdbArtifactLinkDrizzle, ArtifactLinkColumnsDrizzle>(conversions);
