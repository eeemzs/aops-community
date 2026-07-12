import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmPromptVersion } from '../../../../domain/models/index.js'
import { IdbPromptVersionDrizzle, PromptVersionColumnsDrizzle } from './drizzle.schema.promptVersion.js'

const conversions: FieldConversionLookup<IbmPromptVersion, PromptVersionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperPromptVersionDrizzle = createBmDbMapper<IbmPromptVersion, IdbPromptVersionDrizzle, PromptVersionColumnsDrizzle>(conversions);
