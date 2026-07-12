import { Effect } from 'effect'
import { CodexChatThreadServiceError } from '../../errors/CodexChatThreadServiceError.js'
import { IbmCodexChatThread, IbmCodexChatThreadInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'

export type CodexChatThreadListFilter = Partial<IbmCodexChatThread> & {
  scopeResolution?: ScopeResolution
}

export interface ICodexChatThreadServicePort {
  getById(
    id: string,
    options?: DbQueryOptions<IbmCodexChatThread>
  ): Effect.Effect<IbmCodexChatThread | null, CodexChatThreadServiceError>
  create(data: IbmCodexChatThreadInsert): Effect.Effect<IbmCodexChatThread, CodexChatThreadServiceError>
  addThread(data: IbmCodexChatThreadInsert): Effect.Effect<IbmCodexChatThread, CodexChatThreadServiceError>
  updateThread(id: string, patch: Partial<IbmCodexChatThread>): Effect.Effect<IbmCodexChatThread, CodexChatThreadServiceError>
  listThreads(
    filter?: CodexChatThreadListFilter,
    options?: DbQueryOptions<IbmCodexChatThread>
  ): Effect.Effect<IbmCodexChatThread[], CodexChatThreadServiceError>
  removeThread(id: string): Effect.Effect<void, CodexChatThreadServiceError>
}
