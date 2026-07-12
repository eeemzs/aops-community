import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmPrompt } from '../../../../domain/models/index.js'
import { IdbPromptDrizzle, PromptColumnsDrizzle } from './drizzle.schema.prompt.js'

const conversions: FieldConversionLookup<IbmPrompt, PromptColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperPromptDrizzle = createBmDbMapper<IbmPrompt, IdbPromptDrizzle, PromptColumnsDrizzle>(conversions);
