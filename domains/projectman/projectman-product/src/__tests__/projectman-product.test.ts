import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runProjectmanKitOperationByTypedId: vi.fn(),
}))

vi.mock('@aopslab/domain-kit-projectman', () => ({
  runProjectmanKitOperationByTypedId: mocks.runProjectmanKitOperationByTypedId,
}))

import {
  applyProjectmanTemplateFlow,
  createProjectmanBoardColumnFlow,
  createProjectmanBoardFlow,
  createProjectmanFeedbackFlow,
  createProjectmanIssueFlow,
  createProjectmanSprintFlow,
  createProjectmanSprintMicrotaskFlow,
  createProjectmanTemplateFlow,
  createProjectmanTaskFlow,
  convertProjectmanFeedbackToIssueFlow,
  convertProjectmanFeedbackToTaskFlow,
  deleteProjectmanTemplateFlow,
  inferProjectmanFlowErrorStatus,
  moveProjectmanTaskFlow,
  repositionProjectmanTaskFlow,
  normalizeProjectmanFlowAction,
  updateProjectmanFeedbackFlow,
  updateProjectmanIssueFlow,
  updateProjectmanSprintMicrotaskStatusFlow,
  updateProjectmanSprintPlanFlow,
  updateProjectmanTemplateFlow,
  updateProjectmanTaskFlow,
} from '../index'

