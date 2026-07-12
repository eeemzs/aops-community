import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

import { WorkflowDefinitionService } from '../service.workflowDefinition.js'
import { WorkflowInstanceService } from '../service.workflowInstance.js'
import { WorkflowStepRunService } from '../service.workflowStepRun.js'
import { AgentRunEventService } from '../service.agentRunEvent.js'

const makeRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
})

describe('Workflow catalog services', () => {
  it('lists workflow definitions through the repository filter', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() => Effect.succeed([{ id: 'wf-def-1' }]))

    const service = new WorkflowDefinitionService({ workflowDefinitionRepository: repo as any })
    const result = await Effect.runPromise(
      service.listWorkflowDefinitions({ scopeId: 'project-1', subjectType: 'projectman.issue' })
    )

    expect(result).toEqual([{ id: 'wf-def-1' }])
    expect(repo.find).toHaveBeenCalledWith({
      matchEq: { scopeId: 'project-1', subjectType: 'projectman.issue' },
      options: undefined,
    })
  })

  it('lists workflow instances through the repository filter', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() => Effect.succeed([{ id: 'wf-inst-1' }]))

    const service = new WorkflowInstanceService({ workflowInstanceRepository: repo as any })
    const result = await Effect.runPromise(
      service.listWorkflowInstances({ scopeId: 'project-1', status: 'running', subjectType: 'projectman.issue' })
    )

    expect(result).toEqual([{ id: 'wf-inst-1' }])
    expect(repo.find).toHaveBeenCalledWith({
      matchEq: { scopeId: 'project-1', status: 'running', subjectType: 'projectman.issue' },
      options: undefined,
    })
  })

  it('lists workflow step runs through the repository filter', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() => Effect.succeed([{ id: 'wf-step-1' }]))

    const service = new WorkflowStepRunService({ workflowStepRunRepository: repo as any })
    const result = await Effect.runPromise(
      service.listWorkflowStepRuns({ workflowInstanceId: 'wf-inst-1', status: 'running', stepId: 'triage' })
    )

    expect(result).toEqual([{ id: 'wf-step-1' }])
    expect(repo.find).toHaveBeenCalledWith({
      matchEq: { workflowInstanceId: 'wf-inst-1', status: 'running', stepId: 'triage' },
      options: undefined,
    })
  })

  it('lists agent run events through the repository filter', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() => Effect.succeed([{ id: 'event-1' }]))

    const service = new AgentRunEventService({ agentRunEventRepository: repo as any })
    const result = await Effect.runPromise(
      service.listAgentRunEvents({ agentRunId: 'agent-run-1', eventType: 'context.composed' })
    )

    expect(result).toEqual([{ id: 'event-1' }])
    expect(repo.find).toHaveBeenCalledWith({
      matchEq: { agentRunId: 'agent-run-1', eventType: 'context.composed' },
      options: undefined,
    })
  })
})
