import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { ChatServiceError } from '../../errors/ChatServiceError.js'
import {
  IbmChatMessage,
  IbmChatMessageInsert,
  IbmChatRoom,
  IbmChatRoomBinding,
  IbmChatRoomBindingInsert,
  IbmChatRoomInsert,
  IbmChatRoomMember,
  IbmChatRoomMemberInsert,
} from '../../../domain/models/index.js'
import type { ScopeResolution } from '../../../domain/types.js'

export type ChatRoomCreateInput =
  Pick<IbmChatRoomInsert, 'scopeId' | 'slug' | 'title'> &
  Partial<Omit<IbmChatRoomInsert, 'scopeId' | 'slug' | 'title' | 'kind' | 'status' | 'lastSeq'>> &
  Partial<Pick<IbmChatRoomInsert, 'kind' | 'status' | 'lastSeq'>> & {
    members?: ChatMemberCreateInput[]
    bindings?: ChatBindingCreateInput[]
  }

export type ChatRoomListFilter = Partial<IbmChatRoom> & {
  scopeResolution?: ScopeResolution
}

export type ChatMemberCreateInput =
  Pick<IbmChatRoomMemberInsert, 'scopeId' | 'roomId' | 'agentId'> &
  Partial<Omit<IbmChatRoomMemberInsert, 'scopeId' | 'roomId' | 'agentId'>>

export type ChatMemberRemoveInput = {
  memberId?: string
  roomId?: string
  agentId?: string
  updatedBy?: string
}

export type ChatBindingCreateInput = IbmChatRoomBindingInsert

export type ChatMessageSendInput =
  Omit<IbmChatMessageInsert, 'seq' | 'kind'> &
  Partial<Pick<IbmChatMessageInsert, 'kind'>>

export type ChatMessageListFilter = Partial<IbmChatMessage> & {
  afterSeq?: number
}

export type ChatOpenDmInput = {
  scopeId: string
  agentIds: string[]
  projectId?: string
  title?: string
  purpose?: string
  guidanceMarkdown?: string
  roles?: Record<string, string>
  createdBy?: string
  updatedBy?: string
}

export type ChatCatchupInput = {
  roomId?: string
  agentId: string
  limit?: number
}

export type ChatMarkReadInput = {
  roomId: string
  agentId: string
  seq?: number
  updatedBy?: string
}

export type ChatManifestExportInput = {
  roomId: string
  includeMessages?: boolean
}

export type ChatRoomManifest = {
  exportedAt: string
  room: IbmChatRoom
  members: IbmChatRoomMember[]
  bindings: IbmChatRoomBinding[]
  messages?: IbmChatMessage[]
}

export type ChatRoomCatchup = {
  room: IbmChatRoom
  member: IbmChatRoomMember
  messages: IbmChatMessage[]
  unreadCount: number
}

export type ChatCatchupResult = {
  agentId: string
  rooms: ChatRoomCatchup[]
  unreadCount: number
}

export interface IChatServicePort {
  getRoomById(id: string, options?: DbQueryOptions<IbmChatRoom>): Effect.Effect<IbmChatRoom | null, ChatServiceError>
  createRoom(data: ChatRoomCreateInput): Effect.Effect<IbmChatRoom, ChatServiceError>
  listRooms(
    filter?: ChatRoomListFilter,
    options?: DbQueryOptions<IbmChatRoom>
  ): Effect.Effect<IbmChatRoom[], ChatServiceError>
  updateRoom(id: string, patch: Partial<IbmChatRoom>): Effect.Effect<IbmChatRoom, ChatServiceError>
  archiveRoom(id: string, updatedBy?: string): Effect.Effect<IbmChatRoom, ChatServiceError>
  openDm(data: ChatOpenDmInput): Effect.Effect<IbmChatRoom, ChatServiceError>
  exportManifest(data: ChatManifestExportInput): Effect.Effect<ChatRoomManifest, ChatServiceError>

  addMember(data: ChatMemberCreateInput): Effect.Effect<IbmChatRoomMember, ChatServiceError>
  updateMember(id: string, patch: Partial<IbmChatRoomMember>): Effect.Effect<IbmChatRoomMember, ChatServiceError>
  removeMember(data: ChatMemberRemoveInput): Effect.Effect<IbmChatRoomMember, ChatServiceError>

  addBinding(data: ChatBindingCreateInput): Effect.Effect<IbmChatRoomBinding, ChatServiceError>
  removeBinding(id: string): Effect.Effect<void, ChatServiceError>

  sendMessage(data: ChatMessageSendInput): Effect.Effect<IbmChatMessage, ChatServiceError>
  listMessages(
    filter?: ChatMessageListFilter,
    options?: DbQueryOptions<IbmChatMessage>
  ): Effect.Effect<IbmChatMessage[], ChatServiceError>
  catchup(data: ChatCatchupInput): Effect.Effect<ChatCatchupResult, ChatServiceError>
  markRead(data: ChatMarkReadInput): Effect.Effect<IbmChatRoomMember, ChatServiceError>
}
