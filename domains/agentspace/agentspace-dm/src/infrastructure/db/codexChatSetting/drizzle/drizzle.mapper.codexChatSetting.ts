import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmCodexChatSetting } from '../../../../domain/models/index.js'
import {
  IdbCodexChatSettingDrizzle,
  CodexChatSettingColumnsDrizzle,
} from './drizzle.schema.codexChatSetting.js'

const conversions: FieldConversionLookup<IbmCodexChatSetting, CodexChatSettingColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperCodexChatSettingDrizzle = createBmDbMapper<
  IbmCodexChatSetting,
  IdbCodexChatSettingDrizzle,
  CodexChatSettingColumnsDrizzle
>(conversions)

