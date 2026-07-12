import { Effect } from 'effect'
import { CodexChatSettingServiceError } from '../../errors/CodexChatSettingServiceError.js'
import { IbmCodexChatSetting, IbmCodexChatSettingInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface ICodexChatSettingServicePort {
  getById(
    id: string,
    options?: DbQueryOptions<IbmCodexChatSetting>
  ): Effect.Effect<IbmCodexChatSetting | null, CodexChatSettingServiceError>
  create(data: IbmCodexChatSettingInsert): Effect.Effect<IbmCodexChatSetting, CodexChatSettingServiceError>
  addSetting(data: IbmCodexChatSettingInsert): Effect.Effect<IbmCodexChatSetting, CodexChatSettingServiceError>
  updateSetting(
    id: string,
    patch: Partial<IbmCodexChatSetting>
  ): Effect.Effect<IbmCodexChatSetting, CodexChatSettingServiceError>
  listSettings(
    filter?: Partial<IbmCodexChatSetting>,
    options?: DbQueryOptions<IbmCodexChatSetting>
  ): Effect.Effect<IbmCodexChatSetting[], CodexChatSettingServiceError>
  removeSetting(id: string): Effect.Effect<void, CodexChatSettingServiceError>
}

