import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

import { TaskService } from '../service.task.js'

const makeTaskRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
  deleteById: vi.fn(),
})

const makeTaskLabelRepo = () => ({
  create: vi.fn(),
  find: vi.fn(),
  findById: vi.fn(),
  deleteById: vi.fn(),
})

const makeTaskLabelLinkRepo = () => ({
  create: vi.fn(),
  find: vi.fn(),
  deleteMany: vi.fn(),
})

const makeTaskChecklistRepo = () => ({
  create: vi.fn(),
  find: vi.fn(),
  patchById: vi.fn(),
  deleteById: vi.fn(),
})

const makeTaskRelationRepo = () => ({
  create: vi.fn(),
  find: vi.fn(),
  deleteById: vi.fn(),
})

const makeTaskCommentService = () => ({
  create: vi.fn(),
  listByTask: vi.fn(),
  listByProject: vi.fn(),
})

const makeService = () => {
  const taskRepository = makeTaskRepo()
  const taskLabelRepository = makeTaskLabelRepo()
  const taskLabelLinkRepository = makeTaskLabelLinkRepo()
  const taskChecklistItemRepository = makeTaskChecklistRepo()
  const taskRelationRepository = makeTaskRelationRepo()
  const taskCommentService = makeTaskCommentService()

  const service = new TaskService({
    taskRepository: taskRepository as any,
    taskCommentService: taskCommentService as any,
    taskLabelRepository: taskLabelRepository as any,
    taskLabelLinkRepository: taskLabelLinkRepository as any,
    taskChecklistItemRepository: taskChecklistItemRepository as any,
    taskRelationRepository: taskRelationRepository as any,
  })

  return {
    service,
    taskRepository,
    taskLabelRepository,
    taskLabelLinkRepository,
    taskChecklistItemRepository,
    taskRelationRepository,
    taskCommentService,
  }
}

