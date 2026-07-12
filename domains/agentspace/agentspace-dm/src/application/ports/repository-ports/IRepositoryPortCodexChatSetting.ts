import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmCodexChatSetting } from '../../../domain/models/index.js'
import { IdbCodexChatSettingDrizzle } from '../../../infrastructure/db/codexChatSetting/drizzle/drizzle.schema.codexChatSetting.js'

/**
 * Repository port for CodexChatSetting
 */
export interface IRepositoryPortCodexChatSetting
  extends IRepositoryPortBaseCrud<IbmCodexChatSetting, IdbCodexChatSettingDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here.
  //<==//
}


