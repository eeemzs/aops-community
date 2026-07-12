import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'
import { XfErrorFactory } from '@aopslab/xf-core'
import { ResourceService } from '../service.resource.js'
import { MemoryItemService } from '../service.memoryItem.js'
import { ProjectService } from '../service.project.js'

const makeRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
})

describe('ResourceService', () => {
  it('creates and lists resources', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'res-1' }))
    repo.find.mockImplementation(() => Effect.succeed([{ id: 'res-1' }]))

    const service = new ResourceService({ resourceRepository: repo as any })

    const created = await Effect.runPromise(
      service.createResource({
        scopeId: 'scope-project-1',
        name: 'Spec',
        resourceType: 'spec',
      }),
    )

    const listed = await Effect.runPromise(
      service.listResources({ scopeId: 'scope-project-1', scopeResolution: 'explicit' }),
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    expect(created.id).toBe('res-1')
    expect(repo.find).toHaveBeenCalledWith({ matchEq: { scopeId: 'scope-project-1' }, options: undefined })
    expect(listed).toEqual([{ id: 'res-1' }])
  })

  it('updates resource patch', async () => {
    const repo = makeRepo()
    repo.patchById.mockImplementation((id, patch) => Effect.succeed({ id, ...patch }))

    const service = new ResourceService({ resourceRepository: repo as any })
    const result = await Effect.runPromise(service.updateResource('res-1', { name: 'Updated' }))

    expect(repo.patchById).toHaveBeenCalledWith('res-1', { name: 'Updated' })
    expect(result.name).toBe('Updated')
  })

  it('does not log empty registry reads as errors when resources are not found', async () => {
    const error = vi.fn()
    const repo = makeRepo()
    repo.find.mockImplementation(() =>
      Effect.fail(XfErrorFactory.notFound({ stage: 'test', identifier: 'resource-missing' })),
    )

    const service = new ResourceService({
      resourceRepository: repo as any,
      logger: {
        child: () => ({ error }),
      } as any,
    })

    await expect(
      Effect.runPromise(service.listResources({ scopeId: 'scope-project-1', scopeResolution: 'explicit' })),
    ).rejects.toBeTruthy()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('ProjectService', () => {
  it('does not log alias fallback misses as errors when project ids are not found', async () => {
    const error = vi.fn()
    const repo = makeRepo()
    repo.findById.mockImplementation(() =>
      Effect.fail(XfErrorFactory.notFound({ stage: 'test', identifier: 'project-missing' })),
    )

    const service = new ProjectService({
      projectRepository: repo as any,
      logger: {
        child: () => ({ error }),
      } as any,
    })

    await expect(Effect.runPromise(service.getById('demo-project'))).rejects.toBeTruthy()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('MemoryItemService', () => {
  it('adds memory item and sets importance', async () => {
    const repo = makeRepo()
    repo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'mem-1' }))
    repo.patchById.mockImplementation((id, patch) => Effect.succeed({ id, ...patch }))

    const service = new MemoryItemService({ memoryItemRepository: repo as any })

    const created = await Effect.runPromise(
      service.addMemoryItem({
        scopeId: 'scope-project-1',
        kind: 'decision',
        durability: 'short',
        content: 'Use Kanban',
      }),
    )

    const updated = await Effect.runPromise(service.setMemoryImportance('mem-1', 3))

    expect(repo.create).toHaveBeenCalledTimes(1)
    expect(created.id).toBe('mem-1')
    expect(repo.patchById).toHaveBeenCalledWith('mem-1', { importance: 3 })
    expect(updated.importance).toBe(3)
  })

  it('searches memory items with retrieval ranking instead of raw importance order', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'mem-legacy',
          scopeId: 'scope-project-1',
          kind: 'note',
          durability: 'durable',
          content: 'General retrospective note',
          tags: ['phase:decision'],
          importance: 95,
          updatedAt: '2025-11-01T00:00:00.000Z',
        },
        {
          id: 'mem-linked',
          scopeId: 'scope-project-1',
          kind: 'constraint',
          durability: 'short',
          content: 'Triage flaky workflow run before approval loop repeats',
          tags: ['triage', 'workflow'],
          sourceType: 'projectman.issue',
          sourceId: 'issue-7',
          importance: 20,
          updatedAt: '2026-03-09T10:00:00.000Z',
        },
        {
          id: 'mem-unrelated',
          scopeId: 'scope-project-1',
          kind: 'note',
          durability: 'durable',
          content: 'Marketing launch prep',
          importance: 5,
          updatedAt: '2026-03-09T11:00:00.000Z',
        },
      ]),
    )

    const service = new MemoryItemService({ memoryItemRepository: repo as any })

    const results = await Effect.runPromise(
      service.searchMemoryItems(
        { scopeId: 'scope-project-1', scopeResolution: 'explicit' },
        {
          query: 'triage flaky workflow approval',
          runtimeProfile: 'workflow-triage',
          workflowId: 'workflow-1',
          subject: { type: 'projectman.issue', id: 'issue-7' },
          tags: ['triage', 'workflow'],
        },
        { limit: 2 },
      ),
    )

    expect(results.map((entry) => entry.id)).toEqual(['mem-linked', 'mem-legacy'])
    expect(repo.find).toHaveBeenCalledWith({
      matchEq: { scopeId: 'scope-project-1' },
      options: expect.objectContaining({ limit: 48, offset: undefined }),
    })
  })

  it('downranks expired memory below fresh matches but keeps expired fallback available', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'mem-expired',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Current ADK integration approach for Electron bridge.',
          tags: ['purpose:howto', 'area:adk-electron', 'status:active'],
          importance: 95,
          updatedAt: '2026-04-07T10:00:00.000Z',
          meta: {
            expiresAt: '2026-04-07T23:59:59.000Z',
          },
        },
        {
          id: 'mem-fresh',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Current ADK integration approach for Electron bridge.',
          tags: ['purpose:howto', 'area:adk-electron', 'status:active'],
          importance: 20,
          updatedAt: '2026-04-08T09:00:00.000Z',
          meta: {
            expiresAt: '2026-04-15T09:00:00.000Z',
          },
        },
      ]),
    )

    const now = Date.now
    Date.now = () => new Date('2026-04-08T12:00:00.000Z').getTime()

    try {
      const service = new MemoryItemService({ memoryItemRepository: repo as any })
      const results = await Effect.runPromise(
        service.searchMemoryItems(
          { scopeId: 'scope-project-1', scopeResolution: 'explicit' },
          {
            query: 'adk electron bridge',
            tags: ['purpose:howto', 'area:adk-electron'],
          },
          { limit: 2 },
        ),
      )

      expect(results.map((entry) => entry.id)).toEqual(['mem-fresh', 'mem-expired'])
    } finally {
      Date.now = now
    }
  })

  it('builds a curated resume pack with generated synopsis and exact subject priority', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'mem-context-noise',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Generic top-level note that should stay low priority.',
          sourceType: 'aops.smoke',
          sourceId: 'scope-project-1',
          updatedAt: '2026-04-01T08:00:00.000Z',
        },
        {
          id: 'mem-project-generic',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Project carry-forward: rerun API smoke before handoff.',
          tags: ['project:project-1'],
          meta: {
            subjectType: 'projectman.plan',
            subjectId: 'project-1',
            projectId: 'project-1',
            nextAction: 'Run API smoke first.',
          },
          updatedAt: '2026-04-01T08:30:00.000Z',
        },
        {
          id: 'mem-rule',
          scopeId: 'scope-project-1',
          kind: 'rule',
          durability: 'durable',
          content: 'Use the staged migration flow for this repo.',
          sourceType: 'projectman.plan',
          sourceId: 'project-1',
          meta: { patternName: 'staged-migration' },
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'mem-sticky-old',
          scopeId: 'scope-project-1',
          kind: 'rule',
          durability: 'sticky',
          content: 'Old sticky guidance.',
          tags: ['project:project-1', 'sticky'],
          meta: {
            stickyScope: 'project',
            stickyRank: 2,
            projectId: 'project-1',
          },
          updatedAt: '2026-03-01T09:00:00.000Z',
        },
        {
          id: 'mem-sticky-new',
          scopeId: 'scope-project-1',
          kind: 'rule',
          durability: 'sticky',
          content: 'Always read /docs/pagination.md before touching cursor pagination.',
          tags: ['project:project-1', 'sticky'],
          meta: {
            stickyScope: 'project',
            stickyRank: 9,
            supersedes: 'mem-sticky-old',
            projectId: 'project-1',
            nextReadRefs: [{ kind: 'doc', uri: '/docs/pagination.md', documentVersionId: 'docver-1', sectionId: 'section-1' }],
          },
          updatedAt: '2026-04-01T11:00:00.000Z',
        },
        {
          id: 'mem-exact',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Active sprint handoff: continue API pagination fix.',
          sourceType: 'projectman.sprint',
          sourceId: 'sprint-1',
          tags: ['phase:resume', 'sprint:sprint-1'],
          meta: {
            subjectType: 'projectman.sprint',
            subjectId: 'sprint-1',
            nextAction: 'Open pagination adapter tests first.',
            nextReadRefs: [{ kind: 'doc', uri: '/docs/pagination.md', documentVersionId: 'docver-1', sectionId: 'section-1' }],
          },
          updatedAt: '2026-04-01T10:00:00.000Z',
        },
        {
          id: 'mem-exact-older',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Active sprint handoff: continue API pagination fix.',
          sourceType: 'projectman.sprint',
          sourceId: 'sprint-1',
          tags: ['phase:resume', 'sprint:sprint-1'],
          meta: {
            subjectType: 'projectman.sprint',
            subjectId: 'sprint-1',
            nextAction: 'Open pagination adapter tests first.',
          },
          updatedAt: '2026-03-31T10:00:00.000Z',
        },
        {
          id: 'mem-decision',
          scopeId: 'scope-project-1',
          kind: 'note',
          durability: 'durable',
          content: 'Decision: keep cursor token opaque.',
          tags: ['phase:decision'],
          sourceType: 'projectman.sprint',
          sourceId: 'sprint-1',
          updatedAt: '2026-04-01T09:00:00.000Z',
        },
      ]),
    )

    const service = new MemoryItemService({ memoryItemRepository: repo as any })

    const result = await Effect.runPromise(
      service.buildResumePack(
        { scopeId: 'scope-project-1', projectId: 'project-1', scopeResolution: 'explicit' },
        {
          query: 'resume active sprint context',
          runtimeProfile: 'planning',
          subject: { type: 'projectman.sprint', id: 'sprint-1', label: 'Sprint 1' },
          sourceTypes: ['projectman.sprint'],
          sourceIds: ['sprint-1'],
        },
        { depth: 'light', limit: 4 },
      ),
    )

    expect(result.bootstrapGuidance).toEqual(['Always read /docs/pagination.md before touching cursor pagination.'])
    expect(result.relatedMemory.map((entry) => entry.id)).toEqual(['mem-exact', 'mem-decision'])
    expect(result.relatedMemory.map((entry) => entry.id)).not.toContain('mem-exact-older')
    expect(result.relatedMemory.map((entry) => entry.id)).not.toContain('mem-sticky-new')
    expect(result.synopsis.summary).toContain('Active sprint handoff')
    expect(result.synopsis.decisions).toEqual(['Decision: keep cursor token opaque.'])
    expect(result.synopsis.bootstrapGuidance).toEqual(['Always read /docs/pagination.md before touching cursor pagination.'])
    expect(result.nextActions).toEqual(['Open pagination adapter tests first.'])
    expect(result.currentFocus).toBe('Open pagination adapter tests first.')
    expect(result.recommendedRefs).toEqual([{ kind: 'doc', uri: '/docs/pagination.md', documentVersionId: 'docver-1', sectionId: 'section-1' }])
    expect(result.openDecisions).toEqual([])
    expect(result.readStrategy).toBe('recommended')
    expect(result.confidence).toBeGreaterThanOrEqual(85)
  })

  it('keeps project-level rule and generic memory available in deep mode when exact subject is missing', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'mem-project-resume',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Project carry-forward: rerun smoke before opening PR.',
          tags: ['project:project-1'],
          meta: {
            subjectType: 'projectman.plan',
            subjectId: 'project-1',
            projectId: 'project-1',
            nextAction: 'Rerun project smoke before PR.',
          },
          updatedAt: '2026-04-01T08:30:00.000Z',
        },
        {
          id: 'mem-project-rule',
          scopeId: 'scope-project-1',
          kind: 'rule',
          durability: 'durable',
          content: 'Prefer staged migrations for risky refactors.',
          sourceType: 'projectman.plan',
          sourceId: 'project-1',
          meta: { patternName: 'staged-migration' },
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'mem-scope-noise',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Cross-scope note.',
          sourceType: 'aops.smoke',
          sourceId: 'scope-project-1',
          updatedAt: '2026-04-01T07:00:00.000Z',
        },
      ]),
    )

    const service = new MemoryItemService({ memoryItemRepository: repo as any })

    const result = await Effect.runPromise(
      service.buildResumePack(
        { scopeId: 'scope-project-1', projectId: 'project-1', scopeResolution: 'explicit' },
        {
          query: 'resume project context',
          subject: { type: 'projectman.plan', id: 'project-1' },
          sourceTypes: ['projectman.plan'],
          sourceIds: ['project-1'],
        },
        { depth: 'deep', limit: 4 },
      ),
    )

    expect(result.relatedMemory.map((entry) => entry.id)).toEqual(['mem-project-rule', 'mem-project-resume'])
    expect(result.nextActions).toEqual(['Rerun project smoke before PR.'])
    expect(result.resumeSummary).toContain('Project carry-forward')
    expect(result.currentFocus).toBe('Rerun project smoke before PR.')
    expect(result.relatedMemory.map((entry) => entry.id)).not.toContain('mem-scope-noise')
  })

  it('promotes an experience item into a durable memory item with source linkage', async () => {
    const memoryRepo = makeRepo()
    memoryRepo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'mem-1' }))
    const experienceRepo = makeRepo()
    experienceRepo.findById.mockImplementation((id) =>
      Effect.succeed({
        id,
        scopeId: 'scope-project-1',
        type: 'problem-solution',
        title: 'Rebuild stale views',
        problem: 'Views drift after manual edits.',
        solution: 'Regenerate deterministic views from source records.',
        content: 'Use source-of-truth records and regenerate derived views.',
        commands: ['pnpm build'],
        tags: ['cli'],
        sourceRefs: [{ ref: 'pr-1' }],
      }),
    )

    const service = new MemoryItemService({
      memoryItemRepository: memoryRepo as any,
      experienceItemRepository: experienceRepo as any,
    })

    const promoted = await Effect.runPromise(service.promoteFromExperience('exp-1'))

    expect(experienceRepo.findById).toHaveBeenCalledWith('exp-1')
    expect(memoryRepo.create).toHaveBeenCalledTimes(1)
    const created = memoryRepo.create.mock.calls[0][0]
    // durable-memory flavor: faithful durable kind + durability durable.
    expect(created.kind).toBe('note')
    expect(created.durability).toBe('durable')
    expect(created.scopeId).toBe('scope-project-1')
    expect(created.content).toBe('Use source-of-truth records and regenerate derived views.')
    // source linkage back to the experience.
    expect(created.sourceType).toBe('agentspace.experience-item')
    expect(created.sourceId).toBe('exp-1')
    expect(created.meta.promotedFromExperienceId).toBe('exp-1')
    expect(created.meta.experience.title).toBe('Rebuild stale views')
    expect(promoted.id).toBe('mem-1')
  })

  it('promotes an experience item asPlaybook into a playbook-projectable rule memory item', async () => {
    const memoryRepo = makeRepo()
    memoryRepo.create.mockImplementation((data) => Effect.succeed({ ...data, id: 'mem-2' }))
    const experienceRepo = makeRepo()
    experienceRepo.findById.mockImplementation((id) =>
      Effect.succeed({
        id,
        scopeId: 'scope-project-1',
        type: 'technique',
        title: 'Verify-first build loop',
        content: 'Always verify in code before asserting done.',
        commands: ['pnpm test'],
      }),
    )

    const service = new MemoryItemService({
      memoryItemRepository: memoryRepo as any,
      experienceItemRepository: experienceRepo as any,
    })

    await Effect.runPromise(
      service.promoteFromExperience('exp-2', true, { playbookArea: 'backend', reviewState: 'accepted' }),
    )

    const created = memoryRepo.create.mock.calls[0][0]
    // playbook flavor: kind=rule so playbook.list projects it.
    expect(created.kind).toBe('rule')
    expect(created.durability).toBe('durable')
    expect(created.tags).toContain('playbook')
    expect(created.tags).toContain('playbook-scope:project')
    expect(created.tags).toContain('playbook-area:backend')
    expect(created.meta.playbook.area).toBe('backend')
    expect(created.meta.playbook.reviewState).toBe('accepted')
    expect(created.meta.playbook.promotedFromExperienceId).toBe('exp-2')
    expect(created.meta.playbook.steps).toContain('pnpm test')
    expect(created.sourceType).toBe('agentspace.experience-item')
    expect(created.sourceId).toBe('exp-2')
  })

  it('fails promoteFromExperience with a clear error when the experience does not exist', async () => {
    const memoryRepo = makeRepo()
    const experienceRepo = makeRepo()
    experienceRepo.findById.mockImplementation(() => Effect.succeed(null))

    const service = new MemoryItemService({
      memoryItemRepository: memoryRepo as any,
      experienceItemRepository: experienceRepo as any,
    })

    await expect(Effect.runPromise(service.promoteFromExperience('missing-exp'))).rejects.toBeTruthy()
    expect(memoryRepo.create).not.toHaveBeenCalled()
  })

  it('builds a standalone synopsis from memory truth only', async () => {
    const repo = makeRepo()
    repo.find.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'sticky-1',
          scopeId: 'scope-project-1',
          kind: 'rule',
          durability: 'sticky',
          content: 'Always read the migration notes first.',
          meta: { stickyScope: 'project', stickyRank: 4, projectId: 'project-1' },
          updatedAt: '2026-04-02T09:00:00.000Z',
        },
        {
          id: 'resume-1',
          scopeId: 'scope-project-1',
          kind: 'resume',
          durability: 'short',
          content: 'Continue the sprint implementation from failing tests.',
          sourceType: 'projectman.sprint',
          sourceId: 'sprint-1',
          meta: {
            subjectType: 'projectman.sprint',
            subjectId: 'sprint-1',
            nextAction: 'Open the failing pagination test.',
            projectId: 'project-1',
          },
          updatedAt: '2026-04-02T10:00:00.000Z',
        },
        {
          id: 'decision-1',
          scopeId: 'scope-project-1',
          kind: 'note',
          durability: 'durable',
          content: 'Keep cursor tokens opaque.',
          tags: ['phase:decision'],
          sourceType: 'projectman.sprint',
          sourceId: 'sprint-1',
          updatedAt: '2026-04-02T10:30:00.000Z',
        },
      ]),
    )

    const service = new MemoryItemService({ memoryItemRepository: repo as any })
    const synopsis = await Effect.runPromise(
      service.buildSynopsis(
        { scopeId: 'scope-project-1', projectId: 'project-1', scopeResolution: 'explicit' },
        {
          subject: { type: 'projectman.sprint', id: 'sprint-1', label: 'Sprint 1' },
          sourceTypes: ['projectman.sprint'],
          sourceIds: ['sprint-1'],
          query: 'current sprint synopsis',
        },
        { limit: 4 },
      ),
    )

    expect(synopsis.bootstrapGuidance).toEqual(['Always read the migration notes first.'])
    expect(synopsis.decisions).toEqual(['Keep cursor tokens opaque.'])
    expect(synopsis.openItems).toEqual(['Open the failing pagination test.'])
    expect(synopsis.currentFocus).toBe('Open the failing pagination test.')
    expect(synopsis.sourceMemoryIds).toEqual(expect.arrayContaining(['sticky-1', 'resume-1', 'decision-1']))
    expect(synopsis.sourceMemoryIds).toHaveLength(3)
    expect(synopsis.summary).toContain('Continue the sprint implementation')
  })
})
