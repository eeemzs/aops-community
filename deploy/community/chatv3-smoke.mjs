import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function requireLoopbackBaseUrl(value) {
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(host) || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('community_chatv3_loopback_api_base_required');
  }
  return parsed.origin;
}

const API_BASE_URL = requireLoopbackBaseUrl(process.env.COMMUNITY_API_BASE_URL ?? 'http://127.0.0.1:5901');
const CHAT_BASE_URL = `${API_BASE_URL}/api/chatv3/v1`;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const redactCommunityChatv3Log = (value) => String(value)
  .replace(/chv3:\/\/\S+/gi, '<redacted-invite>')
  .replace(/([?&#](?:token|secret|key)=)[^&#\s]+/gi, '$1<redacted>')
  .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1<redacted>');

function toB64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function fromB64Url(value) {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function parseServerInvite(invite, expectedChannelId) {
  const match = /^chv3:\/\/join\/([^/]+)\/([0-9a-f-]{36})#srv\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/i.exec(invite);
  if (!match) throw new Error('community_chatv3_invite_shape_invalid');
  let decodedBaseUrl;
  try { decodedBaseUrl = decodeURIComponent(match[1]); } catch { throw new Error('community_chatv3_invite_server_invalid'); }
  if (requireLoopbackBaseUrl(decodedBaseUrl) !== API_BASE_URL || match[2] !== expectedChannelId) {
    throw new Error('community_chatv3_invite_identity_mismatch');
  }
  return { channelId: match[2], keyId: match[3], accessSecret: match[4] };
}

async function request(method, pathname, { token, body } = {}) {
  const response = await fetch(`${CHAT_BASE_URL}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`community_chatv3_http_json_invalid:${method}:${pathname}`); }
  if (!response.ok || payload?.ok === false || (Array.isArray(payload?.errors) && payload.errors.length > 0)) {
    throw new Error(`community_chatv3_http_failed:${method}:${pathname}:${response.status}`);
  }
  return payload?.data?.data ?? payload?.data ?? payload?.result ?? payload;
}

async function importEpochKey(rawEpochKey) {
  return globalThis.crypto.subtle.importKey(
    'raw',
    fromB64Url(rawEpochKey),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptText(epochKey, epoch, plaintext) {
  const nonce = randomBytes(12);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    epochKey,
    encoder.encode(plaintext),
  );
  return {
    protocolVersion: 1,
    cipherSuite: 'v0-shared-epoch',
    epoch,
    ciphertext: toB64Url(new Uint8Array(ciphertext)),
    nonce: toB64Url(nonce),
  };
}

async function decryptText(epochKey, envelope) {
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64Url(envelope.nonce) },
    epochKey,
    fromB64Url(envelope.ciphertext),
  );
  return decoder.decode(plaintext);
}

export async function runCommunityChatv3Smoke() {
  const suffix = `${Date.now()}-${process.pid}`;
  const slug = `community-chat-smoke-${suffix}`;
  const accessSecret = randomBytes(24).toString('base64url');
  const keyId = `cvk_${randomBytes(9).toString('base64url')}`;
  const verifierHash = createHash('sha256').update(accessSecret).digest('hex');
  const messageText = 'Community ChatV3 smoke message';
  let channelId = null;
  let ownerToken = null;
  let completed = false;
  try {
    const space = await request('POST', '/spaces/ensure', { body: { slug, title: 'AOPS Community chat smoke' } });
    const created = await request('POST', '/channels', {
      body: {
        spaceId: space.id,
        slug,
        title: 'AOPS Community chat smoke',
        encryptionMode: 'server-encrypted',
        accessKey: { keyId, verifierHash },
        creator: { handle: 'demo-owner', actorKind: 'agent' },
      },
    });
    channelId = created.channel?.id;
    const tenantId = created.channel?.tenantId;
    const room = created.generalRoom;
    ownerToken = created.memberToken;
    if (!channelId || typeof tenantId !== 'string' || !tenantId || !room?.id || !ownerToken || typeof created.serverEpochKey !== 'string') {
      throw new Error('community_chatv3_create_shape_invalid');
    }
    const invite = `chv3://join/${encodeURIComponent(API_BASE_URL)}/${channelId}#srv.${keyId}.${accessSecret}`;
    const parsedInvite = parseServerInvite(invite, channelId);
    const ownerEpochKey = await importEpochKey(created.serverEpochKey);
    const joined = await request('POST', `/channels/${channelId}/join`, {
      body: { keyId: parsedInvite.keyId, accessSecret: parsedInvite.accessSecret, handle: 'demo-reviewer', actorKind: 'agent' },
    });
    const reviewerToken = joined.memberToken;
    if (!reviewerToken || !Array.isArray(joined.rooms) || !joined.rooms.some((entry) => entry?.id === room.id)) {
      throw new Error('community_chatv3_join_shape_invalid');
    }
    const epochKeySet = await request(
      'GET',
      `/channels/${channelId}/epoch-keys?tenantId=${encodeURIComponent(tenantId)}`,
      { token: reviewerToken },
    );
    const reviewerEpoch = Array.isArray(epochKeySet?.keys)
      ? epochKeySet.keys.find((entry) => entry?.roomId === room.id && entry?.epoch === room.currentEpoch)
      : null;
    if (epochKeySet?.channelId !== channelId || epochKeySet?.encryptionMode !== 'server-encrypted' || typeof reviewerEpoch?.rawEpochKey !== 'string') {
      throw new Error('community_chatv3_epoch_key_shape_invalid');
    }
    const reviewerEpochKey = await importEpochKey(reviewerEpoch.rawEpochKey);
    await request('POST', `/rooms/${room.id}/presence`, {
      token: reviewerToken,
      body: { state: 'working', note: 'validating local Community chat', ttlSec: 60 },
    });
    const envelope = await encryptText(ownerEpochKey, room.currentEpoch, messageText);
    const sent = await request('POST', `/rooms/${room.id}/messages`, {
      token: ownerToken,
      body: { kind: 'message', envelope },
    });
    const seq = Number(sent.message?.seq);
    if (!Number.isInteger(seq) || seq < 1) throw new Error('community_chatv3_send_shape_invalid');
    const messages = await request('GET', `/rooms/${room.id}/messages?afterSeq=0`, { token: reviewerToken });
    const received = Array.isArray(messages) ? messages.find((message) => message?.seq === seq) : null;
    if (!received || await decryptText(reviewerEpochKey, received) !== messageText) {
      throw new Error('community_chatv3_message_roundtrip_failed');
    }
    await request('POST', `/rooms/${room.id}/delivered`, { token: reviewerToken, body: { deliveredSeq: seq } });
    await request('POST', `/rooms/${room.id}/read`, { token: reviewerToken, body: { lastReadSeq: seq } });
    const members = await request('GET', `/channels/${channelId}/members?status=active`, { token: ownerToken });
    const presence = await request('GET', `/rooms/${room.id}/presence`, { token: ownerToken });
    if (!Array.isArray(members) || members.length !== 2) throw new Error(`community_chatv3_member_count_mismatch:${members?.length ?? -1}`);
    if (!Array.isArray(presence) || !presence.some((entry) => entry?.state === 'working')) {
      throw new Error('community_chatv3_presence_roundtrip_failed');
    }
    completed = true;
    return {
      status: 'community-chatv3-smoke-passed',
      channel: true,
      room: true,
      invite: true,
      members: members.length,
      messageSeq: seq,
      presence: 'working',
      encryptionMode: 'server-encrypted-local-trusted',
      transport: 'direct-http',
    };
  } finally {
    if (channelId && ownerToken) {
      await request('DELETE', `/channels/${channelId}`, {
        token: ownerToken,
        body: { confirmSlug: slug },
      }).catch((error) => {
        if (completed) throw error;
      });
    }
  }
}

if (typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await runCommunityChatv3Smoke(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`[community-chatv3-smoke] ${redactCommunityChatv3Log(error.message)}\n`); process.exitCode = 1; }
}
