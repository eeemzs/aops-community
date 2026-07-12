import assert from 'node:assert/strict'
import test from 'node:test'

import { createAopsApiClient, joinUrl, normalizeBaseUrl, requestXfJson, resolveApiBaseUrl, xfMessage } from '../index.js'

test('normalizeBaseUrl strips trailing slashes', () => {
  assert.equal(normalizeBaseUrl('http://localhost:5900/'), 'http://localhost:5900')
  assert.equal(normalizeBaseUrl('http://localhost:5900///'), 'http://localhost:5900')
  assert.equal(normalizeBaseUrl('http://localhost:5900'), 'http://localhost:5900')
})

test('joinUrl joins base and subPath', () => {
  assert.equal(joinUrl('http://localhost:5900', 'api/health'), 'http://localhost:5900/api/health')
  assert.equal(joinUrl('http://localhost:5900/', '/api/health'), 'http://localhost:5900/api/health')
})

test('resolveApiBaseUrl prefers explicit input then env then default', () => {
  const prevBaseUrl = process.env.AOPS_API_BASE_URL
  const prevServer = process.env.AOPS_API_SERVER
  try {
    process.env.AOPS_API_BASE_URL = 'http://env.example.com///'
    process.env.AOPS_API_SERVER = 'http://ignored.example.com/'

    assert.equal(resolveApiBaseUrl('http://arg.example.com///'), 'http://arg.example.com')
    assert.equal(resolveApiBaseUrl(), 'http://env.example.com')

    delete process.env.AOPS_API_BASE_URL
    delete process.env.AOPS_API_SERVER
    assert.equal(resolveApiBaseUrl(), 'http://localhost:5900')
  } finally {
    if (prevBaseUrl === undefined) delete process.env.AOPS_API_BASE_URL
    else process.env.AOPS_API_BASE_URL = prevBaseUrl

    if (prevServer === undefined) delete process.env.AOPS_API_SERVER
    else process.env.AOPS_API_SERVER = prevServer
  }
})

test('xfMessage returns fallback for ok/null; otherwise joins messageText', () => {
  assert.equal(xfMessage(null, 'fallback'), 'fallback')
  assert.equal(xfMessage({ ok: true }, 'fallback'), 'fallback')
  assert.equal(
    xfMessage(
      { ok: false, messages: [{ messageText: 'a' }, { messageText: 'b' }] },
      'fallback'
    ),
    'a; b'
  )
  assert.equal(xfMessage({ ok: false, messages: [] }, 'fallback'), 'fallback')
})

test('requestXfJson returns null result when response is not JSON', async (t) => {
  const originalFetch = globalThis.fetch
  const mockFetch: typeof fetch = async () => {
    return new Response('not-json', { status: 200 })
  }

  globalThis.fetch = mockFetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const res = await requestXfJson('http://example.invalid/api', { method: 'GET' })
  assert.equal(res.status, 200)
  assert.equal(res.result, null)
  assert.equal(res.rawText, 'not-json')
})

test('requestXfJson aborts when timeoutMs elapses', async (t) => {
  const originalFetch = globalThis.fetch

  const abortingFetch: typeof fetch = async (_input, init) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = (init as any)?.signal as AbortSignal | undefined
      const abort = () => {
        const err = new Error('Aborted')
        ;(err as any).name = 'AbortError'
        reject(err)
      }

      if (signal?.aborted) return abort()
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  globalThis.fetch = abortingFetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  await assert.rejects(
    () => requestXfJson('http://example.invalid/api', { method: 'GET' }, { timeoutMs: 25 }),
    (err: any) => err?.name === 'AbortError'
  )
})

