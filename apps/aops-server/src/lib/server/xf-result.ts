export type XfMessage = {
  messageText: string
  opts?: Record<string, unknown>
}

export type XfResult<T> = {
  ok: boolean
  data?: T
  messages?: XfMessage[]
}

export function okResult<T>(data: T, messageText?: string): XfResult<T> {
  return {
    ok: true,
    data,
    messages: messageText ? [{ messageText }] : undefined,
  }
}

export function errResult(messageText: string, opts?: Record<string, unknown>): XfResult<null> {
  return {
    ok: false,
    data: null,
    messages: [{ messageText, opts }],
  }
}
