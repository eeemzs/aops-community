import { describe, beforeAll, afterAll, it, expect } from 'vitest'
import { Effect } from 'effect'
import { randomUUID } from 'node:crypto'

import { TestStateStatus } from '@aopslab/xf-core/test'

import {
  cleanupProjectmanTenant,
  shutdownProjectmanTestKit,
  tryCreateProjectmanTestKit,
  type ProjectmanTestKitContext,
} from './projectman-test-kit.js'

describe('projectman-kit integration: kanban tasks + sprint flow (pg)', () => {
  const testState: Record<string, TestStateStatus> = {
    setup: TestStateStatus.NOT_STARTED,
    flow: TestStateStatus.NOT_STARTED,
    guards: TestStateStatus.NOT_STARTED,
    microtaskOps: TestStateStatus.NOT_STARTED,
    planLock: TestStateStatus.NOT_STARTED,
    history: TestStateStatus.NOT_STARTED,
  }

  let ctx: ProjectmanTestKitContext | null = null
  let skipSuite = false

  let scopeId: string | undefined
  let historyProjectId: string | undefined
  let boardId: string | undefined
  let boardId2: string | undefined
  let boardColumnId: string | undefined
  let boardColumnId2: string | undefined
  let boardColumnId3: string | undefined
  let boardColumnIdCross: string | undefined

  const currentCtx = () => {
    if (!ctx) throw new Error('projectman test ctx is not initialized')
    return ctx
  }

  const currentScopeId = () => scopeId ?? randomUUID()
  const currentBoardId = () => boardId ?? randomUUID()
  const currentBoardId2 = () => boardId2 ?? randomUUID()
  const currentBoardColumnId = () => boardColumnId ?? randomUUID()
  const currentBoardColumnId2 = () => boardColumnId2 ?? randomUUID()
  const currentBoardColumnId3 = () => boardColumnId3 ?? randomUUID()
  const currentBoardColumnIdCross = () => boardColumnIdCross ?? randomUUID()

  async function createTask(overrides: Record<string, unknown> = {}) {
    const services = currentCtx().services
    return Effect.runPromise(
      services.kanbanTaskService.createTask({
        scopeId: currentScopeId(),
        boardId: currentBoardId(),
        boardColumnId: currentBoardColumnId(),
        title: `Task ${randomUUID().slice(0, 8)}`,
        ...overrides,
      } as any),
    )
  }

  async function createSprintForTask(taskId: string, overrides: Record<string, unknown> = {}) {
    const services = currentCtx().services
    return Effect.runPromise(
      services.sprintService.createSprint({
        scopeId: currentScopeId(),
        kanbanTaskId: taskId,
        name: `Sprint ${randomUUID().slice(0, 8)}`,
        goal: 'Integration test sprint',
        ...overrides,
      } as any),
    )
  }

  beforeAll(async () => {
    testState.setup = TestStateStatus.IN_PROGRESS

    const created = await tryCreateProjectmanTestKit({ label: 'kanban-tasks-sprint' })
    if (!created.ok) {
      skipSuite = true
      testState.setup = TestStateStatus.SKIPPED
      console.warn('[projectman-kit:test] skipping suite:', created.reason)
      return
    }

    ctx = created.ctx
    await cleanupProjectmanTenant(ctx)

    const { kanbanBoardService, kanbanColumnService, kanbanBoardColumnService } =
      ctx.services

    const wid = randomUUID()
    scopeId = wid
    historyProjectId = randomUUID()

    const board = await Effect.runPromise(
      kanbanBoardService.createBoard({
        scopeId: wid,
        name: `General ${ctx.tenantId.slice(0, 6)}`,
      } as any),
    )
    boardId = String((board as any).id ?? '')

    const board2 = await Effect.runPromise(
      kanbanBoardService.createBoard({
        scopeId: wid,
        name: `Secondary ${ctx.tenantId.slice(0, 6)}`,
      } as any),
    )
    boardId2 = String((board2 as any).id ?? '')

    const todoColumn = await Effect.runPromise(
      kanbanColumnService.createColumn({
        scopeId: wid,
        name: 'Todo',
        slug: 'todo',
      } as any),
    )
    const todoColumnId = String((todoColumn as any).id ?? '')

    const todoBoardColumn = await Effect.runPromise(
      kanbanBoardColumnService.addColumnToBoard({
        scopeId: wid,
        boardId: boardId,
        columnId: todoColumnId,
      } as any),
    )
    boardColumnId = String((todoBoardColumn as any).id ?? '')

    const doingColumn = await Effect.runPromise(
      kanbanColumnService.createColumn({
        scopeId: wid,
        name: 'Doing',
        slug: 'doing',
      } as any),
    )
    const doingColumnId = String((doingColumn as any).id ?? '')

    const doingBoardColumn = await Effect.runPromise(
      kanbanBoardColumnService.addColumnToBoard({
        scopeId: wid,
        boardId: boardId,
        columnId: doingColumnId,
      } as any),
    )
    boardColumnId2 = String((doingBoardColumn as any).id ?? '')

    const doneColumn = await Effect.runPromise(
      kanbanColumnService.createColumn({
        scopeId: wid,
        name: 'Done',
        slug: 'done',
      } as any),
    )
    const doneColumnId = String((doneColumn as any).id ?? '')

    const doneBoardColumn = await Effect.runPromise(
      kanbanBoardColumnService.addColumnToBoard({
        scopeId: wid,
        boardId: boardId,
        columnId: doneColumnId,
      } as any),
    )
    boardColumnId3 = String((doneBoardColumn as any).id ?? '')

    const crossBoardColumn = await Effect.runPromise(
      kanbanBoardColumnService.addColumnToBoard({
        scopeId: wid,
        boardId: boardId2,
        columnId: doneColumnId,
      } as any),
    )
    boardColumnIdCross = String((crossBoardColumn as any).id ?? '')

    testState.setup = TestStateStatus.COMPLETED
  })

  afterAll(async () => {
    try {
      if (ctx && !skipSuite) {
        await cleanupProjectmanTenant(ctx)
      }
    } finally {
      await shutdownProjectmanTestKit(ctx ?? undefined)
      const summary = Object.entries(testState)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      ctx?.logger?.info({ summary }, '[projectman-kit:test] suite summary')
    }
  })

  it('handles kanban task moves and sprint-linked issue feedback flow', { timeout: 90_000 }, async () => {
    if (skipSuite || !ctx) {
      expect(true).toBe(true)
      return
    }

    testState.flow = TestStateStatus.IN_PROGRESS

    const services = currentCtx().services
    const task1 = await createTask({
      boardId: currentBoardId(),
      boardColumnId: currentBoardColumnId(),
      title: 'Setup backlog',
      slug: ' Setup Backlog / Seed ',
    })
    const task2 = await createTask({
      boardId: currentBoardId(),
      boardColumnId: currentBoardColumnId(),
      title: 'Investigate sprint flow',
    })

    const ordered = await Effect.runPromise(
      services.kanbanTaskService.listTasks({
        boardColumnId: currentBoardColumnId(),
      } as any),
    )
    expect(ordered.length).toBeGreaterThanOrEqual(2)
    expect((task1 as any).slug).toBe('setup-backlog-seed')
    expect((task1 as any).taskCode).toMatch(/^TASK-\d+$/)

    const reorderedCount = await Effect.runPromise(
      services.kanbanTaskService.reorderTasksInColumn(
        currentBoardColumnId(),
        [String((task2 as any).id ?? ''), String((task1 as any).id ?? '')],
      ),
    )
    expect(reorderedCount).toBe(2)

    const moved = await Effect.runPromise(
      services.kanbanTaskService.moveTaskToColumn(
        String((task1 as any).id ?? ''),
        currentBoardColumnId2(),
        undefined,
      ),
    )
    expect((moved as any).boardColumnId).toBe(currentBoardColumnId2())
    expect((moved as any).boardId).toBe(currentBoardId())

    const clearedGroupMove = await Effect.runPromise(
      services.kanbanTaskService.moveTaskToColumn(
        String((task2 as any).id ?? ''),
        currentBoardColumnId3(),
        undefined,
      ),
    )
    expect((clearedGroupMove as any).boardColumnId).toBe(currentBoardColumnId3())

    const movedAcrossBoard = await Effect.runPromise(
      services.kanbanTaskService.moveTaskToColumn(
        String((task2 as any).id ?? ''),
        currentBoardColumnIdCross(),
      ),
    )
    expect((movedAcrossBoard as any).boardColumnId).toBe(currentBoardColumnIdCross())
    expect((movedAcrossBoard as any).boardId).toBe(currentBoardId2())

    const sprint = await createSprintForTask(String((task1 as any).id ?? ''), {
      name: 'Sprint 1',
      goal: 'Exercise sprint-linked records',
    })
    const sprintId = String((sprint as any).id ?? '')

    const withMicrotask = await Effect.runPromise(
      services.sprintService.addMicrotask(sprintId, {
        phase: 'Main',
        title: 'Break down task',
        status: 'todo',
      }),
    )
    const addedMicrotask = withMicrotask.phases[0]?.microtasks[0]
    expect(addedMicrotask?.title).toBe('Break down task')

    const updatedSprint = await Effect.runPromise(
      services.sprintService.updateMicrotaskStatus(sprintId, {
        microtaskId: String(addedMicrotask?.id ?? ''),
        status: 'doing',
      }),
    )
    const updatedMicrotask = updatedSprint.phases[0]?.microtasks.find((item: any) => item?.id === addedMicrotask?.id)
    expect(updatedMicrotask?.status).toBe('doing')

    const issue = await Effect.runPromise(
      services.issueItemService.createIssue({
        scopeId: currentScopeId(),
        sprintId,
        kanbanTaskId: String((task1 as any).id ?? ''),
        title: 'Retry loop observed',
        severity: 'high',
        source: 'agent',
        tags: ['agent', 'automation'],
      } as any),
    )
    const feedback = await Effect.runPromise(
      services.feedbackItemService.createFeedback({
        scopeId: currentScopeId(),
        sprintId,
        kanbanTaskId: String((task1 as any).id ?? ''),
        title: 'Name can be simplified',
        type: 'refactor',
        severity: 'medium',
        source: 'agent',
        tags: ['refactor', 'agent'],
      } as any),
    )

    const listedIssues = await Effect.runPromise(
      services.issueItemService.listIssues({ sprintId } as any),
    )
    const listedFeedback = await Effect.runPromise(
      services.feedbackItemService.listFeedback({ sprintId } as any),
    )
    expect(listedIssues.some((item: any) => item?.id === (issue as any).id)).toBe(true)
    expect(listedFeedback.some((item: any) => item?.id === (feedback as any).id)).toBe(true)

    testState.flow = TestStateStatus.COMPLETED
  })

  it('allows multiple sequential sprint documents under one kanban task', { timeout: 90_000 }, async () => {
    if (skipSuite || !ctx) {
      expect(true).toBe(true)
      return
    }

    const services = currentCtx().services
    const task = await createTask({
      title: `Multi-sprint task ${randomUUID().slice(0, 8)}`,
    })
    const taskId = String((task as any).id ?? '')

    const sprint1 = await createSprintForTask(taskId, {
      name: `Multi Sprint 1 ${randomUUID().slice(0, 8)}`,
      goal: 'First sequential execution window',
    })
    const sprint2 = await createSprintForTask(taskId, {
      name: `Multi Sprint 2 ${randomUUID().slice(0, 8)}`,
      goal: 'Second sequential execution window',
    })

    expect(String((sprint1 as any).id ?? '')).not.toBe(String((sprint2 as any).id ?? ''))
    expect((sprint1 as any).kanbanTaskId).toBe(taskId)
    expect((sprint2 as any).kanbanTaskId).toBe(taskId)

    const listed = await Effect.runPromise(
      services.sprintService.listSprints({ kanbanTaskId: taskId } as any),
    )
    const sprintIds = listed.map((item: any) => String(item?.id ?? ''))
    expect(sprintIds).toEqual(expect.arrayContaining([
      String((sprint1 as any).id ?? ''),
      String((sprint2 as any).id ?? ''),
    ]))

    const linkedTask = await Effect.runPromise(
      services.kanbanTaskService.getById(taskId) as any,
    )
    expect((linkedTask as any)?.sprintId).toBe(String((sprint2 as any).id ?? ''))
  })

  it('surfaces Sprint V2 guardrails for unsupported template and copy flows', { timeout: 90_000 }, async () => {
    if (skipSuite || !ctx) {
      expect(true).toBe(true)
      return
    }

    testState.guards = TestStateStatus.IN_PROGRESS

    const services = currentCtx().services
    const template = await Effect.runPromise(
      services.kanbanTemplateService.createTemplate({
        scopeId: currentScopeId(),
        name: `Guard Template ${randomUUID().slice(0, 8)}`,
        definition: {
          boards: [
            {
              name: 'Board',
              columns: [{ name: 'Todo', slug: 'todo' }],
            },
          ],
        },
      } as any),
    )

    await expect(
      Effect.runPromise(
        services.kanbanTemplateService.applyTemplateToProject(
          String((template as any).id ?? ''),
          historyProjectId ?? randomUUID(),
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('kanban_template_apply_requires_column_scope_migration'),
    })

    const task = await createTask({
      title: `Guard task ${randomUUID().slice(0, 8)}`,
    })
    const sprint = await createSprintForTask(String((task as any).id ?? ''), {
      name: `Guard sprint ${randomUUID().slice(0, 8)}`,
    })
    const sprintId = String((sprint as any).id ?? '')

    const withMicrotask = await Effect.runPromise(
      services.sprintService.addMicrotask(sprintId, {
        phase: 'Main',
        title: 'Unsupported copy candidate',
      }),
    )
    const microtaskId = String(withMicrotask.phases[0]?.microtasks[0]?.id ?? '')

    await expect(
      Effect.runPromise(
        services.microTaskItemService.copyMicroTask(microtaskId, {
          phaseId: String(withMicrotask.phases[0]?.id ?? ''),
        } as any),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('not supported in Sprint V2'),
    })

    await expect(
      Effect.runPromise(
        services.sprintService.moveSprint(sprintId, { projectId: randomUUID() } as any),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('not supported in Sprint V2'),
    })

    await expect(
      Effect.runPromise(
        services.sprintService.copySprint(sprintId, { projectId: randomUUID() } as any),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('not supported in Sprint V2'),
    })

    testState.guards = TestStateStatus.COMPLETED
  })

  it('adds, updates, and deletes sprint microtasks incrementally', { timeout: 90_000 }, async () => {
    if (skipSuite || !ctx) {
      expect(true).toBe(true)
      return
    }

    testState.microtaskOps = TestStateStatus.IN_PROGRESS

    const services = currentCtx().services
    const task = await createTask({
      title: `Microtask ops task ${randomUUID().slice(0, 8)}`,
    })
    const sprint = await createSprintForTask(String((task as any).id ?? ''), {
      name: `Microtask Ops Sprint ${randomUUID().slice(0, 8)}`,
      goal: 'Incremental sprint microtask operations',
    })
    const sprintId = String((sprint as any).id ?? '')

    await Effect.runPromise(
      services.sprintService.addMicrotask(sprintId, {
        phase: 'Main',
        title: 'Ilk utask',
        status: 'todo',
      }),
    )
    await Effect.runPromise(
      services.sprintService.addMicrotask(sprintId, {
        phase: 'Main',
        title: 'Ikinci utask',
        status: 'todo',
      }),
    )
    const withInserted = await Effect.runPromise(
      services.sprintService.addMicrotask(sprintId, {
        phase: 'Main',
        title: 'Araya giren utask',
        status: 'doing',
        position: 1,
      }),
    )

    const orderedAfterInsert = withInserted.phases[0]?.microtasks.map((item: any) => item?.title) ?? []
    expect(orderedAfterInsert).toEqual(['Ilk utask', 'Araya giren utask', 'Ikinci utask'])

    const insertedMicrotask = withInserted.phases[0]?.microtasks.find((item: any) => item?.title === 'Araya giren utask')
    expect(insertedMicrotask?.position).toBe(1)

    const updated = await Effect.runPromise(
      services.sprintService.updateMicrotask(sprintId, {
        microtaskId: String(insertedMicrotask?.id ?? ''),
        title: 'Araya giren utask guncel',
        status: 'completed',
        notes: 'Validation done',
      }),
    )

    const updatedMicrotask = updated.phases[0]?.microtasks.find((item: any) => item?.id === insertedMicrotask?.id)
    expect(updatedMicrotask?.title).toBe('Araya giren utask guncel')
    expect(updatedMicrotask?.status).toBe('completed')
    expect(updatedMicrotask?.notes).toBe('Validation done')

    const afterDelete = await Effect.runPromise(
      services.sprintService.deleteMicrotask(sprintId, {
        microtaskId: String(insertedMicrotask?.id ?? ''),
      }),
    )

    const remainingTitles = afterDelete.phases[0]?.microtasks.map((item: any) => item?.title) ?? []
    const remainingPositions = afterDelete.phases[0]?.microtasks.map((item: any) => item?.position) ?? []
    expect(remainingTitles).toEqual(['Ilk utask', 'Ikinci utask'])
    expect(remainingPositions).toEqual([0, 1])

    testState.microtaskOps = TestStateStatus.COMPLETED
  })

  it('rejects stale sprint.update-plan writes when expectedUpdatedAt is outdated', { timeout: 90_000 }, async () => {
    if (skipSuite || !ctx) {
      expect(true).toBe(true)
      return
    }

    testState.planLock = TestStateStatus.IN_PROGRESS

    const services = currentCtx().services
    const task = await createTask({
      title: `Plan lock task ${randomUUID().slice(0, 8)}`,
    })
    const sprint = await createSprintForTask(String((task as any).id ?? ''), {
      name: `Plan lock sprint ${randomUUID().slice(0, 8)}`,
      goal: 'Protect replace-plan writes against stale snapshots',
    })

    const initialUpdatedAt = new Date((sprint as any).updatedAt ?? Date.now()).toISOString()
    expect(initialUpdatedAt).not.toBe('')

    const firstUpdate = await Effect.runPromise(
      services.sprintService.updatePlan(String((sprint as any).id ?? ''), {
        expectedUpdatedAt: initialUpdatedAt,
        notes: 'Fresh snapshot write',
      }),
    )

    expect(firstUpdate.notes).toBe('Fresh snapshot write')
    expect(String(firstUpdate.updatedAt ?? '')).not.toBe(initialUpdatedAt)

    let staleError: unknown = null
    try {
      await Effect.runPromise(
        services.sprintService.updatePlan(String((sprint as any).id ?? ''), {
          expectedUpdatedAt: initialUpdatedAt,
          notes: 'This write should conflict',
        }),
      )
    } catch (error) {
      staleError = error
    }

    expect(staleError).toBeTruthy()
    expect(String(staleError)).toContain('stale snapshot')

    testState.planLock = TestStateStatus.COMPLETED
  })

  it('preserves canonical completed microtask status and rejects invalid done aliases in sprint plans', { timeout: 90_000 }, async () => {
    if (skipSuite || !ctx) {
      expect(true).toBe(true)
      return
    }

    const services = currentCtx().services
    const task = await createTask({
      title: `Plan status task ${randomUUID().slice(0, 8)}`,
    })
    const sprint = await createSprintForTask(String((task as any).id ?? ''), {
      name: `Plan status sprint ${randomUUID().slice(0, 8)}`,
      goal: 'Preserve completed and reject invalid aliases',
      phases: [
        {
          name: 'Main',
          microtasks: [{ title: 'Canonical completed utask', status: 'completed' }],
        },
      ],
    })

    const createdMicrotask = sprint.phases[0]?.microtasks[0]
    expect(createdMicrotask?.status).toBe('completed')

    const updated = await Effect.runPromise(
      services.sprintService.updatePlan(String((sprint as any).id ?? ''), {
        expectedUpdatedAt: new Date((sprint as any).updatedAt ?? Date.now()).toISOString(),
        phases: [
          {
            id: String(sprint.phases[0]?.id ?? ''),
            name: 'Main',
            microtasks: [
              {
                id: String(createdMicrotask?.id ?? ''),
                title: 'Canonical completed utask',
                status: 'completed',
              },
            ],
          },
        ],
      }),
    )

    expect(updated.phases[0]?.microtasks[0]?.status).toBe('completed')

    let invalidStatusError: unknown = null
    try {
      await Effect.runPromise(
        services.sprintService.updatePlan(String((updated as any).id ?? ''), {
          expectedUpdatedAt: new Date((updated as any).updatedAt ?? Date.now()).toISOString(),
          phases: [
            {
              id: String(updated.phases[0]?.id ?? ''),
              name: 'Main',
              microtasks: [
                {
                  id: String(updated.phases[0]?.microtasks[0]?.id ?? ''),
                  title: 'Canonical completed utask',
                  status: 'done' as any,
                },
              ],
            },
          ],
        }),
      )
    } catch (error) {
      invalidStatusError = error
    }

    expect(invalidStatusError).toBeTruthy()
    expect(String(invalidStatusError)).toContain('status')
  })

  it('creates and lists histories under the current scope/project filter', { timeout: 90_000 }, async () => {
    if (skipSuite || !ctx) {
      expect(true).toBe(true)
      return
    }

    testState.history = TestStateStatus.IN_PROGRESS

    const services = currentCtx().services
    const projectId = historyProjectId ?? randomUUID()
    const history = await Effect.runPromise(
      services.historyService.createHistory({
        scopeId: currentScopeId(),
        projectId,
        boardId: currentBoardId(),
        name: 'Sprint Timeline',
        slug: 'sprint-timeline',
        status: 'active',
        tags: ['timeline:history'],
      } as any),
    )

    const histories = await Effect.runPromise(
      services.historyService.listHistories({ projectId } as any),
    )

    expect((history as any).projectId).toBe(projectId)
    expect(histories.some((entry: any) => entry?.id === (history as any).id)).toBe(true)
    expect(histories.some((entry: any) => entry?.slug === 'sprint-timeline')).toBe(true)

    testState.history = TestStateStatus.COMPLETED
  })
})
