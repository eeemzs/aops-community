import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmCodexChatThread } from '../../../../domain/models/index.js'
import {
  IdbCodexChatThreadDrizzle,
  CodexChatThreadColumnsDrizzle,
} from './drizzle.schema.codexChatThread.js'

const conversions: FieldConversionLookup<IbmCodexChatThread, CodexChatThreadColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperCodexChatThreadDrizzle = createBmDbMapper<
  IbmCodexChatThread,
  IdbCodexChatThreadDrizzle,
  CodexChatThreadColumnsDrizzle
>(conversions)