describe('projectman product controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes known flow actions', () => {
    expect(normalizeProjectmanFlowAction('create-board')).toBe('create-board')
    expect(normalizeProjectmanFlowAction(' apply-template ')).toBe('apply-template')
    expect(normalizeProjectmanFlowAction(' create-template ')).toBe('create-template')
    expect(normalizeProjectmanFlowAction(' update-template ')).toBe('update-template')
    expect(normalizeProjectmanFlowAction(' delete-template ')).toBe('delete-template')
    expect(normalizeProjectmanFlowAction(' create-column ')).toBe('create-column')
    expect(normalizeProjectmanFlowAction(' create-task ')).toBe('create-task')
    expect(normalizeProjectmanFlowAction(' update-task ')).toBe('update-task')
    expect(normalizeProjectmanFlowAction(' move-task ')).toBe('move-task')
    expect(normalizeProjectmanFlowAction(' reposition-task ')).toBe('reposition-task')
    expect(normalizeProjectmanFlowAction(' create-sprint ')).toBe('create-sprint')
    expect(normalizeProjectmanFlowAction(' create-sprint-microtask ')).toBe('create-sprint-microtask')
    expect(normalizeProjectmanFlowAction(' update-sprint-plan ')).toBe('update-sprint-plan')
    expect(normalizeProjectmanFlowAction(' update-sprint-microtask-status ')).toBe('update-sprint-microtask-status')
    expect(normalizeProjectmanFlowAction(' create-issue ')).toBe('create-issue')
    expect(normalizeProjectmanFlowAction(' update-issue ')).toBe('update-issue')
    expect(normalizeProjectmanFlowAction(' create-feedback ')).toBe('create-feedback')
    expect(normalizeProjectmanFlowAction(' update-feedback ')).toBe('update-feedback')
    expect(normalizeProjectmanFlowAction('unknown')).toBe('')
  })

  it('maps duplicate-name conflicts to 409', () => {
    expect(inferProjectmanFlowErrorStatus('A board with the same name already exists in this project.')).toBe(409)
    expect(inferProjectmanFlowErrorStatus('Sprint plan conflict: stale snapshot detected.')).toBe(409)
    expect(inferProjectmanFlowErrorStatus('Task could not be resolved.')).toBe(404)
    expect(inferProjectmanFlowErrorStatus('Issue could not be resolved.')).toBe(404)
    expect(inferProjectmanFlowErrorStatus('Feedback could not be resolved.')).toBe(404)
    expect(inferProjectmanFlowErrorStatus('unauthorized')).toBe(401)
    expect(inferProjectmanFlowErrorStatus('validation_failed')).toBe(400)
  })

  it('creates a board with linked columns', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'kanban-board.list') {
        return []
      }
      if (operationId === 'kanban-board.create') {
        return { id: 'board-1', name: 'Platform Board', slug: 'platform-board-main' }
      }
      if (operationId === 'kanban-column.create') {
        const name = String((input as Record<string, unknown>).name ?? '')
        return {
          id: `${name.toLowerCase().replace(/\s+/g, '-')}-column`,
          name,
          slug: String((input as Record<string, unknown>).slug ?? ''),
        }
      }
      if (operationId === 'kanban-board-column.create') {
        return { id: `board-column-${calls.length}` }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createProjectmanBoardFlow({
      projectId: 'project-1',
      name: 'Platform Board',
      slug: 'platform-board-main',
      description: 'Bootstrap board',
      columns: [
        { name: 'Todo' },
        { name: 'In Progress', slug: 'in-progress' },
        { name: 'Done' },
      ],
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-board.list',
      'kanban-board.create',
      'kanban-column.create',
      'kanban-board-column.create',
      'kanban-column.create',
      'kanban-board-column.create',
      'kanban-column.create',
      'kanban-board-column.create',
    ])
    expect(calls[1]?.input).toMatchObject({
      scopeId: 'project-1',
      project: 'project-1',
      name: 'Platform Board',
      slug: 'platform-board-main',
      description: 'Bootstrap board',
      position: 0,
    })
    expect(calls[2]?.input).toEqual({
      scopeId: 'project-1',
      name: 'Todo',
      slug: 'platform-board-main-todo',
    })
    expect(calls[3]?.input).toEqual({
      scopeId: 'project-1',
      board: 'board-1',
      column: 'todo-column',
      position: 0,
    })
    expect(result).toMatchObject({
      action: 'create-board',
      boardId: 'board-1',
      board: {
        id: 'board-1',
        projectId: 'project-1',
        name: 'Platform Board',
        slug: 'platform-board-main',
        description: 'Bootstrap board',
      },
      createdColumnCount: 3,
      createdGroupCount: 0,
    })
    expect(result.boardColumns).toEqual([
      { id: 'board-column-4', boardId: 'board-1', columnId: 'todo-column', position: 0 },
      { id: 'board-column-6', boardId: 'board-1', columnId: 'in-progress-column', position: 1 },
      { id: 'board-column-8', boardId: 'board-1', columnId: 'done-column', position: 2 },
    ])
    expect(result.agentHints.reminders).toContain(
      'Board, istenen kolon listesiyle olusturuldu.',
    )
  })

  it('creates the base four columns when a new board is created without column input', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-board.list') return []
      if (operationId === 'kanban-board.create') return { id: 'board-1', name: 'Default Board', slug: 'default-board' }
      if (operationId === 'kanban-column.create') {
        const name = String((input as Record<string, unknown>).name ?? '')
        return { id: `${name.toLowerCase()}-column`, name, slug: String((input as Record<string, unknown>).slug ?? '') }
      }
      if (operationId === 'kanban-board-column.create') return { id: `board-column-${calls.length}` }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createProjectmanBoardFlow({
      projectId: 'project-1',
      name: 'Default Board',
    })

    expect(result.columns).toEqual([
      { id: 'backlog-column', name: 'Backlog', slug: 'default-board-backlog', position: 0 },
      { id: 'todo-column', name: 'Todo', slug: 'default-board-todo', position: 1 },
      { id: 'doing-column', name: 'Doing', slug: 'default-board-doing', position: 2 },
      { id: 'done-column', name: 'Done', slug: 'default-board-done', position: 3 },
    ])
  })

  it('creates a new board after the highest existing position when board positions have gaps', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-board.list') {
        return [
          { id: 'board-1', name: 'A', position: 0 },
          { id: 'board-2', name: 'B', position: 2 },
          { id: 'board-3', name: 'C', position: 3 },
        ]
      }
      if (operationId === 'kanban-board.create') return { id: 'board-4', name: 'Gap-safe Board' }
      if (operationId === 'kanban-column.create') {
        const name = String((input as Record<string, unknown>).name ?? '')
        return { id: `${name.toLowerCase()}-column` }
      }
      if (operationId === 'kanban-board-column.create') return { id: `board-column-${calls.length}` }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await createProjectmanBoardFlow({
      projectId: 'project-1',
      name: 'Gap-safe Board',
    })

    expect(calls.find((entry) => entry.operationId === 'kanban-board.create')?.input).toMatchObject({
      position: 4,
    })
  })

  it('accepts scopeId as the canonical owner for board creation', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-board.list') return []
      if (operationId === 'kanban-board.create') return { id: 'board-scope-1', name: 'Scope Board', slug: 'scope-board' }
      if (operationId === 'kanban-column.create') {
        const name = String((input as Record<string, unknown>).name ?? '')
        return { id: `${name.toLowerCase()}-column`, name, slug: String((input as Record<string, unknown>).slug ?? '') }
      }
      if (operationId === 'kanban-board-column.create') return { id: `board-column-${calls.length}` }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createProjectmanBoardFlow({
      scopeId: 'scope-1',
      name: 'Scope Board',
    })

    expect(calls.find((entry) => entry.operationId === 'kanban-board.create')?.input).toMatchObject({
      project: 'scope-1',
      name: 'Scope Board',
    })
    expect(result).toMatchObject({
      boardId: 'board-scope-1',
      board: {
        projectId: 'scope-1',
        name: 'Scope Board',
      },
    })
  })

  it('derives scopeId from projectId through board create and bootstrap operations', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-board.list') return []
      if (operationId === 'kanban-column.list') return []
      if (operationId === 'kanban-board.create') return { id: 'board-1', name: 'Scoped Board' }
      if (operationId === 'kanban-column.create') {
        const name = String((input as Record<string, unknown>).name ?? '')
        return { id: `${name.toLowerCase()}-column` }
      }
      if (operationId === 'kanban-board-column.create') return { id: `board-column-${calls.length}` }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await createProjectmanBoardFlow({
      projectId: 'project-1',
      name: 'Scoped Board',
    })

    expect(calls[0]?.input).toEqual({
      scopeId: 'project-1',
      project: 'project-1',
    })
    expect(calls[1]?.input).toEqual({
      scopeId: 'project-1',
      project: 'project-1',
      name: 'Scoped Board',
      slug: undefined,
      description: undefined,
      position: 0,
    })
    expect(calls[2]?.input).toEqual({
      scopeId: 'project-1',
      name: 'Backlog',
      slug: 'scoped-board-backlog',
    })
    expect(calls[3]?.input).toEqual({
      scopeId: 'project-1',
      board: 'board-1',
      column: 'backlog-column',
      position: 0,
    })
  })

  it('creates board-owned columns even when another board already has the same canonical names', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-board.list') return [{ id: 'board-existing', name: 'Existing Board', slug: 'existing-board' }]
      if (operationId === 'kanban-board.create') return { id: 'board-1', name: 'Default Board', slug: 'default-board' }
      if (operationId === 'kanban-column.create') {
        const slug = String((input as Record<string, unknown>).slug ?? '')
        return { id: `${slug}-id`, name: String((input as Record<string, unknown>).name ?? ''), slug }
      }
      if (operationId === 'kanban-board-column.create') return { id: `board-column-${calls.length}` }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createProjectmanBoardFlow({
      projectId: 'project-1',
      name: 'Default Board',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-board.list',
      'kanban-board.create',
      'kanban-column.create',
      'kanban-board-column.create',
      'kanban-column.create',
      'kanban-board-column.create',
      'kanban-column.create',
      'kanban-board-column.create',
      'kanban-column.create',
      'kanban-board-column.create',
    ])
    expect(result.columns).toEqual([
      { id: 'default-board-backlog-id', name: 'Backlog', slug: 'default-board-backlog', position: 0 },
      { id: 'default-board-todo-id', name: 'Todo', slug: 'default-board-todo', position: 1 },
      { id: 'default-board-doing-id', name: 'Doing', slug: 'default-board-doing', position: 2 },
      { id: 'default-board-done-id', name: 'Done', slug: 'default-board-done', position: 3 },
    ])
  })

  it('rejects duplicate board names before create', async () => {
    mocks.runProjectmanKitOperationByTypedId.mockResolvedValueOnce([{ id: 'board-1', name: 'Platform Board' }])

    await expect(
      createProjectmanBoardFlow({
        projectId: 'project-1',
        name: 'Platform Board',
        columns: [{ name: 'Todo' }],
      }),
    ).rejects.toThrow('A board with the same name already exists in this project.')

    expect(mocks.runProjectmanKitOperationByTypedId).toHaveBeenCalledTimes(1)
  })

  it('rolls back the created board when column bootstrap fails', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'kanban-board.list') return []
      if (operationId === 'kanban-board.create') return { id: 'board-1' }
      if (operationId === 'kanban-column.create') {
        throw new Error('Column id missing for Todo.')
      }
      if (operationId === 'kanban-board.delete') return { boardId: 'board-1' }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await expect(
      createProjectmanBoardFlow({
        projectId: 'project-1',
        name: 'Platform Board',
        columns: [{ name: 'Todo' }],
      }),
    ).rejects.toThrow('Column id missing for Todo.')

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-board.list',
      'kanban-board.create',
      'kanban-column.create',
      'kanban-board.delete',
    ])
    expect(calls[3]?.input).toEqual({ id: 'board-1', scopeId: 'project-1' })
  })

  it('creates a column and links it to a board', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'kanban-board.list') {
        return [{ id: 'board-1', name: 'Delivery Board', slug: 'delivery-board' }]
      }
      if (operationId === 'kanban-column.create') {
        return { id: 'column-1' }
      }
      if (operationId === 'kanban-board-column.create') {
        return { id: 'board-column-1' }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createProjectmanBoardColumnFlow({
      boardId: 'board-1',
      name: 'Blocked',
      slug: 'blocked',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-board.list',
      'kanban-column.create',
      'kanban-board-column.create',
    ])
    expect(calls[0]?.input).toEqual({})
    expect(calls[1]?.input).toEqual({
      name: 'Blocked',
      slug: 'delivery-board-blocked',
    })
    expect(calls[2]?.input).toEqual({
      board: 'board-1',
      column: 'column-1',
    })
    expect(result).toMatchObject({
      action: 'create-column',
      boardId: 'board-1',
      columnId: 'column-1',
      boardColumnId: 'board-column-1',
      column: {
        id: 'column-1',
        name: 'Blocked',
        slug: 'delivery-board-blocked',
      },
    })
    expect(result.boardColumn).toEqual({
      id: 'board-column-1',
      boardId: 'board-1',
      columnId: 'column-1',
    })
  })

  it('rolls back an orphaned column when board link fails', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'kanban-board.list') {
        return [{ id: 'board-1', name: 'Delivery Board', slug: 'delivery-board' }]
      }
      if (operationId === 'kanban-column.create') {
        return { id: 'column-1' }
      }
      if (operationId === 'kanban-board-column.create') {
        throw new Error('board_link_failed')
      }
      if (operationId === 'kanban-column.delete') {
        return { id: 'column-1' }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await expect(
      createProjectmanBoardColumnFlow({
        boardId: 'board-1',
        name: 'Blocked',
      }),
    ).rejects.toThrow('board_link_failed')

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-board.list',
      'kanban-column.create',
      'kanban-board-column.create',
      'kanban-column.delete',
    ])
    expect(calls[3]?.input).toEqual({ id: 'column-1' })
  })

  it('applies a template and returns a hydrated board snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'kanban-board.list') {
        if (calls.filter((entry) => entry.operationId === 'kanban-board.list').length === 1) {
          return [{ id: 'board-existing', name: 'Existing Board' }]
        }
        return [
          { id: 'board-existing', name: 'Existing Board' },
          { id: 'board-new', name: 'Imported Board' },
        ]
      }
      if (operationId === 'kanban-template.apply') return { ok: true }
      if (operationId === 'kanban-column.list') {
        return [
          { id: 'column-1', name: 'Todo', slug: 'todo' },
          { id: 'column-2', name: 'Done', slug: 'done' },
        ]
      }
      if (operationId === 'kanban-board-column.list') {
        return [
          { id: 'board-column-1', boardId: 'board-new', columnId: 'column-1', position: 0 },
          { id: 'board-column-2', boardId: 'board-new', columnId: 'column-2', position: 1 },
        ]
      }
      if (operationId === 'kanban-task.list') {
        return [{ id: 'task-1', boardId: 'board-new', boardColumnId: 'board-column-1', title: 'Imported task' }]
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await applyProjectmanTemplateFlow({
      projectId: 'project-1',
      templateId: 'template-1',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-board.list',
      'kanban-template.apply',
      'kanban-board.list',
      'kanban-board.list',
      'kanban-column.list',
      'kanban-board-column.list',
      'kanban-task.list',
    ])
    expect(calls[1]?.input).toEqual({
      id: 'template-1',
      project: 'project-1',
      scopeId: 'project-1',
    })
    expect(result).toMatchObject({
      action: 'apply-template',
      projectId: 'project-1',
      templateId: 'template-1',
      createdBoardIds: ['board-new'],
      focusBoardId: 'board-new',
    })
    expect(result.boardColumns).toEqual([
      { id: 'board-column-1', boardId: 'board-new', columnId: 'column-1', position: 0 },
      { id: 'board-column-2', boardId: 'board-new', columnId: 'column-2', position: 1 },
    ])
    expect(result.tasks).toEqual([
      { id: 'task-1', boardId: 'board-new', boardColumnId: 'board-column-1', title: 'Imported task' },
    ])
  })

  it('creates, updates, and deletes template library snapshots', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'kanban-template.create') return { id: 'template-1' }
      if (operationId === 'kanban-template.update') return { ok: true }
      if (operationId === 'kanban-template.delete') return { ok: true }
      if (operationId === 'kanban-template.list') {
        const createCalls = calls.filter((entry) => entry.operationId === 'kanban-template.create').length
        const deleteCalls = calls.filter((entry) => entry.operationId === 'kanban-template.delete').length
        if (deleteCalls > 0) return []
        if (createCalls > 0) {
          return [{ id: 'template-1', name: 'Starter Template', description: 'Template desc', definition: { boards: [] } }]
        }
        return []
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const created = await createProjectmanTemplateFlow({
      projectId: 'project-1',
      name: 'Starter Template',
      description: 'Template desc',
      definition: { boards: [] },
    })
    const updated = await updateProjectmanTemplateFlow({
      projectId: 'project-1',
      templateId: 'template-1',
      name: 'Starter Template',
      description: 'Template desc',
      definition: { boards: [{ name: 'Main' }] },
    })
    const deleted = await deleteProjectmanTemplateFlow({
      projectId: 'project-1',
      templateId: 'template-1',
    })

    expect(created).toMatchObject({
      action: 'create-template',
      templateId: 'template-1',
      focusTemplateId: 'template-1',
    })
    expect(updated).toMatchObject({
      action: 'update-template',
      templateId: 'template-1',
      focusTemplateId: 'template-1',
    })
    expect(deleted).toMatchObject({
      action: 'delete-template',
      templateId: 'template-1',
      focusTemplateId: '',
      templates: [],
    })
  })

  it('converts feedback to an issue using canonical feedback context', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'feedback.get') {
        return {
          item: {
            id: 'feedback-1',
            title: 'Search is slow',
            suggestion: 'Optimize query plan',
            severity: 'high',
            sprintId: 'sprint-1',
            kanbanTaskId: 'task-1',
            microTaskId: 'micro-1',
            tags: ['perf'],
          },
        }
      }
      if (operationId === 'issue.create') {
        return { id: 'issue-1' }
      }
      if (operationId === 'issue.get') {
        return {
          item: {
            id: 'issue-1',
            projectId: 'project-1',
            title: 'Investigate search latency',
            status: 'open',
            severity: 'high',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await convertProjectmanFeedbackToIssueFlow({
      projectId: 'project-1',
      feedbackId: 'feedback-1',
      title: 'Investigate search latency',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['feedback.get', 'issue.create', 'issue.get'])
    expect(calls[1]?.input).toEqual({
      project: 'project-1',
      title: 'Investigate search latency',
      description: 'Optimize query plan',
      severity: 'high',
      source: 'human',
      kanbanTask: 'task-1',
      sprint: 'sprint-1',
      microTask: 'micro-1',
      tags: ['perf'],
    })
    expect(result).toMatchObject({
      action: 'convert-feedback-to-issue',
      projectId: 'project-1',
      feedbackId: 'feedback-1',
      issueId: 'issue-1',
      focusIssueId: 'issue-1',
      title: 'Investigate search latency',
      issue: {
        id: 'issue-1',
        title: 'Investigate search latency',
      },
    })
  })

  it('creates a task and returns the normalized task snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-task.create') {
        return { id: 'task-1' }
      }
      if (operationId === 'kanban-task.get') {
        return {
          item: {
            id: 'task-1',
            boardId: 'board-1',
            boardColumnId: 'board-column-1',
            title: 'Implement API',
            description: 'Finish endpoint',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createProjectmanTaskFlow({
      projectId: 'project-1',
      boardId: 'board-1',
      boardColumnId: 'board-column-1',
      title: 'Implement API',
      description: 'Finish endpoint',
      createdBy: 'agent:codex:gpt-5',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['kanban-task.create', 'kanban-task.get'])
    expect(calls[0]?.input).toEqual({
      project: 'project-1',
      scopeId: 'project-1',
      board: 'board-1',
      boardColumn: 'board-column-1',
      title: 'Implement API',
      description: 'Finish endpoint',
      createdBy: 'agent:codex:gpt-5',
      updatedBy: 'agent:codex:gpt-5',
    })
    expect(result).toMatchObject({
      action: 'create-task',
      projectId: 'project-1',
      boardId: 'board-1',
      boardColumnId: 'board-column-1',
      taskId: 'task-1',
      focusTaskId: 'task-1',
      task: {
        id: 'task-1',
        boardId: 'board-1',
        boardColumnId: 'board-column-1',
        title: 'Implement API',
      },
    })
  })

  it('updates a task and returns the normalized task snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-task.update') {
        return { ok: true }
      }
      if (operationId === 'kanban-task.get') {
        return {
          item: {
            id: 'task-1',
            boardId: 'board-1',
            boardColumnId: 'board-column-1',
            title: 'Implement API',
            description: 'Finish endpoint',
            progress: 55,
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await updateProjectmanTaskFlow({
      taskId: 'task-1',
      title: 'Implement API',
      description: 'Finish endpoint',
      progress: 55,
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['kanban-task.update', 'kanban-task.get'])
    expect(calls[0]?.input).toEqual({
      id: 'task-1',
      title: 'Implement API',
      description: 'Finish endpoint',
      progress: 55,
    })
    expect(result).toMatchObject({
      action: 'update-task',
      taskId: 'task-1',
      boardId: 'board-1',
      boardColumnId: 'board-column-1',
      focusTaskId: 'task-1',
      task: {
        id: 'task-1',
        progress: 55,
      },
    })
  })

  it('accepts scopeId as the canonical owner for task creation', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-task.create') return { id: 'task-scope-1' }
      if (operationId === 'kanban-task.get') {
        return {
          item: {
            id: 'task-scope-1',
            boardId: 'board-1',
            boardColumnId: 'board-column-1',
            title: 'Scoped task',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await createProjectmanTaskFlow({
      scopeId: 'scope-1',
      boardId: 'board-1',
      boardColumnId: 'board-column-1',
      title: 'Scoped task',
    })

    expect(calls[0]?.input).toMatchObject({
      project: 'scope-1',
      board: 'board-1',
      boardColumn: 'board-column-1',
      title: 'Scoped task',
    })
    expect(result).toMatchObject({
      projectId: 'scope-1',
      taskId: 'task-scope-1',
    })
  })

  it('moves a task and returns the normalized task snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-task.move') {
        return { ok: true }
      }
      if (operationId === 'kanban-board-column.list') return []
      if (operationId === 'kanban-column.list') return []
      if (operationId === 'kanban-task.get') {
        return {
          item: {
            id: 'task-1',
            boardId: 'board-1',
            boardColumnId: 'board-column-2',
            title: 'Implement API',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await moveProjectmanTaskFlow({
      taskId: 'task-1',
      boardColumnId: 'board-column-2',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-task.move',
      'kanban-task.get',
      'kanban-board-column.list',
      'kanban-column.list',
    ])
    expect(calls[0]?.input).toEqual({
      id: 'task-1',
      boardColumn: 'board-column-2',
    })
    expect(result).toMatchObject({
      action: 'move-task',
      taskId: 'task-1',
      boardId: 'board-1',
      boardColumnId: 'board-column-2',
      focusTaskId: 'task-1',
      task: {
        id: 'task-1',
        boardColumnId: 'board-column-2',
      },
    })
  })

  it('forces task progress to 100 when a move lands in a done-like column', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-task.move') return { ok: true }
      if (operationId === 'kanban-board-column.list') {
        return [{ id: 'board-column-done', boardId: 'board-1', columnId: 'column-done' }]
      }
      if (operationId === 'kanban-column.list') {
        return [{ id: 'column-done', name: 'Done', slug: 'done' }]
      }
      if (operationId === 'kanban-task.update') {
        return { ok: true }
      }
      if (operationId === 'kanban-task.get') {
        if (calls.filter((entry) => entry.operationId === 'kanban-task.get').length === 1) {
          return {
            item: {
              id: 'task-1',
              boardId: 'board-1',
              boardColumnId: 'board-column-done',
              title: 'Implement API',
              progress: 45,
            },
          }
        }
        return {
          item: {
            id: 'task-1',
            boardId: 'board-1',
            boardColumnId: 'board-column-done',
            title: 'Implement API',
            progress: 100,
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await moveProjectmanTaskFlow({
      taskId: 'task-1',
      boardColumnId: 'board-column-done',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-task.move',
      'kanban-task.get',
      'kanban-board-column.list',
      'kanban-column.list',
      'kanban-task.update',
      'kanban-task.get',
    ])
    expect(calls[4]?.input).toEqual({
      id: 'task-1',
      progress: 100,
    })
    expect(result).toMatchObject({
      taskId: 'task-1',
      boardColumnId: 'board-column-done',
      task: {
        id: 'task-1',
        progress: 100,
      },
    })
  })

  it('repositions a task and owns the move plus reorder chain', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'kanban-task.get') {
        if (calls.filter((entry) => entry.operationId === 'kanban-task.get').length === 1) {
          return {
            item: {
              id: 'task-1',
              boardId: 'board-1',
              boardColumnId: 'board-column-1',
              title: 'Implement API',
            },
          }
        }
        return {
          item: {
            id: 'task-1',
            boardId: 'board-1',
            boardColumnId: 'board-column-2',
            title: 'Implement API',
          },
        }
      }
      if (operationId === 'kanban-task.move') return { ok: true }
      if (operationId === 'kanban-task.reorder') return { ok: true }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await repositionProjectmanTaskFlow({
      taskId: 'task-1',
      boardColumnId: 'board-column-2',
      orderedIds: ['task-2', 'task-1'],
      sourceBoardColumnId: 'board-column-1',
      sourceOrderedIds: ['task-3'],
    })

    expect(calls.map((entry) => entry.operationId)).toEqual([
      'kanban-task.get',
      'kanban-task.move',
      'kanban-task.reorder',
      'kanban-task.reorder',
      'kanban-task.get',
    ])
    expect(calls[1]?.input).toEqual({
      id: 'task-1',
      boardColumn: 'board-column-2',
    })
    expect(calls[2]?.input).toEqual({
      boardColumn: 'board-column-2',
      orderedIds: ['task-2', 'task-1'],
    })
    expect(calls[3]?.input).toEqual({
      boardColumn: 'board-column-1',
      orderedIds: ['task-3'],
    })
    expect(result).toMatchObject({
      action: 'reposition-task',
      taskId: 'task-1',
      boardId: 'board-1',
      boardColumnId: 'board-column-2',
      focusTaskId: 'task-1',
      task: {
        id: 'task-1',
        boardColumnId: 'board-column-2',
      },
    })
  })

  it('creates sprint snapshots through the product layer', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'sprint.create') return { id: 'sprint-1' }
      if (operationId === 'sprint.list') {
        return [
          {
            id: 'sprint-1',
            projectId: 'project-1',
            kanbanTaskId: 'task-1',
            name: 'Sprint 1',
            goal: 'Ship it',
            status: 'todo',
            phases: [
              {
                id: 'phase-1',
                name: 'Main',
                microtasks: [{ id: 'micro-1', title: 'Wire API', status: 'todo' }],
              },
            ],
          },
        ]
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const created = await createProjectmanSprintFlow({
      projectId: 'project-1',
      kanbanTaskId: 'task-1',
      name: 'Sprint 1',
      goal: 'Ship it',
      references: ['docs/spec.md'],
      scope: ['Server flow'],
      validationPlan: ['Route test'],
      phases: [{ name: 'Main', microtasks: [{ title: 'Wire API' }] }],
      createdBy: 'agent:codex:gpt-5',
    })

    expect(created).toMatchObject({
      action: 'create-sprint',
      projectId: 'project-1',
      sprintId: 'sprint-1',
      focusSprintId: 'sprint-1',
      sprint: {
        id: 'sprint-1',
        name: 'Sprint 1',
        kanbanTaskId: 'task-1',
      },
      sprintGroups: [
        {
          id: 'phase-1',
          sprintId: 'sprint-1',
          name: 'Main',
        },
      ],
      microTasks: [
        {
          id: 'micro-1',
          sprintId: 'sprint-1',
          sprintGroupId: 'phase-1',
          title: 'Wire API',
        },
      ],
    })
    expect(calls.find((entry) => entry.operationId === 'sprint.create')?.input).toMatchObject({
      project: 'project-1',
      kanbanTask: 'task-1',
      name: 'Sprint 1',
      goal: 'Ship it',
      references: ['docs/spec.md'],
      scope: ['Server flow'],
      validationPlan: ['Route test'],
      phases: [{ name: 'Main', microtasks: [{ title: 'Wire API' }] }],
      createdBy: 'agent:codex:gpt-5',
      updatedBy: 'agent:codex:gpt-5',
    })
  })

  it('updates sprint plans and microtask status through the product layer', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'sprint.update-plan') return { ok: true }
      if (operationId === 'sprint.update-microtask-status') return { ok: true }
      if (operationId === 'sprint.list') {
        const microtaskCompleted = calls.some((entry) => entry.operationId === 'sprint.update-microtask-status')
        return [
          {
            id: 'sprint-1',
            projectId: 'project-1',
            kanbanTaskId: 'task-1',
            name: 'Sprint 1',
            goal: 'Ship it',
            status: microtaskCompleted ? 'completed' : 'doing',
            phases: [
              {
                id: 'phase-1',
                name: 'Main',
                microtasks: [
                  {
                    id: 'micro-1',
                    title: 'Wire API',
                    status: microtaskCompleted ? 'completed' : 'doing',
                  },
                ],
              },
            ],
          },
        ]
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const updatedPlan = await updateProjectmanSprintPlanFlow({
      projectId: 'project-1',
      sprintId: 'sprint-1',
      name: 'Sprint 1',
      goal: 'Ship it',
      references: ['docs/spec.md'],
      expectedUpdatedAt: '2026-03-31T11:00:00.000Z',
      phases: [{ id: 'phase-1', name: 'Main', microtasks: [{ id: 'micro-1', title: 'Wire API', status: 'completed' }] }],
    })
    const updatedMicroTask = await updateProjectmanSprintMicrotaskStatusFlow({
      projectId: 'project-1',
      sprintId: 'sprint-1',
      microTaskId: 'micro-1',
      status: 'completed',
    })

    expect(updatedPlan).toMatchObject({
      action: 'update-sprint-plan',
      projectId: 'project-1',
      sprintId: 'sprint-1',
      focusSprintId: 'sprint-1',
    })
    expect(updatedPlan.agentHints.reminders).toContain(
      'Sprint ve faz statuslari child microtask completion durumundan derive edilir.',
    )
    expect(calls.find((entry) => entry.operationId === 'sprint.update-plan')?.input).toMatchObject({
      id: 'sprint-1',
      name: 'Sprint 1',
      goal: 'Ship it',
      references: ['docs/spec.md'],
      expectedUpdatedAt: '2026-03-31T11:00:00.000Z',
      phases: [{ id: 'phase-1', name: 'Main', microtasks: [{ id: 'micro-1', title: 'Wire API', status: 'completed' }] }],
    })
    expect(updatedMicroTask).toMatchObject({
      action: 'update-sprint-microtask-status',
      projectId: 'project-1',
      sprintId: 'sprint-1',
      microTaskId: 'micro-1',
      microTask: {
        id: 'micro-1',
        status: 'completed',
      },
    })
    expect(updatedMicroTask.agentHints.reminders).toContain(
      'Sprint progress cancelled microtasklari paydaya katmadan derive edilir.',
    )
    expect(calls.find((entry) => entry.operationId === 'sprint.update-microtask-status')?.input).toMatchObject({
      id: 'sprint-1',
      microTask: 'micro-1',
      status: 'completed',
    })
  })

  it('accepts scopeId as the canonical owner for sprint creation', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'sprint.list') return []
      if (operationId === 'sprint.create') return { id: 'sprint-scope-1' }
      if (operationId === 'sprint.get') {
        return {
          item: {
            id: 'sprint-scope-1',
            projectId: 'scope-1',
            kanbanTaskId: 'task-1',
            name: 'Scoped sprint',
            phases: [{ id: 'phase-1', name: 'Main', microtasks: [] }],
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const created = await createProjectmanSprintFlow({
      scopeId: 'scope-1',
      kanbanTaskId: 'task-1',
      name: 'Scoped sprint',
      goal: 'Ship scoped work',
    })

    expect(calls.find((entry) => entry.operationId === 'sprint.create')?.input).toMatchObject({
      project: 'scope-1',
      kanbanTask: 'task-1',
      name: 'Scoped sprint',
      goal: 'Ship scoped work',
    })
    expect(created).toMatchObject({
      projectId: 'scope-1',
      sprintId: 'sprint-scope-1',
    })
  })

  it('parses hosted stringified sprint arrays before forwarding to the kit layer', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'sprint.create') return { id: 'sprint-1' }
      if (operationId === 'sprint.update-plan') return { ok: true }
      if (operationId === 'sprint.list') {
        return [
          {
            id: 'sprint-1',
            projectId: 'project-1',
            kanbanTaskId: 'task-1',
            name: 'Sprint 1',
            goal: 'Ship it',
            status: 'doing',
            phases: [
              {
                id: 'phase-1',
                name: 'Main',
                microtasks: [{ id: 'micro-1', title: 'Wire API', status: 'todo' }],
              },
            ],
          },
        ]
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    await createProjectmanSprintFlow({
      projectId: 'project-1',
      kanbanTaskId: 'task-1',
      name: 'Sprint 1',
      goal: 'Ship it',
      references: JSON.stringify(['docs/spec.md']),
      scope: JSON.stringify(['Server flow']),
      validationPlan: JSON.stringify(['Route test']),
      phases: JSON.stringify([{ name: 'Main', microtasks: [{ title: 'Wire API' }] }]),
    })

    await updateProjectmanSprintPlanFlow({
      projectId: 'project-1',
      sprintId: 'sprint-1',
      references: JSON.stringify(['docs/spec.md']),
      expectedUpdatedAt: '2026-03-31T11:00:00.000Z',
      phases: JSON.stringify([{ id: 'phase-1', name: 'Main', microtasks: [{ id: 'micro-1', title: 'Wire API' }] }]),
    })

    expect(calls.find((entry) => entry.operationId === 'sprint.create')?.input).toMatchObject({
      references: ['docs/spec.md'],
      scope: ['Server flow'],
      validationPlan: ['Route test'],
      phases: [{ name: 'Main', microtasks: [{ title: 'Wire API' }] }],
    })
    expect(calls.find((entry) => entry.operationId === 'sprint.update-plan')?.input).toMatchObject({
      references: ['docs/spec.md'],
      expectedUpdatedAt: '2026-03-31T11:00:00.000Z',
      phases: [{ id: 'phase-1', name: 'Main', microtasks: [{ id: 'micro-1', title: 'Wire API' }] }],
    })
  })

  it('creates sprint microtasks through the incremental add surface and refreshes the sprint snapshot', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'sprint.list') {
        const addCalls = calls.filter((entry) => entry.operationId === 'sprint.add-microtask').length
        return [
          {
            id: 'sprint-1',
            projectId: 'project-1',
            kanbanTaskId: 'task-1',
            name: 'Sprint 1',
            goal: 'Ship it',
            status: addCalls > 0 ? 'doing' : 'todo',
            phases: [
              {
                id: 'phase-1',
                name: 'Main',
                microtasks: addCalls > 0 ? [{ id: 'micro-2', title: 'Wire API', status: 'todo' }] : [],
              },
            ],
          },
        ]
      }
      if (operationId === 'sprint.add-microtask') return { ok: true }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const created = await createProjectmanSprintMicrotaskFlow({
      projectId: 'project-1',
      sprintId: 'sprint-1',
      phaseId: 'phase-1',
      title: 'Wire API',
      status: 'todo',
    })

    expect(calls.find((entry) => entry.operationId === 'sprint.add-microtask')?.input).toMatchObject({
      id: 'sprint-1',
      phaseId: 'phase-1',
      title: 'Wire API',
      status: 'todo',
    })
    expect(created).toMatchObject({
      action: 'create-sprint-microtask',
      projectId: 'project-1',
      sprintId: 'sprint-1',
      microTaskId: 'micro-2',
      focusSprintId: 'sprint-1',
      focusMicroTaskId: 'micro-2',
    })
    expect(created.agentHints.nextActions).toContain(
      'Checklist itemi ilerledikce microtask status akisi ile guncelle.',
    )
  })

  it('creates and updates issue snapshots through the product layer', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'issue.create') return { id: 'issue-1' }
      if (operationId === 'issue.update') return { ok: true }
      if (operationId === 'issue.get') {
        const updateCalls = calls.filter((entry) => entry.operationId === 'issue.update').length
        if (updateCalls > 0) {
          return {
            item: {
              id: 'issue-1',
              projectId: 'project-1',
              title: 'Broken login',
              status: 'resolved',
              severity: 'high',
              source: 'human',
              resolvedAt: '2026-03-11',
            },
          }
        }
        return {
          item: {
            id: 'issue-1',
            projectId: 'project-1',
            title: 'Broken login',
            status: 'open',
            severity: 'high',
            source: 'human',
            sprintId: 'sprint-1',
            kanbanTaskId: 'task-1',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const created = await createProjectmanIssueFlow({
      projectId: 'project-1',
      title: 'Broken login',
      status: 'open',
      severity: 'high',
      source: 'human',
      sprintId: 'sprint-1',
      kanbanTaskId: 'task-1',
      tags: ['auth'],
    })
    const updated = await updateProjectmanIssueFlow({
      issueId: 'issue-1',
      status: 'resolved',
      sprintId: null,
      kanbanTaskId: null,
      microTaskId: null,
      tags: [],
    })

    expect(created).toMatchObject({
      action: 'create-issue',
      projectId: 'project-1',
      issueId: 'issue-1',
      focusIssueId: 'issue-1',
      issue: {
        id: 'issue-1',
        title: 'Broken login',
        status: 'open',
      },
    })
    expect(updated).toMatchObject({
      action: 'update-issue',
      projectId: 'project-1',
      issueId: 'issue-1',
      focusIssueId: 'issue-1',
      issue: {
        id: 'issue-1',
        status: 'resolved',
        resolvedAt: '2026-03-11',
      },
    })
    expect(calls[0]?.input).toEqual({
      project: 'project-1',
      title: 'Broken login',
      description: undefined,
      status: 'open',
      severity: 'high',
      source: 'human',
      sprint: 'sprint-1',
      kanbanTask: 'task-1',
      microTask: undefined,
      tags: ['auth'],
      notes: undefined,
    })
    expect(calls.find((entry) => entry.operationId === 'issue.update')?.input).toEqual({
      id: 'issue-1',
      title: undefined,
      description: undefined,
      status: 'resolved',
      severity: undefined,
      source: undefined,
      sprint: undefined,
      kanbanTask: undefined,
      notes: undefined,
      resolvedAt: today,
    })
  })

  it('omits resolvedAt when updating an issue to a non-resolved status', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'issue.update') return { ok: true }
      if (operationId === 'issue.get') {
        return {
          item: {
            id: 'issue-2',
            projectId: 'project-1',
            title: 'Stale title',
            status: 'triaged',
            severity: 'medium',
            source: 'human',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const updated = await updateProjectmanIssueFlow({
      issueId: 'issue-2',
      status: 'triaged',
      sprintId: null,
      kanbanTaskId: null,
      microTaskId: null,
      tags: [],
    })

    expect(calls.find((entry) => entry.operationId === 'issue.update')?.input).toEqual({
      id: 'issue-2',
      title: undefined,
      description: undefined,
      status: 'triaged',
      severity: undefined,
      source: undefined,
      sprint: undefined,
      kanbanTask: undefined,
      notes: undefined,
      resolvedAt: undefined,
    })
    expect(updated).toMatchObject({
      action: 'update-issue',
      issueId: 'issue-2',
      issue: {
        id: 'issue-2',
        status: 'triaged',
      },
    })
  })

  it('creates and updates feedback snapshots through the product layer', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })
      if (operationId === 'feedback.create') return { id: 'feedback-1' }
      if (operationId === 'feedback.update') return { ok: true }
      if (operationId === 'feedback.get') {
        const updateCalls = calls.filter((entry) => entry.operationId === 'feedback.update').length
        if (updateCalls > 0) {
          return {
            item: {
              id: 'feedback-1',
              projectId: 'project-1',
              title: 'Search feels slow',
              status: 'implemented',
              type: 'improvement',
              severity: 'medium',
              source: 'human',
              handledAt: '2026-03-11',
            },
          }
        }
        return {
          item: {
            id: 'feedback-1',
            projectId: 'project-1',
            title: 'Search feels slow',
            status: 'new',
            type: 'improvement',
            severity: 'medium',
            source: 'human',
            sprintId: 'sprint-1',
          },
        }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const created = await createProjectmanFeedbackFlow({
      projectId: 'project-1',
      title: 'Search feels slow',
      status: 'new',
      type: 'improvement',
      severity: 'medium',
      source: 'human',
      suggestion: 'Add covering index',
    })
    const updated = await updateProjectmanFeedbackFlow({
      feedbackId: 'feedback-1',
      status: 'implemented',
      sprintId: null,
      kanbanTaskId: null,
      microTaskId: null,
      tags: [],
    })

    expect(created).toMatchObject({
      action: 'create-feedback',
      projectId: 'project-1',
      feedbackId: 'feedback-1',
      focusFeedbackId: 'feedback-1',
      feedback: {
        id: 'feedback-1',
        title: 'Search feels slow',
        status: 'new',
      },
    })
    expect(updated).toMatchObject({
      action: 'update-feedback',
      projectId: 'project-1',
      feedbackId: 'feedback-1',
      focusFeedbackId: 'feedback-1',
      feedback: {
        id: 'feedback-1',
        status: 'implemented',
        handledAt: '2026-03-11',
      },
    })
    expect(calls[0]?.input).toEqual({
      project: 'project-1',
      title: 'Search feels slow',
      description: undefined,
      status: 'new',
      type: 'improvement',
      severity: 'medium',
      source: 'human',
      sprint: undefined,
      kanbanTask: undefined,
      microTask: undefined,
      tags: undefined,
      suggestion: 'Add covering index',
      notes: undefined,
    })
    expect(calls.find((entry) => entry.operationId === 'feedback.update')?.input).toEqual({
      id: 'feedback-1',
      title: undefined,
      description: undefined,
      status: 'implemented',
      type: undefined,
      severity: undefined,
      source: undefined,
      sprint: undefined,
      kanbanTask: undefined,
      suggestion: undefined,
      notes: undefined,
    })
  })

  it('converts feedback to a task using server-owned mapping', async () => {
    const calls: Array<{ operationId: string; input: Record<string, unknown> }> = []

    mocks.runProjectmanKitOperationByTypedId.mockImplementation(async (operationId, input) => {
      calls.push({ operationId, input: input as Record<string, unknown> })

      if (operationId === 'feedback.get') {
        return {
          item: {
            id: 'feedback-1',
            title: 'Search is slow',
            suggestion: 'Optimize query plan',
            sprintId: 'sprint-1',
          },
        }
      }
      if (operationId === 'kanban-task.create') {
        return { id: 'task-2' }
      }
      throw new Error(`unexpected_operation:${operationId}`)
    })

    const result = await convertProjectmanFeedbackToTaskFlow({
      projectId: 'project-1',
      feedbackId: 'feedback-1',
      boardId: 'board-1',
      boardColumnId: 'board-column-1',
      title: 'Optimize search query',
    })

    expect(calls.map((entry) => entry.operationId)).toEqual(['feedback.get', 'kanban-task.create'])
    expect(calls[1]?.input).toEqual({
      project: 'project-1',
      scopeId: 'project-1',
      board: 'board-1',
      boardColumn: 'board-column-1',
      title: 'Optimize search query',
      description: 'Optimize query plan',
      sprintId: 'sprint-1',
    })
    expect(result).toMatchObject({
      action: 'convert-feedback-to-task',
      projectId: 'project-1',
      feedbackId: 'feedback-1',
      boardId: 'board-1',
      boardColumnId: 'board-column-1',
      taskId: 'task-2',
      title: 'Optimize search query',
    })
  })
})
