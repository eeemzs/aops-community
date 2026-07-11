import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
const CLI = path.resolve(process.env.COMMUNITY_CLI_PATH ?? path.resolve(import.meta.dirname, '../../apps/aops-cli/dist/main.js'));
export const redactCommunityChatv3Log = (value) => String(value).replace(/chv3:\/\/\S+/gi, '<redacted-invite>').replace(/([?&#](?:token|secret|key)=)[^&#\s]+/gi, '$1<redacted>');

function run(args, { allowFailure = false } = {}) {
  const label = redactCommunityChatv3Log(args.slice(0, 3).join(':'));
  const result = spawnSync(process.execPath, [CLI, ...args, '--api-base-url', API_BASE_URL, '--yes', '--json'], {
    encoding: 'utf8', windowsHide: true, shell: false,
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return { result, payload: null };
    throw new Error(`community_chatv3_cli_failed:${label}:${result.status}:${redactCommunityChatv3Log(`${result.stdout}\n${result.stderr}`).slice(-1200)}`);
  }
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { throw new Error(`community_chatv3_cli_json_invalid:${label}`); }
  return { result, payload };
}

export function runCommunityChatv3Smoke() {
  const parent = mkdtempSync(path.join(tmpdir(), 'aops-community-chatv3-'));
  const store = path.join(parent, 'sessions.json');
  const suffix = `${Date.now()}-${process.pid}`;
  const slug = `community-chat-smoke-${suffix}`;
  const ownerSession = `community-owner-${suffix}`;
  const reviewerSession = `community-reviewer-${suffix}`;
  let channelId = null;
  let completed = false;
  try {
    const created = run(['chatv3', 'channel', 'create', '--title', 'AOPS Community chat smoke', '--slug', slug, '--handle', 'demo-owner', '--mode', 'server-encrypted', '--session', ownerSession, '--save-session', '--store-path', store]);
    const invite = created.payload?.result?.invite;
    channelId = created.payload?.artifacts?.channelId ?? created.payload?.result?.channel?.id;
    if (typeof invite !== 'string' || !invite.startsWith('chv3://join/') || !channelId) throw new Error('community_chatv3_create_shape_invalid');
    run(['chatv3', 'join', invite, '--handle', 'demo-reviewer', '--session', reviewerSession, '--save-session', '--store-path', store]);
    run(['chatv3', 'presence', 'set', '--session', reviewerSession, '--room', 'general', '--state', 'working', '--note', 'validating local Community chat', '--store-path', store]);
    const sent = run(['chatv3', 'send', '--session', ownerSession, '--room', 'general', 'Community ChatV3 smoke message', '--mark-delivered', '--mark-read', '--store-path', store]);
    const seq = Number(sent.payload?.artifacts?.seq ?? sent.payload?.result?.message?.seq);
    if (!Number.isInteger(seq) || seq < 1) throw new Error('community_chatv3_send_shape_invalid');
    const read = run(['chatv3', 'read', '--session', reviewerSession, '--room', 'general', '--after-seq', '0', '--mark-delivered', '--mark-read', '--store-path', store]);
    const messages = read.payload?.result?.messages ?? [];
    if (!messages.some((message) => message?.seq === seq && message?.text === 'Community ChatV3 smoke message')) throw new Error('community_chatv3_message_roundtrip_failed');
    const members = run(['chatv3', 'member', 'list', '--session', ownerSession, '--status', 'active', '--store-path', store]);
    const roster = members.payload?.result?.members ?? members.payload?.result?.items ?? [];
    if (roster.length !== 2) throw new Error(`community_chatv3_member_count_mismatch:${roster.length}`);
    const presence = run(['chatv3', 'presence', 'list', '--session', ownerSession, '--room', 'general', '--store-path', store]);
    const states = presence.payload?.result?.presence ?? [];
    if (!states.some((entry) => entry?.state === 'working')) throw new Error('community_chatv3_presence_roundtrip_failed');
    completed = true;
    return { status: 'community-chatv3-smoke-passed', channel: true, room: true, invite: true, members: roster.length, messageSeq: seq, presence: 'working', encryptionMode: 'server-encrypted-local-trusted' };
  } finally {
    if (channelId) run(['chatv3', 'channel', 'delete', '--session', ownerSession, '--channel', channelId, '--confirm-slug', slug, '--store-path', store], { allowFailure: !completed });
    rmSync(parent, { recursive: true, force: true });
  }
}

if (typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(runCommunityChatv3Smoke(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`[community-chatv3-smoke] ${redactCommunityChatv3Log(error.message)}\n`); process.exitCode = 1; }
}
