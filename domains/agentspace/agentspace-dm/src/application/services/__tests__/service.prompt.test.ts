import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'

import { PromptService } from '../service.prompt.js'

const makePromptRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
  deleteById: vi.fn(),
})

describe('PromptService', () => {
  it('normalizes projectId into scopeId for project-scoped prompt lists', async () => {
    const repo = makePromptRepo()
    repo.find.mockImplementation(() => Effect.succeed([]))

    const service = new PromptService({ promptRepository: repo as any })

    await Effect.runPromise(
      service.listPrompts({
        projectId: 'project-1',
        scopeResolution: 'explicit',
      } as any)
    )

    expect(repo.find).toHaveBeenCalledTimes(1)
    expect(repo.find.mock.calls[0][0]).toEqual({
      matchEq: {
        scopeId: 'project-1',
      },
      options: undefined,
    })
  })

  it('filters prompt tags by contains-all semantics instead of exact array equality', async () => {
    const repo = makePromptRepo()
    repo.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'prompt-1', scopeId: 'scope-1', name: 'Bootstrapper One', tags: ['aops', 'bootstrapper'] },
        { id: 'prompt-2', scopeId: 'scope-1', name: 'Plain Prompt', tags: ['aops'] },
        { id: 'prompt-3', scopeId: 'scope-1', name: 'Bootstrapper Two', tags: ['group:bootstrapper', 'bootstrapper'] },
      ])
    )

    const service = new PromptService({ promptRepository: repo as any })

    const rows = await Effect.runPromise(
      service.listPrompts({
        scopeId: 'scope-1',
        scopeResolution: 'explicit',
        tags: ['bootstrapper'],
      } as any, { limit: 1 } as any)
    )

    expect(repo.find).toHaveBeenCalledTimes(1)
    expect(repo.find.mock.calls[0][0]).toEqual({
      matchEq: {
        scopeId: 'scope-1',
      },
      options: undefined,
    })
    expect(rows.map((row) => row.id)).toEqual(['prompt-1'])
  })
})
