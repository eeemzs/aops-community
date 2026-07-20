import type { Chatv3KeyStore } from '@aopslab/domain-product-client-chatv3'
import { IndexedDbKeyValueStore } from '@aopslab/light-client-core/storage'
import type { ChatChannelRef, ChatSpaceRef } from './chat'

/**
 * Cockpit ChatV3 storage over light-client-core's CryptoKey-capable IndexedDB
 * store. Own db namespace so cockpit keys/session rows never collide with a
 * standalone chatv3-client on the same origin. Epoch keys persist as
 * non-extractable CryptoKey handles — the server-blind guarantee is unchanged.
 */
const kv = new IndexedDbKeyValueStore({ dbName: 'aops-cockpit-v2-chat', storeName: 'keys' })
const SESSION_KEY = 'session:v1'
const CHANNEL_MEMBER_TOKEN_KEY_PREFIX = 'channel-member-token:'
const CHANNEL_KEY_ID_KEY_PREFIX = 'channel-key-id:'
const CHANNEL_INVITE_KEY_PREFIX = 'channel-invite:'

export type CockpitChatSessionSnapshot = {
  version: 1
  updatedAt: string
  handle: string | null
  activeSpaceSlug: string
  activeChannelId: string | null
  activeRoomId: string | null
  spaces: ChatSpaceRef[]
  channels: ChatChannelRef[]
}

export class CockpitChatKeyStore implements Chatv3KeyStore {
  async setWrapSecret(channelId: string, wrapSecret: string): Promise<void> {
    await kv.put(`wrap:${channelId}`, wrapSecret)
  }
  async getWrapSecret(channelId: string): Promise<string | null> {
    return kv.get<string>(`wrap:${channelId}`)
  }
  async setEpochKey(roomId: string, epoch: number, key: CryptoKey): Promise<void> {
    await kv.put(`epoch:${roomId}:${epoch}`, key)
  }
  async getEpochKey(roomId: string, epoch: number): Promise<CryptoKey | null> {
    return kv.get<CryptoKey>(`epoch:${roomId}:${epoch}`)
  }
}

export class CockpitChatSessionStore {
  async get(): Promise<CockpitChatSessionSnapshot | null> {
    return kv.get<CockpitChatSessionSnapshot>(SESSION_KEY)
  }

  async set(snapshot: CockpitChatSessionSnapshot): Promise<void> {
    await kv.put(SESSION_KEY, snapshot)
  }

  async clear(): Promise<void> {
    await kv.delete(SESSION_KEY)
  }

  async setChannelMemberToken(channelId: string, memberToken: string): Promise<void> {
    await kv.put(`${CHANNEL_MEMBER_TOKEN_KEY_PREFIX}${channelId}`, memberToken)
  }

  async getChannelMemberToken(channelId: string): Promise<string | null> {
    return kv.get<string>(`${CHANNEL_MEMBER_TOKEN_KEY_PREFIX}${channelId}`)
  }

  async deleteChannelMemberToken(channelId: string): Promise<void> {
    await kv.delete(`${CHANNEL_MEMBER_TOKEN_KEY_PREFIX}${channelId}`)
  }

  async setChannelKeyId(channelId: string, keyId: string): Promise<void> {
    await kv.put(`${CHANNEL_KEY_ID_KEY_PREFIX}${channelId}`, keyId)
  }

  async getChannelKeyId(channelId: string): Promise<string | null> {
    return kv.get<string>(`${CHANNEL_KEY_ID_KEY_PREFIX}${channelId}`)
  }

  async deleteChannelKeyId(channelId: string): Promise<void> {
    await kv.delete(`${CHANNEL_KEY_ID_KEY_PREFIX}${channelId}`)
  }

  async setChannelInvite(channelId: string, invite: string): Promise<void> {
    await kv.put(`${CHANNEL_INVITE_KEY_PREFIX}${channelId}`, invite)
  }

  async getChannelInvite(channelId: string): Promise<string | null> {
    return kv.get<string>(`${CHANNEL_INVITE_KEY_PREFIX}${channelId}`)
  }

  async deleteChannelInvite(channelId: string): Promise<void> {
    await kv.delete(`${CHANNEL_INVITE_KEY_PREFIX}${channelId}`)
  }
}
