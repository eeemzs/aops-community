import { describe, expect, it } from 'vitest'

import { parseProjectmanToolInput } from '../operations/tool-input.js'

describe('projectman-kit tool input parser', () => {
  it('normalizes aliases and string coercions for task creation', () => {
    const parsed = parseProjectmanToolInput('kanban-task.create', {
      projectId: '  project-1  ',
      scopeId: '  project-1  ',
      boardId: '  board-1  ',
      boardColumnId: '  board-column-1  ',
      title: '  Ship it  ',
      description: 7,
      position: '3',
      sourceCreatedAt: '2026-04-20T08:15:30.000Z',
      sourceUpdatedAt: '2026-04-21T09:16:31.000Z',
      tenantId: '  tenant-1  ',
      locale: '  tr  ',
      fallbackLocale: '  en  ',
    })

    expect(parsed).toMatchObject({
      project: 'project-1',
      board: 'board-1',
      boardColumn: 'board-column-1',
      projectId: 'project-1',
      scopeId: 'project-1',
      title: 'Ship it',
      description: '7',
      position: 3,
      sourceCreatedAt: new Date('2026-04-20T08:15:30.000Z'),
      sourceUpdatedAt: new Date('2026-04-21T09:16:31.000Z'),
      tenantId: 'tenant-1',
      locale: 'tr',
      fallbackLocale: 'en',
    })
  })

  it('coerces nullable numbers and json objects for current sprint/template operations', () => {
    const microtask = parseProjectmanToolInput('sprint.add-microtask', {
      id: ' sprint-1 ',
      phaseId: ' phase-1 ',
      title: '  Micro task  ',
      status: ' doing ',
      position: 'null',
      notes: '  note  ',
      createdBy: '  agent:codex:gpt-5  ',
      updatedBy: '  agent:codex:gpt-5  ',
    })

    expect(microtask).toMatchObject({
      id: 'sprint-1',
      phaseId: 'phase-1',
      title: 'Micro task',
      status: 'doing',
      position: null,
      notes: 'note',
      createdBy: 'agent:codex:gpt-5',
      updatedBy: 'agent:codex:gpt-5',
    })

    const template = parseProjectmanToolInput('kanban-template.create', {
      name: '  Starter  ',
      description: '  Delivery board  ',
      definition: '{"boards":[{"name":"Main","columns":[{"name":"Todo"}]}],"labels":["alpha"," beta ",3]}',
    })

    expect(template).toMatchObject({
      name: 'Starter',
      description: 'Delivery board',
      definition: {
        boards: [{ name: 'Main', columns: [{ name: 'Todo' }] }],
        labels: ['alpha', ' beta ', 3],
      },
    })
  })

  it('parses string arrays and nested plan fields for sprint creation', () => {
    const parsed = parseProjectmanToolInput('sprint.create', {
      project: ' project-1 ',
      kanbanTask: ' task-1 ',
      name: '  Sprint 12  ',
      goal: '  release  ',
      references: '["spec-1"," spec-2 ",3]',
      scope: '["ui"," api "]',
      validationPlan: '["smoke"," regression "]',
      phases: [{ name: 'Main', microtasks: [{ title: 'Wire API', status: 'doing' }] }],
      notes: '  launch window  ',
      scopeId: ' project-1 ',
    })

    expect(parsed).toMatchObject({
      project: 'project-1',
      kanbanTask: 'task-1',
      name: 'Sprint 12',
      goal: 'release',
      references: ['spec-1', 'spec-2', '3'],
      scope: ['ui', 'api'],
      validationPlan: ['smoke', 'regression'],
      phases: [{ name: 'Main', microtasks: [{ title: 'Wire API', status: 'doing' }] }],
      notes: 'launch window',
      projectId: 'project-1',
      scopeId: 'project-1',
    })
  })

  it('preserves explicit empty arrays for optional list fields', () => {
    const sprint = parseProjectmanToolInput('sprint.create', {
      project: 'project-1',
      kanbanTask: 'task-1',
      name: 'Sprint',
      goal: 'Ship',
      references: [],
      scope: [],
      validationPlan: [],
    })
    const issue = parseProjectmanToolInput('issue.create', {
      project: 'project-1',
      title: 'Issue',
      tags: [],
    })

    expect(sprint.references).toEqual([])
    expect(sprint.scope).toEqual([])
    expect(sprint.validationPlan).toEqual([])
    expect(issue.tags).toEqual([])
  })

  it('uses explicit scope context first and falls back to __hostContext for the rest', () => {
    const parsed = parseProjectmanToolInput('issue.create', {
      project: ' project-1 ',
      title: '  Parser boundary  ',
      scopeId: ' direct-project ',
      locale: ' en ',
      __hostContext: {
        scopeId: ' host-project ',
        tenantId: ' tenant-1 ',
        locale: ' tr ',
        fallbackLocale: ' de ',
      },
    })

    expect(parsed).toMatchObject({
      project: 'project-1',
      title: 'Parser boundary',
      projectId: 'direct-project',
      scopeId: 'direct-project',
      tenantId: 'tenant-1',
      locale: 'en',
      fallbackLocale: 'de',
    })
  })

  it('accepts issue and feedback link aliases including microtask and tags', () => {
    const issue = parseProjectmanToolInput('issue.create', {
      projectId: ' project-1 ',
      title: '  Parser boundary  ',
      sprintId: ' sprint-1 ',
      kanbanTaskId: ' task-1 ',
      microTaskId: ' micro-1 ',
      tags: '["demo"," ui "]',
    })

    expect(issue).toMatchObject({
      project: 'project-1',
      title: 'Parser boundary',
      sprint: 'sprint-1',
      kanbanTask: 'task-1',
      microTask: 'micro-1',
      tags: ['demo', 'ui'],
      projectId: 'project-1',
      scopeId: 'project-1',
    })

    const feedback = parseProjectmanToolInput('feedback.create', {
      projectId: ' project-1 ',
      title: '  Parser feedback  ',
      microTaskItemId: ' micro-2 ',
      tags: ['alpha', ' beta '],
    })

    expect(feedback).toMatchObject({
      project: 'project-1',
      title: 'Parser feedback',
      microTask: 'micro-2',
      tags: ['alpha', 'beta'],
      projectId: 'project-1',
      scopeId: 'project-1',
    })
  })

  it('accepts review-request aliases and append-only result fields', () => {
    const request = parseProjectmanToolInput('review-request.create', {
      projectId: ' project-1 ',
      title: '  Review this  ',
      kanbanTaskId: ' task-1 ',
      sprintId: ' sprint-1 ',
      microTaskItemId: ' micro-1 ',
      parentReviewRequestId: ' rr-parent ',
      targetAgent: ' claude ',
      references: '["spec"," diff "]',
      tags: '["review"," agent "]',
    })

    expect(request).toMatchObject({
      project: 'project-1',
      title: 'Review this',
      kanbanTask: 'task-1',
      sprint: 'sprint-1',
      microTask: 'micro-1',
      parentReviewRequest: 'rr-parent',
      targetAgent: 'claude',
      references: ['spec', 'diff'],
      tags: ['review', 'agent'],
      projectId: 'project-1',
      scopeId: 'project-1',
    })

    const result = parseProjectmanToolInput('review-request.add-result', {
      id: ' rr-1 ',
      reviewer: ' claude ',
      outcome: ' changes_requested ',
      summary: ' Needs a fix ',
      positives: '["good"]',
      concerns: [' risk '],
      objections: '[]',
      issueIds: '["issue-1"]',
      basedOnSeqRange: '{"from":1,"to":4}',
      collabResultEventId: ' event-1 ',
      idempotencyKey: ' result-key-1 ',
    })

    expect(result).toMatchObject({
      id: 'rr-1',
      reviewer: 'claude',
      outcome: 'changes_requested',
      summary: 'Needs a fix',
      positives: ['good'],
      concerns: ['risk'],
      objections: [],
      issueIds: ['issue-1'],
      basedOnSeqRange: { from: 1, to: 4 },
      collabResultEventId: 'event-1',
      idempotencyKey: 'result-key-1',
    })

    expect(() =>
      parseProjectmanToolInput('review-request.add-result', {
        id: 'rr-1',
        reviewer: 'claude',
        outcome: 'invalid',
        summary: 'Nope',
      }),
    ).toThrow()
  })

  it('rejects unknown boundary inputs', () => {
    expect(() =>
      parseProjectmanToolInput('kanban-board.create', {
        project: 'project-1',
        name: 'Board',
        unexpected: 'value',
      }),
    ).toThrow('unknown_projectman_input_arg:kanban-board.create:unexpected')
  })

  it('accepts includeArchived query hints for cockpit list reads', () => {
    expect(parseProjectmanToolInput('kanban-board.list', { includeArchived: 'true' })).toMatchObject({
      includeArchived: true,
    })
    expect(parseProjectmanToolInput('sprint.list', { includeArchived: '1' })).toMatchObject({
      includeArchived: true,
    })
    expect(parseProjectmanToolInput('implementation-plan.list', { includeArchived: false })).toMatchObject({
      includeArchived: false,
    })
  })

  it('accepts slug filters and aliases for kanban boards', () => {
    const parsed = parseProjectmanToolInput('kanban-board.create', {
      projectId: '  project-1  ',
      name: '  Platform Board  ',
      slug: '  Platform Board / Main  ',
      description: '  primary board  ',
      position: '4',
    })

    expect(parsed).toMatchObject({
      project: 'project-1',
      name: 'Platform Board',
      slug: 'Platform Board / Main',
      description: 'primary board',
      position: 4,
    })
  })
})
