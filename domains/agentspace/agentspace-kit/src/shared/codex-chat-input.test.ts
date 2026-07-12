import { describe, expect, it } from 'vitest'

import {
  normalizeAgentspaceOperationInputForCompatibility,
  normalizeAgentspaceToolInputForCompatibility,
  normalizeCodexChatMessageCreateInput,
  normalizeCodexChatThreadCreateInput,
} from './codex-chat-input.js'

describe('codex-chat input compatibility helper', () => {
  it('injects messageAt for codex-chat message create payloads', () => {
    const normalized = normalizeCodexChatMessageCreateInput({
      data: {
        projectId: 'project-1',
        threadId: 'thread-1',
        role: 'user',
        text: 'hello',
        seq: 1,
      },
    })

    expect(typeof normalized.data?.messageAt).toBe('string')
    expect(String(normalized.data?.messageAt).length).toBeGreaterThan(0)
  })

  it('normalizes Date messageAt to ISO string', () => {
    const normalized = normalizeCodexChatMessageCreateInput({
      data: {
        projectId: 'project-1',
        threadId: 'thread-1',
        role: 'user',
        text: 'hello',
        seq: 1,
        messageAt: new Date('2026-03-06T00:00:00.000Z'),
      },
    })

    expect(normalized.data?.messageAt).toBe('2026-03-06T00:00:00.000Z')
  })

  it('maps legacy top-level list-messages fields into filter/options', () => {
    const normalized = normalizeAgentspaceOperationInputForCompatibility('codex-chat-message.list-messages', {
      projectId: 'project-1',
      externalThreadId: 'thread-ext-1',
      role: 'user',
      limit: '50',
      offset: 10,
    })

    expect(normalized.externalThreadId).toBeUndefined()
    expect(normalized.limit).toBeUndefined()
    expect(normalized.filter).toMatchObject({
      projectId: 'project-1',
      externalThreadId: 'thread-ext-1',
      role: 'user',
    })
    expect(normalized.options).toMatchObject({
      limit: 50,
      offset: 10,
    })
  })

  it('maps top-level list-threads fields into filter/options for agentspace tool ids', () => {
    const normalized = normalizeAgentspaceToolInputForCompatibility('agentspace.codex-chat-thread.list-threads', {
      projectId: 'project-1',
      externalThreadId: 'thread-ext-2',
      limit: 25,
    })

    expect(normalized.filter).toMatchObject({
      projectId: 'project-1',
      externalThreadId: 'thread-ext-2',
    })
    expect(normalized.options).toMatchObject({
      limit: 25,
    })
  })

  it('maps legacy thread create projectId to scopeId and preserves scopeLabel', () => {
    const normalized = normalizeCodexChatThreadCreateInput({
      data: {
        projectId: 'project-1',
        externalThreadId: 'thread-ext-1',
        scopeLabel: 'project:project-1',
      },
    })

    expect(normalized.data?.projectId).toBeUndefined()
    expect(normalized.data).toMatchObject({
      scopeId: 'project-1',
      externalThreadId: 'thread-ext-1',
      scopeLabel: 'project:project-1',
    })
  })

  it('injects thread create scopeId from top-level project context', () => {
    const normalized = normalizeAgentspaceOperationInputForCompatibility('codex-chat-thread.create', {
      projectId: 'project-1',
      data: {
        externalThreadId: 'thread-ext-1',
      },
    })

    expect(normalized.data).toMatchObject({
      scopeId: 'project-1',
      externalThreadId: 'thread-ext-1',
    })
  })
})
