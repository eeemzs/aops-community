import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types runner executes the source module directly.
import { parseRouteInvokeInput } from './helpers.ts'

test('preserves a domain-owned scalar query argument', () => {
  const parsed = parseRouteInvokeInput({ query: 'kanban sprint', limit: 3 })

  assert.deepEqual(parsed.body, { query: 'kanban sprint', limit: 3 })
  assert.equal(parsed.query.size, 0)
})

test('preserves a query-only domain operation input', () => {
  const parsed = parseRouteInvokeInput({ query: 'project planning' })

  assert.deepEqual(parsed.body, { query: 'project planning' })
  assert.equal(parsed.query.size, 0)
})

test('continues to parse the explicit route envelope', () => {
  const parsed = parseRouteInvokeInput({
    pathParams: { id: 'skill-1' },
    query: { limit: 2 },
    body: { status: 'published' },
    context: { scopeId: 'scope-1' },
  })

  assert.deepEqual(parsed.pathParams, { id: 'skill-1' })
  assert.equal(parsed.query.get('limit'), '2')
  assert.deepEqual(parsed.body, { status: 'published' })
  assert.deepEqual(parsed.context, { scopeId: 'scope-1' })
})