test('createAopsApiClient refreshes tokens on 401 and retries fetchJson', async (t) => {
  const originalFetch = globalThis.fetch
  let accessToken = 'old-access'
  let refreshToken = 'old-refresh'
  let refreshed: { accessToken: string; refreshToken: string; userId?: string } | null = null
  const calls: Array<{ url: string; auth?: string }> = []

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = (init as any)?.headers ?? {}
    const auth = (headers as any).authorization as string | undefined
    calls.push({ url, auth })

    if (url.includes('/api/auth/refresh')) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: { tokens: { xf_access: 'new-access', xf_refresh: 'new-refresh' }, userId: 'u1' },
        }),
        { status: 200 }
      )
    }

    if (url.includes('/api/test') && auth === 'Bearer old-access') {
      return new Response(JSON.stringify({ ok: false }), { status: 401 })
    }

    if (url.includes('/api/test') && auth === 'Bearer new-access') {
      return new Response(JSON.stringify({ hello: 'world' }), { status: 200 })
    }

    return new Response(JSON.stringify({ ok: false, error: 'unexpected_call' }), { status: 500 })
  }

  globalThis.fetch = mockFetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const client = createAopsApiClient({
    baseUrl: 'http://example.invalid',
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    onTokenRefresh: (tokens) => {
      refreshed = tokens
      accessToken = tokens.accessToken
      refreshToken = tokens.refreshToken
    },
  })

  const result = await client.fetchJson<{ hello: string }>('/api/test', { method: 'GET' })
  assert.deepEqual(result, { hello: 'world' })
  assert.deepEqual(refreshed, { accessToken: 'new-access', refreshToken: 'new-refresh', userId: 'u1' })

  // 1) initial request -> 401
  // 2) refresh -> 200
  // 3) retry -> 200
  assert.equal(calls.length, 3)
  assert.ok(calls[0].url.endsWith('/api/test'))
  assert.ok(calls[1].url.endsWith('/api/auth/refresh'))
  assert.ok(calls[2].url.endsWith('/api/test'))
})

test('createAopsApiClient dedupes concurrent refresh requests (single-flight)', async (t) => {
  const originalFetch = globalThis.fetch
  let accessToken = 'old-access'
  let refreshToken = 'old-refresh'
  const calls: Array<{ url: string; auth?: string }> = []

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = (init as any)?.headers ?? {}
    const auth = (headers as any).authorization as string | undefined
    calls.push({ url, auth })

    if (url.includes('/api/auth/refresh')) {
      // Keep the refresh promise pending long enough for other 401s to join it.
      await new Promise((r) => setTimeout(r, 25))
      return new Response(
        JSON.stringify({
          ok: true,
          data: { tokens: { xf_access: 'new-access', xf_refresh: 'new-refresh' }, userId: 'u1' },
        }),
        { status: 200 }
      )
    }

    if ((url.includes('/api/a') || url.includes('/api/b')) && auth === 'Bearer old-access') {
      return new Response(JSON.stringify({ ok: false }), { status: 401 })
    }

    if (url.includes('/api/a') && auth === 'Bearer new-access') {
      return new Response(JSON.stringify({ a: 1 }), { status: 200 })
    }

    if (url.includes('/api/b') && auth === 'Bearer new-access') {
      return new Response(JSON.stringify({ b: 2 }), { status: 200 })
    }

    return new Response(JSON.stringify({ ok: false, error: 'unexpected_call' }), { status: 500 })
  }

  globalThis.fetch = mockFetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const client = createAopsApiClient({
    baseUrl: 'http://example.invalid',
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    onTokenRefresh: (tokens) => {
      accessToken = tokens.accessToken
      refreshToken = tokens.refreshToken
    },
  })

  const [a, b] = await Promise.all([
    client.fetchJson<{ a: number }>('/api/a', { method: 'GET' }),
    client.fetchJson<{ b: number }>('/api/b', { method: 'GET' }),
  ])

  assert.deepEqual(a, { a: 1 })
  assert.deepEqual(b, { b: 2 })

  const refreshCalls = calls.filter((c) => c.url.includes('/api/auth/refresh'))
  assert.equal(refreshCalls.length, 1)
})
