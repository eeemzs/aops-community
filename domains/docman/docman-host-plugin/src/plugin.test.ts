import { describe, expect, it, vi } from 'vitest'

const {
  buildDocmanHostRouteProjectionMock,
  listDocmanOperationSpecsMock,
  parseDocmanToolInputMock,
  runDocmanKitOperationByTypedIdMock,
} = vi.hoisted(() => ({
  buildDocmanHostRouteProjectionMock: vi.fn(),
  listDocmanOperationSpecsMock: vi.fn(),
  parseDocmanToolInputMock: vi.fn((_: string, input: Record<string, unknown>) => input),
  runDocmanKitOperationByTypedIdMock: vi.fn(),
}))

vi.mock('@aopslab/domain-kit-docman', () => ({
  buildDocmanHostRouteProjection: buildDocmanHostRouteProjectionMock,
  listDocmanOperationSpecs: listDocmanOperationSpecsMock,
  parseDocmanToolInput: parseDocmanToolInputMock,
  runDocmanKitOperationByTypedId: runDocmanKitOperationByTypedIdMock,
}))

import { createDocmanPlugin } from './plugin.js'

describe('docman host plugin', () => {
  it('preserves explicit scopeId from route input for scope-aware custom routes', async () => {
    buildDocmanHostRouteProjectionMock.mockReturnValue([
      {
        id: 'docman.document-scope-search',
        method: 'GET',
        pattern: '/scopes/:id/documents/search',
        operation: 'document.scope.search',
        summary: 'Search documents in one scope',
      },
    ])
    listDocmanOperationSpecsMock.mockReturnValue([
      {
        operationId: 'document.scope.search',
        args: [
          { name: 'scopeId', optional: false },
          { name: 'q', optional: false },
        ],
      },
    ])

    const runner = vi.fn(async (_operationId: string, input: Record<string, unknown>) => input)
    const plugin = createDocmanPlugin({ defaultScopeId: 'scope-default', runner })
    const route = plugin.manifest.routes[0]

    const result = await plugin.execute({
      request: {
        method: 'GET',
        query: new URLSearchParams([['q', 'kickoff']]),
        body: undefined,
        context: {
          scopeId: 'scope-from-context',
        },
      },
      match: {
        route,
        params: { id: 'scope-from-route' },
      },
    })

    expect(parseDocmanToolInputMock).toHaveBeenCalledWith(
      'document.scope.search',
      expect.objectContaining({
        scopeId: 'scope-from-route',
        q: 'kickoff',
      }),
    )
    expect(runner).toHaveBeenCalledWith(
      'document.scope.search',
      expect.objectContaining({
        scopeId: 'scope-from-route',
        q: 'kickoff',
      }),
    )
    expect(result).toMatchObject({
      scopeId: 'scope-from-route',
      q: 'kickoff',
    })
  })
})
