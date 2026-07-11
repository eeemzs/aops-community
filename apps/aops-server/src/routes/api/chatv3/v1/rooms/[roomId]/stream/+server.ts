import type { RequestHandler } from '@sveltejs/kit'
import { handleChatv3SseRequest } from '@aopslab/domain-host-plugin-chatv3'

// Dedicated SSE route: the generic /api/[domain] dispatcher returns JSON
// envelopes, while SSE needs a streaming Response. This static route shadows
// only the stream path; everything else stays on the dispatcher. EventSource
// cannot set headers, so the member token may arrive as ?token=.
export const GET: RequestHandler = async (event) => {
  const token =
    event.url.searchParams.get('token') ??
    event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null
  return handleChatv3SseRequest({ token, signal: event.request.signal })
}
