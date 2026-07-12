import { Effect } from 'effect'
import { CodexChatMessageServiceError } from '../../errors/CodexChatMessageServiceError.js'
import { IbmCodexChatMessage, IbmCodexChatMessageInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface ICodexChatMessageServicePort {
  getById(
    id: string,
    options?: DbQueryOptions<IbmCodexChatMessage>
  ): Effect.Effect<IbmCodexChatMessage | null, CodexChatMessageServiceError>
  create(data: IbmCodexChatMessageInsert): Effect.Effect<IbmCodexChatMessage, CodexChatMessageServiceError>
  addMessage(data: IbmCodexChatMessageInsert): Effect.Effect<IbmCodexChatMessage, CodexChatMessageServiceError>
  updateMessage(
    id: string,
    patch: Partial<IbmCodexChatMessage>
  ): Effect.Effect<IbmCodexChatMessage, CodexChatMessageServiceError>
  listMessages(
    filter?: Partial<IbmCodexChatMessage>,
    options?: DbQueryOptions<IbmCodexChatMessage>
  ): Effect.Effect<IbmCodexChatMessage[], CodexChatMessageServiceError>
  removeMessage(id: string): Effect.Effect<void, CodexChatMessageServiceError>
}

