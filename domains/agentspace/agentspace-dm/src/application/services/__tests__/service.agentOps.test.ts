import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'
import { AgentSessionService } from '../service.agentSession.js'
import { AgentRunService } from '../service.agentRun.js'

const makeRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
})

describe('AgentSessionService', () => {
  it('starts session with defaults', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'session-1' }))

    const service = new AgentSessionService({ agentSessionRepository: repo as any })
    const result = await Effect.runPromise(
      service.startAgentSession({ projectId: 'project-1', sessionId: 'sess-1', agent: 'codex' })
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    const payload = repo.create.mock.calls[0][0]
    expect(payload.status).toBe('active')
    expect(payload.startedAt).toBeInstanceOf(Date)
    expect(result.id).toBe('session-1')
  })

  it('ends session with default status', async () => {
    const repo = makeRepo()
    repo.patchById.mockImplementation((id, patch) => Effect.succeed({ id, ...patch }))

    const service = new AgentSessionService({ agentSessionRepository: repo as any })
    const result = await Effect.runPromise(service.endAgentSession('session-1'))

    expect(repo.patchById).toHaveBeenCalledTimes(1)
    const [id, patch] = repo.patchById.mock.calls[0]
    expect(id).toBe('session-1')
    expect(patch.status).toBe('ended')
    expect(patch.endedAt).toBeInstanceOf(Date)
    expect(result.id).toBe('session-1')
  })
})

describe('AgentRunService', () => {
  it('records a run', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'run-1' }))

    const service = new AgentRunService({ agentRunRepository: repo as any })
    const result = await Effect.runPromise(
      service.recordAgentRun({
        projectId: 'project-1',
        agentSessionId: 'session-1',
        runId: 'run-1',
        sessionId: 'sess-1',
        agent: 'codex',
      })
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    const payload = repo.create.mock.calls[0][0]
    expect(payload.runId).toBe('run-1')
    expect(result.id).toBe('run-1')
  })

  it('attaches a run to task', async () => {
    const repo = makeRepo()
    repo.patchById.mockImplementation((id, patch) => Effect.succeed({ id, ...patch }))

    const service = new AgentRunService({ agentRunRepository: repo as any })
    const result = await Effect.runPromise(service.attachRunToTask('run-1', 'task-1'))

    expect(repo.patchById).toHaveBeenCalledWith('run-1', { taskId: 'task-1' })
    expect(result.id).toBe('run-1')
  })
})
