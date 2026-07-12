import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

import { MEMORY_ITEM_KINDS } from '../../../domain/types.js'
import { memoryItemZodSchemaInsert } from '../../../domain/models/index.js'
import { MissionService } from '../service.mission.js'

describe('MissionService resume checkpoints', () => {
  it('accepts checkpoint as a hosted memory item kind', () => {
    expect(MEMORY_ITEM_KINDS).toContain('checkpoint')
    expect(() =>
      memoryItemZodSchemaInsert.parse({
        scopeId: 'scope-1',
        kind: 'checkpoint',
        durability: 'short',
        content: 'Session checkpoint.',
      }),
    ).not.toThrow()
  })

  it('projects mission-anchored checkpoints into current plus bounded recent summaries', async () => {
    const missionRepository = {
      findById: vi.fn(() =>
        Effect.succeed({
          id: 'mission-1',
          scopeId: 'scope-1',
          objective: 'Resume from checkpoint state.',
          status: 'active',
          activeImplementationPlanRef: { refType: 'projectman.sprint', refId: 'sprint-1' },
        }),
      ),
    }
    const memoryItemRepository = {
      find: vi.fn(() =>
        Effect.succeed([
          {
            id: 'mem-current',
            scopeId: 'scope-1',
            kind: 'checkpoint',
            durability: 'short',
            content: '# Session checkpoint\nCurrent implementation position.',
            tags: ['memory:checkpoint'],
            sourceType: 'agentspace.mission',
            sourceId: 'mission-1',
            createdAt: '2026-06-17T08:00:00.000Z',
            updatedAt: '2026-06-17T08:10:00.000Z',
            meta: {
              checkpointAs: 'session',
              supersedes: 'mem-old',
              checkpoint: {
                summary: 'Current checkpoint summary',
                position: 'Implementing S2',
                doneWork: ['S1 committed'],
                nextSteps: ['Open S2 RR'],
                sourceRefs: [{ refType: 'projectman.sprint', refId: 'sprint-1' }],
              },
            },
          },
          {
            id: 'mem-old',
            scopeId: 'scope-1',
            kind: 'checkpoint',
            durability: 'short',
            content: 'Older checkpoint.',
            sourceType: 'agentspace.mission',
            sourceId: 'mission-1',
            createdAt: '2026-06-17T07:00:00.000Z',
            updatedAt: '2026-06-17T07:05:00.000Z',
            meta: {
              checkpointAs: 'session',
              checkpoint: {
                summary: 'Older checkpoint summary',
              },
            },
          },
          {
            id: 'mem-note',
            scopeId: 'scope-1',
            kind: 'note',
            durability: 'short',
            content: 'Not a checkpoint.',
            sourceType: 'agentspace.mission',
            sourceId: 'mission-1',
            updatedAt: '2026-06-17T09:00:00.000Z',
          },
          {
            id: 'mem-milestone',
            scopeId: 'scope-1',
            kind: 'checkpoint',
            durability: 'short',
            content: 'Milestone-style checkpoint must not become session resume state.',
            sourceType: 'agentspace.mission',
            sourceId: 'mission-1',
            updatedAt: '2026-06-17T10:00:00.000Z',
            meta: {
              checkpointAs: 'milestone',
              checkpoint: {
                summary: 'Milestone checkpoint',
              },
            },
          },
        ]),
      ),
    }
    const service = new MissionService({
      missionRepository: missionRepository as any,
      memoryItemRepository: memoryItemRepository as any,
    })

    const pack = await Effect.runPromise(service.buildResumePack('mission-1', { limit: 2 }))

    expect(memoryItemRepository.find).toHaveBeenCalledWith({
      matchEq: {
        sourceType: 'agentspace.mission',
        sourceId: 'mission-1',
      },
      options: {
        limit: 16,
        sort: [{ field: 'updatedAt', type: 'desc' }],
      },
    })
    expect(pack.checkpoints.total).toBe(2)
    expect(pack.checkpoints.current).toMatchObject({
      id: 'mem-current',
      current: true,
      superseded: false,
      supersedes: 'mem-old',
      summary: 'Current checkpoint summary',
      position: 'Implementing S2',
      doneWork: ['S1 committed'],
      nextSteps: ['Open S2 RR'],
    })
    expect(pack.checkpoints.recent).toHaveLength(2)
    expect(pack.checkpoints.recent[1]).toMatchObject({
      id: 'mem-old',
      current: false,
      superseded: true,
    })
    expect(JSON.stringify(pack.checkpoints)).not.toContain('Not a checkpoint')
    expect(JSON.stringify(pack.checkpoints)).not.toContain('Milestone checkpoint')
  })

  it('removes missions through the repository delete path', async () => {
    const missionRepository = {
      deleteById: vi.fn(() => Effect.succeed(1)),
    }
    const service = new MissionService({
      missionRepository: missionRepository as any,
    })

    await Effect.runPromise(service.removeMission('mission-1'))

    expect(missionRepository.deleteById).toHaveBeenCalledWith('mission-1')
  })
})
