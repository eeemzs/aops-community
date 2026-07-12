import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmCodexChatMessage } from '../../../../domain/models/index.js'
import {
  IdbCodexChatMessageDrizzle,
  CodexChatMessageColumnsDrizzle,
} from './drizzle.schema.codexChatMessage.js'

const conversions: FieldConversionLookup<IbmCodexChatMessage, CodexChatMessageColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperCodexChatMessageDrizzle = createBmDbMapper<
  IbmCodexChatMessage,
  IdbCodexChatMessageDrizzle,
  CodexChatMessageColumnsDrizzle
>(conversions)