describe('TaskService', () => {
  it('auto-assigns the next position before validation when position is omitted', async () => {
    const { service, taskRepository } = makeService()
    taskRepository.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'task-1', columnId: 'column-1', position: 0 },
        { id: 'task-2', columnId: 'column-1', position: 4 },
      ]),
    )
    taskRepository.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'task-3' }))

    const result = await Effect.runPromise(
      service.create({
        scopeId: 'scope-1',
        columnId: 'column-1',
        title: 'Follow-up task',
        type: 'task',
      } as any),
    )

    expect(taskRepository.find).toHaveBeenCalledTimes(1)
    expect(taskRepository.create).toHaveBeenCalledTimes(1)
    expect(taskRepository.create.mock.calls[0][0]).toMatchObject({
      scopeId: 'scope-1',
      columnId: 'column-1',
      title: 'Follow-up task',
      type: 'task',
      position: 5,
    })
    expect(result).toMatchObject({
      id: 'task-3',
      position: 5,
    })
  })

  it('hydrates task search results with labels, checklist stats, comment count, and relation summary', async () => {
    const {
      service,
      taskRepository,
      taskLabelRepository,
      taskLabelLinkRepository,
      taskChecklistItemRepository,
      taskRelationRepository,
      taskCommentService,
    } = makeService()

    taskRepository.find.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'task-1',
          scopeId: 'scope-1',
          columnId: 'column-1',
          title: 'Write summary',
          type: 'task',
          position: 0,
        },
        {
          id: 'task-2',
          scopeId: 'scope-1',
          columnId: 'column-1',
          title: 'Review summary',
          type: 'task',
          position: 1,
          parentTaskId: 'task-1',
        },
      ]),
    )
    taskLabelRepository.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'label-1', scopeId: 'scope-1', name: 'Inbox', color: 'blue', position: 0 },
      ]),
    )
    taskLabelLinkRepository.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'link-1', scopeId: 'scope-1', taskId: 'task-1', labelId: 'label-1' },
      ]),
    )
    taskChecklistItemRepository.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'check-1', scopeId: 'scope-1', taskId: 'task-1', content: 'Draft', isDone: true, position: 0 },
        { id: 'check-2', scopeId: 'scope-1', taskId: 'task-1', content: 'Review', isDone: false, position: 1 },
      ]),
    )
    taskRelationRepository.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'rel-1', scopeId: 'scope-1', fromTaskId: 'task-1', toTaskId: 'task-2', kind: 'blocks' },
      ]),
    )
    taskCommentService.listByProject.mockImplementation(() =>
      Effect.succeed([
        { id: 'comment-1', scopeId: 'scope-1', taskId: 'task-1', content: 'Needs follow-up' },
      ]),
    )

    const results = await Effect.runPromise(service.searchTasks({ scopeId: 'scope-1' } as any))

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      id: 'task-1',
      labels: [{ id: 'label-1', name: 'Inbox' }],
      checklistStats: { total: 2, completed: 1, remaining: 1 },
      commentCount: 1,
      relationSummary: { blocking: 1, blockedBy: 0, precedes: 0, precededBy: 0, related: 0 },
    })
    expect(results[1]).toMatchObject({
      id: 'task-2',
      labels: [],
      checklistStats: { total: 0, completed: 0, remaining: 0 },
      commentCount: 0,
      relationSummary: { blocking: 0, blockedBy: 1, precedes: 0, precededBy: 0, related: 0 },
      parentTaskId: 'task-1',
    })
  })

  it('reapplies requested sort and limit after hydration when repository ordering drifts', async () => {
    const {
      service,
      taskRepository,
      taskLabelRepository,
      taskLabelLinkRepository,
      taskChecklistItemRepository,
      taskRelationRepository,
      taskCommentService,
    } = makeService()

    taskRepository.find.mockImplementation((query) => {
      expect(query?.options?.limit).toBeUndefined()
      expect(query?.options?.skip).toBeUndefined()
      expect(query?.options?.sort).toEqual([{ field: 'position', type: 'asc' }])
      return Effect.succeed([
        {
          id: 'task-1',
          scopeId: 'scope-1',
          columnId: 'column-1',
          title: 'First task',
          type: 'task',
          position: 0,
        },
        {
          id: 'task-2',
          scopeId: 'scope-1',
          columnId: 'column-1',
          title: 'Second task',
          type: 'task',
          position: 1,
        },
      ])
    })
    taskLabelRepository.find.mockImplementation(() => Effect.succeed([]))
    taskLabelLinkRepository.find.mockImplementation(() => Effect.succeed([]))
    taskChecklistItemRepository.find.mockImplementation(() => Effect.succeed([]))
    taskRelationRepository.find.mockImplementation(() => Effect.succeed([]))
    taskCommentService.listByProject.mockImplementation(() => Effect.succeed([]))

    const results = await Effect.runPromise(
      service.searchTasks(
        { columnId: 'column-1' } as any,
        { sort: [{ field: 'position', type: 'desc' }], limit: 1 } as any,
      ),
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      id: 'task-2',
      position: 1,
      title: 'Second task',
    })
  })

  it('creates labels with the next available position when omitted', async () => {
    const { service, taskLabelRepository } = makeService()

    taskLabelRepository.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'label-1', scopeId: 'scope-1', name: 'Inbox', color: 'blue', position: 0 },
        { id: 'label-2', scopeId: 'scope-1', name: 'Urgent', color: 'red', position: 3 },
      ]),
    )
    taskLabelRepository.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'label-3' }))

    const result = await Effect.runPromise(
      service.createTaskLabel({
        scopeId: 'scope-1',
        name: 'Today',
        color: 'green',
      }),
    )

    expect(taskLabelRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: 'scope-1',
        name: 'Today',
        color: 'green',
        position: 4,
      }),
    )
    expect(result).toMatchObject({ id: 'label-3', position: 4 })
  })

  it('adds checklist items using the task scope and next position', async () => {
    const { service, taskRepository, taskChecklistItemRepository } = makeService()

    taskRepository.findById.mockImplementation(() =>
      Effect.succeed({
        id: 'task-1',
        scopeId: 'scope-1',
        columnId: 'column-1',
        title: 'Parent task',
        type: 'task',
        position: 0,
      }),
    )
    taskChecklistItemRepository.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'check-1', scopeId: 'scope-1', taskId: 'task-1', content: 'Draft', isDone: false, position: 0 },
      ]),
    )
    taskChecklistItemRepository.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'check-2' }))

    const result = await Effect.runPromise(
      service.addChecklistItem({
        taskId: 'task-1',
        content: 'Review',
      }),
    )

    expect(taskChecklistItemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: 'scope-1',
        taskId: 'task-1',
        content: 'Review',
        isDone: false,
        position: 1,
      }),
    )
    expect(result).toMatchObject({ id: 'check-2', position: 1 })
  })

  it('rejects self-relations and keeps parentTaskId semantics separate', async () => {
    const { service } = makeService()

    await expect(
      Effect.runPromise(
        service.addTaskRelation({
          fromTaskId: 'task-1',
          toTaskId: 'task-1',
          kind: 'blocks',
        }),
      ),
    ).rejects.toThrow()
  })
})
