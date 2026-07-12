import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'

import { CodexChatThreadService } from '../service.codexChatThread.js'
import { CodexChatMessageService } from '../service.codexChatMessage.js'
import { CodexChatSettingService } from '../service.codexChatSetting.js'

const makeRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
  deleteById: vi.fn(),
})

describe('CodexChatThreadService', () => {
  it('adds thread and persists expected fields', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'thread-1' }))

    const service = new CodexChatThreadService({ codexChatThreadRepository: repo as any })
    const result = await Effect.runPromise(
      service.addThread({
        scopeId: 'project-1',
        externalThreadId: '019c-thread',
      } as any)
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    const payload = repo.create.mock.calls[0][0]
    expect(payload.scopeId).toBe('project-1')
    expect(payload.externalThreadId).toBe('019c-thread')
    expect(result.id).toBe('thread-1')
  })

  it('lists threads with filter and options', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() => Effect.succeed([{ id: 'thread-1' }]))

    const service = new CodexChatThreadService({ codexChatThreadRepository: repo as any })
    const listed = await Effect.runPromise(
      service.listThreads({ scopeId: 'project-1' } as any, { limit: 10 } as any)
    )

    expect(repo.find).toHaveBeenCalledWith({
      matchEq: { scopeId: 'project-1' },
      options: { limit: 10 },
    })
    expect(listed).toEqual([{ id: 'thread-1' }])
  })

  it('rejects empty patch on updateThread', async () => {
    const repo = makeRepo()
    const service = new CodexChatThreadService({ codexChatThreadRepository: repo as any })

    await expect(Effect.runPromise(service.updateThread('thread-1', {}))).rejects.toBeTruthy()
    expect(repo.patchById).not.toHaveBeenCalled()
  })
})

describe('CodexChatMessageService', () => {
  it('adds message and maps insert payload', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'message-1' }))

    const service = new CodexChatMessageService({ codexChatMessageRepository: repo as any })
    const result = await Effect.runPromise(
      service.addMessage({
        projectId: 'project-1',
        threadId: 'thread-1',
        role: 'user',
        text: 'Merhaba',
        seq: 1,
        messageAt: new Date(),
      } as any)
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    const payload = repo.create.mock.calls[0][0]
    expect(payload.projectId).toBe('project-1')
    expect(payload.threadId).toBe('thread-1')
    expect(payload.role).toBe('user')
    expect(payload.seq).toBe(1)
    expect(result.id).toBe('message-1')
  })

  it('adds message with fallback messageAt when field is missing', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'message-2' }))

    const service = new CodexChatMessageService({ codexChatMessageRepository: repo as any })
    await Effect.runPromise(
      service.addMessage({
        projectId: 'project-1',
        threadId: 'thread-1',
        role: 'user',
        text: 'Merhaba',
        seq: 2,
      } as any)
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    const payload = repo.create.mock.calls[0][0]
    expect(payload.messageAt).toBeInstanceOf(Date)
  })

  it('coerces string messageAt into Date before persistence', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'message-3' }))

    const service = new CodexChatMessageService({ codexChatMessageRepository: repo as any })
    await Effect.runPromise(
      service.addMessage({
        projectId: 'project-1',
        threadId: 'thread-1',
        role: 'assistant',
        text: 'Selam',
        seq: 3,
        messageAt: '2026-03-06T00:00:00.000Z',
      } as any)
    )

    const payload = repo.create.mock.calls[0][0]
    expect(payload.messageAt).toBeInstanceOf(Date)
    expect(payload.messageAt.toISOString()).toBe('2026-03-06T00:00:00.000Z')
  })

  it('removes message by id', async () => {
    const repo = makeRepo()
    repo.deleteById.mockImplementation(() => Effect.succeed(undefined))

    const service = new CodexChatMessageService({ codexChatMessageRepository: repo as any })
    const result = await Effect.runPromise(service.removeMessage('message-1'))

    expect(repo.deleteById).toHaveBeenCalledWith('message-1')
    expect(result).toBeUndefined()
  })
})

describe('CodexChatSettingService', () => {
  it('creates user settings', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'setting-1' }))

    const service = new CodexChatSettingService({ codexChatSettingRepository: repo as any })
    const result = await Effect.runPromise(
      service.addSetting({
        projectId: 'project-1',
        userId: 'user-1',
        executionMode: 'agent-auto',
        sandboxMode: 'workspace-write',
        model: 'gpt-5.2-codex',
        reasoningEffort: 'high',
      } as any)
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    const payload = repo.create.mock.calls[0][0]
    expect(payload.userId).toBe('user-1')
    expect(payload.executionMode).toBe('agent-auto')
    expect(payload.sandboxMode).toBe('workspace-write')
    expect(result.id).toBe('setting-1')
  })

  it('updates settings patch', async () => {
    const repo = makeRepo()
    repo.patchById.mockImplementation((id, patch) => Effect.succeed({ id, ...patch }))

    const service = new CodexChatSettingService({ codexChatSettingRepository: repo as any })
    const result = await Effect.runPromise(service.updateSetting('setting-1', { model: 'o4-mini' } as any))

    expect(repo.patchById).toHaveBeenCalledWith('setting-1', { model: 'o4-mini' })
    expect(result.model).toBe('o4-mini')
  })
})
