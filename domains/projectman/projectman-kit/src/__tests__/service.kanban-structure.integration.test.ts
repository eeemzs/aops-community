import { describe, beforeAll, afterAll, it, expect } from 'vitest'
import { Effect } from 'effect'
import { randomUUID } from 'node:crypto'

import { TestStateStatus } from '@aopslab/xf-core/test'

import { cleanupProjectmanTenant, shutdownProjectmanTestKit, tryCreateProjectmanTestKit, type ProjectmanTestKitContext } from './projectman-test-kit.js'

describe('projectman-kit integration: kanban structure (pg)', () => {
  const testState: Record<string, TestStateStatus> = {
    setup: TestStateStatus.NOT_STARTED,
    kanbanFlow: TestStateStatus.NOT_STARTED,
  }

  let ctx: ProjectmanTestKitContext | null = null
  let skipSuite = false

  let scopeId: string | undefined
  let boardId: string | undefined
  let columnId: string | undefined
  let boardColumnId: string | undefined

  beforeAll(async () => {
    testState.setup = TestStateStatus.IN_PROGRESS

    const created = await tryCreateProjectmanTestKit({ label: 'kanban-structure' })
    if (!created.ok) {
      skipSuite = true
      testState.setup = TestStateStatus.SKIPPED
      console.warn('[projectman-kit:test] skipping suite:', created.reason)
      return
    }

    ctx = created.ctx
    await cleanupProjectmanTenant(ctx)

    const { kanbanBoardService, kanbanColumnService, kanbanBoardColumnService } = ctx.services

    const wid = randomUUID()
    scopeId = wid

    const board = await Effect.runPromise(
      kanbanBoardService.createBoard({
        scopeId: wid,
        name: `General ${ctx.tenantId.slice(0, 6)}`,
        slug: ' General Board / Seed ',
      } as any)
    )
    boardId = (board as any).id
    expect((board as any).slug).toBe('general-board-seed')

    const column = await Effect.runPromise(
      kanbanColumnService.createColumn({
        scopeId: wid,
        name: 'Todo',
        slug: 'todo',
      } as any)
    )
    columnId = (column as any).id

    const boardColumn = await Effect.runPromise(
      kanbanBoardColumnService.addColumnToBoard({
        scopeId: wid,
        boardId: boardId ?? randomUUID(),
        columnId: columnId ?? randomUUID(),
      } as any)
    )
    boardColumnId = (boardColumn as any).id

    testState.setup = TestStateStatus.COMPLETED
  })

  afterAll(async () => {
    try {
      if (ctx && !skipSuite) {
        await cleanupProjectmanTenant(ctx)
      }
    } finally {
      await shutdownProjectmanTestKit(ctx ?? undefined)
      const summary = Object.entries(testState).map(([k, v]) => `${k}: ${v}`).join(', ')
      ctx?.logger?.info({ summary }, '[projectman-kit:test] suite summary')
    }
  })

  it('Kanban services: CRUD + reorder', { timeout: 90_000 }, async () => {
    if (skipSuite || !ctx) {
      expect(true).toBe(true)
      return
    }

    testState.kanbanFlow = TestStateStatus.IN_PROGRESS

    const wid = scopeId ?? randomUUID()
    const gid = boardId ?? randomUUID()
    const colId = columnId ?? randomUUID()
    const boardColId = boardColumnId ?? randomUUID()

    const groups = await Effect.runPromise(ctx.services.kanbanBoardService.listBoards({ scopeId: wid } as any) as any)
    expect(groups.some((g: any) => g?.id === gid)).toBe(true)
    expect(groups.some((g: any) => g?.slug === 'general-board-seed')).toBe(true)

    const updatedGroup = await Effect.runPromise(
      ctx.services.kanbanBoardService.updateBoard(gid, {
        description: 'updated',
        slug: ' General Board / Active ',
      } as any)
    )
    expect((updatedGroup as any).description).toBe('updated')
    expect((updatedGroup as any).slug).toBe('general-board-active')

    const columns = await Effect.runPromise(ctx.services.kanbanColumnService.listColumns({ scopeId: wid } as any) as any)
    expect(columns.some((c: any) => c?.id === colId)).toBe(true)

    const updatedColumn = await Effect.runPromise(
      ctx.services.kanbanColumnService.updateColumn(colId, { name: 'Todo+' } as any)
    )
    expect((updatedColumn as any).name).toBe('Todo+')

    const updatedBoardColumn = await Effect.runPromise(
      ctx.services.kanbanBoardColumnService.updateBoardColumn(boardColId, { position: 2 } as any)
    )
    expect((updatedBoardColumn as any).position).toBe(2)

    const reorderBoardColumns = await Effect.runPromise(
      ctx.services.kanbanBoardColumnService.reorderBoardColumns(gid, [boardColId])
    )
    expect(reorderBoardColumns).toBe(1)

    testState.kanbanFlow = TestStateStatus.COMPLETED
  })
})
