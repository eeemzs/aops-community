import { describe, expect, it } from 'vitest'
import { ProjectmanCockpitClient } from '../client.js'

type Capture = { url?: string; auth?: string | null; project?: string | null; scope?: string | null }
const fetchStub = (capture: Capture, body: unknown) =>
  (async (url: unknown, init?: unknown) => {
    const h = new Headers((init as RequestInit)?.headers)
    capture.url = String(url)
    capture.auth = h.get('authorization')
    capture.project = h.get('x-project-id')
    capture.scope = h.get('x-scope-id')
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

describe('ProjectmanCockpitClient', () => {
  it('builds /api/projectman routes and unwraps the {ok,data} envelope', async () => {
    const cap: { url?: string } = {}
    const client = new ProjectmanCockpitClient({
      serverBaseUrl: 'https://aops.example.com/',
      fetchImpl: fetchStub(cap, { ok: true, data: [{ id: 'b1', name: 'Board One' }] }),
    })
    const boards = await client.listBoards()
    expect(boards).toEqual([{ id: 'b1', name: 'Board One' }])
    expect(cap.url).toBe('https://aops.example.com/api/projectman/kanban-boards')
  })

  it('selects scope via x-project-id / x-scope-id HEADERS, not a query param', async () => {
    const cap: Capture = {}
    const client = new ProjectmanCockpitClient({
      serverBaseUrl: 'https://aops.example.com',
      projectId: 'proj-1',
      scopeId: 'scope-1',
      fetchImpl: fetchStub(cap, { ok: true, data: [] }),
    })
    await client.listReviewRequests()
    expect(cap.project).toBe('proj-1')
    expect(cap.scope).toBe('scope-1')
    // no scope in the URL — the host resolves it from the headers
    expect(cap.url).toBe('https://aops.example.com/api/projectman/review-requests')
  })

  it('still passes genuine list filters as a query string and drops empty values', async () => {
    const cap: Capture = {}
    const client = new ProjectmanCockpitClient({
      serverBaseUrl: 'https://aops.example.com',
      fetchImpl: fetchStub(cap, { ok: true, data: [] }),
    })
    await client.listReviewRequests({ status: 'changes_requested', project: '' })
    expect(cap.url).toBe('https://aops.example.com/api/projectman/review-requests?status=changes_requested')
  })

  it('completes the list+get surface for issue and feedback (review issue 047499aa)', () => {
    const client = new ProjectmanCockpitClient({ serverBaseUrl: 'https://x' })
    for (const m of ['getIssue', 'getFeedback', 'listIssues', 'listFeedback']) {
      expect(typeof (client as unknown as Record<string, unknown>)[m]).toBe('function')
    }
  })

  it('attaches a Bearer token when an access token is provided', async () => {
    const cap: { auth?: string | null } = {}
    const client = new ProjectmanCockpitClient({
      serverBaseUrl: 'https://aops.example.com',
      accessToken: 'jwt-abc',
      fetchImpl: fetchStub(cap, { ok: true, data: { id: 'rr1', results: [] } }),
    })
    await client.getReviewRequest('rr1')
    expect(cap.auth).toBe('Bearer jwt-abc')
  })

  it('is read-only: exposes no create/update/delete methods', () => {
    const client = new ProjectmanCockpitClient({ serverBaseUrl: 'https://x' })
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
    expect(methods.some((m) => /create|update|delete|archive|remove|post|patch/i.test(m))).toBe(false)
  })
})
