import { describe, expect, it } from 'vitest'

import { getProjectmanOperationContractById } from '../operations/contract.js'
import { buildProjectmanDomainCapabilityManifest } from '../operations/dcm.js'
import { buildProjectmanHostRouteProjection } from '../operations/host-projection.js'

describe('projectman-kit DCM manifest', () => {
  it('uses operation args for sprint.update-plan input schema', () => {
    const manifest = buildProjectmanDomainCapabilityManifest()
    const schema = manifest.contracts?.schemas['sprint.update-plan.input'] as
      | {
          required?: string[]
          properties?: Record<string, unknown>
        }
      | undefined

    expect(schema).toBeTruthy()
    expect(schema?.required).toEqual(['id'])
    expect(schema?.properties?.id).toMatchObject({ type: 'string' })
    expect(schema?.properties?.expectedUpdatedAt).toMatchObject({
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
    })
    expect(schema?.properties?.sourceCreatedAt).toMatchObject({
      anyOf: [{}, { type: 'null' }],
    })
    expect(schema?.properties?.sourceUpdatedAt).toMatchObject({
      anyOf: [{}, { type: 'null' }],
    })
  })

  it('models sprint plan collections as arrays in the agent manifest schema', () => {
    const manifest = buildProjectmanDomainCapabilityManifest()
    const schema = manifest.contracts?.schemas['sprint.update-plan.input'] as
      | {
          properties?: Record<string, unknown>
        }
      | undefined

    expect(schema?.properties?.references).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    })
    expect(schema?.properties?.scope).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    })
    expect(schema?.properties?.validationPlan).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    })
    expect(schema?.properties?.expectedUpdatedAt).toMatchObject({
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
    })
    expect(schema?.properties?.phases).toMatchObject({
      type: 'array',
    })
  })

  it('exposes implementation-plan facade schemas over the sprint plan contract shape', () => {
    const manifest = buildProjectmanDomainCapabilityManifest()
    const updateSchema = manifest.contracts?.schemas['implementation-plan.update.input'] as
      | {
          required?: string[]
          properties?: Record<string, unknown>
        }
      | undefined
    const createSchema = manifest.contracts?.schemas['implementation-plan.create.input'] as
      | {
          required?: string[]
          properties?: Record<string, unknown>
        }
      | undefined

    expect(updateSchema).toBeTruthy()
    expect(updateSchema?.required).toEqual(['id'])
    expect(updateSchema?.properties?.phases).toMatchObject({ type: 'array' })
    expect(updateSchema?.properties?.expectedUpdatedAt).toMatchObject({
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
    })
    expect(createSchema?.required).toEqual(['kanbanTask', 'name', 'goal'])
    expect(createSchema?.properties?.kanbanTask).toMatchObject({ type: 'string' })
  })

  it('uses the strict tool-input schema shape for review-request result manifest validation', () => {
    const manifest = buildProjectmanDomainCapabilityManifest()
    const schema = manifest.contracts?.schemas['review-request.add-result.input'] as
      | {
          additionalProperties?: unknown
          properties?: Record<string, unknown>
        }
      | undefined

    expect(schema).toBeTruthy()
    expect(Object.prototype.hasOwnProperty.call(schema ?? {}, '$schema')).toBe(false)
    expect(schema?.additionalProperties).toBe(true)
    for (const key of ['positives', 'concerns', 'objections', 'references', 'issueIds']) {
      expect(schema?.properties?.[key]).toMatchObject({
        type: 'array',
        items: { type: 'string', minLength: 1 },
      })
    }
    expect(schema?.properties?.basedOnSeqRange).toMatchObject({
      type: 'object',
    })
    expect(schema?.properties?.collabResultEventId).toMatchObject({
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
    })
    expect(schema?.properties?.idempotencyKey).toMatchObject({
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
    })
  })

  it('projects sprint planning operations onto semantic sprint routes', () => {
    const routes = buildProjectmanHostRouteProjection()
    const updatePlanRoute = routes.find((entry) => entry.operation === 'sprint.update-plan')
    const microtaskStatusRoute = routes.find((entry) => entry.operation === 'sprint.update-microtask-status')
    const implementationPlanRoute = routes.find((entry) => entry.operation === 'implementation-plan.update')
    const implementationPlanMicrotaskRoute = routes.find((entry) => entry.operation === 'implementation-plan.add-microtask')

    expect(updatePlanRoute).toMatchObject({
      method: 'POST',
      pattern: '/sprints/:id/plan',
    })
    expect(microtaskStatusRoute).toMatchObject({
      method: 'POST',
      pattern: '/sprints/:id/microtasks/status',
    })
    expect(implementationPlanRoute).toMatchObject({
      method: 'POST',
      pattern: '/implementation-plans/:id/plan',
    })
    expect(implementationPlanMicrotaskRoute).toMatchObject({
      method: 'POST',
      pattern: '/implementation-plans/:id/microtasks',
    })
  })

  it('projects current custom operations onto semantic routes instead of generic fallback paths', () => {
    const routes = buildProjectmanHostRouteProjection()

    expect(routes.find((entry) => entry.operation === 'kanban-task.move')).toMatchObject({
      method: 'POST',
      pattern: '/kanban-tasks/:id/move',
    })
    expect(routes.find((entry) => entry.operation === 'kanban-task.reorder')).toMatchObject({
      method: 'POST',
      pattern: '/kanban-tasks/reorder',
    })
    expect(routes.find((entry) => entry.operation === 'kanban-template.apply')).toMatchObject({
      method: 'POST',
      pattern: '/kanban-templates/:id/apply',
    })
  })

  it('includes agent guidance fields for core planning operations', () => {
    const manifest = buildProjectmanDomainCapabilityManifest()
    const kanbanColumnList = manifest.docs?.operations?.['kanban-column.list']
    const sprintUpdatePlan = manifest.docs?.operations?.['sprint.update-plan']
    const sprintAddMicrotask = manifest.docs?.operations?.['sprint.add-microtask']
    const sprintUpdateMicrotask = manifest.docs?.operations?.['sprint.update-microtask']
    const implementationPlanCreate = manifest.docs?.operations?.['implementation-plan.create']
    const implementationPlanUpdate = manifest.docs?.operations?.['implementation-plan.update']
    const templateApply = manifest.docs?.operations?.['kanban-template.apply']

    expect(kanbanColumnList?.notes).toContain(
      'Each board should normally own its own column records; board specificity still lives in kanban-board-column links.',
    )
    expect(sprintUpdatePlan?.notes).toContain(
      'Pass expectedUpdatedAt from the latest sprint snapshot to prevent stale overwrite conflicts.',
    )
    expect(sprintAddMicrotask?.antiPatterns).toContain(
      'Reading a sprint snapshot and rewriting the full plan just to add one checklist item.',
    )
    expect(sprintUpdateMicrotask?.postconditions).toContain(
      'Sibling microtasks stay intact while the target microtask is patched or repositioned.',
    )
    expect(implementationPlanCreate?.notes).toContain(
      'Implementation plans are a facade over sprint execution documents; the plan id is the sprint id.',
    )
    expect(implementationPlanUpdate?.antiPatterns).toContain(
      'Treating implementation-plan.update as a separate storage owner from sprint.update-plan.',
    )
    expect(templateApply?.notes).toContain(
      'Use this one-shot bulk clone when the goal is board bootstrap with default columns.',
    )
  })

  it('ships concrete examples for agent-facing planning operations', () => {
    const taskCreate = getProjectmanOperationContractById('kanban-task.create')
    const sprintUpdatePlan = getProjectmanOperationContractById('sprint.update-plan')
    const sprintAddMicrotask = getProjectmanOperationContractById('sprint.add-microtask')
    const implementationPlanCreate = getProjectmanOperationContractById('implementation-plan.create')
    const implementationPlanUpdate = getProjectmanOperationContractById('implementation-plan.update')
    const templateApply = getProjectmanOperationContractById('kanban-template.apply')

    expect(taskCreate?.examples?.[0]).toContain('"boardColumn":"<boardColumnId>"')
    expect(taskCreate?.examples?.[0]).toContain('"scopeId":"<scopeId>"')
    expect(taskCreate?.examples?.[0]).not.toContain('"project"')
    expect(sprintUpdatePlan?.examples?.[0]).toContain('"expectedUpdatedAt":"<latest-sprint-updatedAt>"')
    expect(sprintAddMicrotask?.examples?.[0]).toContain('"phase":"<phaseName-or-phaseId>"')
    expect(sprintAddMicrotask?.examples?.[0]).not.toContain('"project"')
    expect(implementationPlanCreate?.examples?.[0]).toContain('"kanbanTask":"<taskId>"')
    expect(implementationPlanUpdate?.examples?.[0]).toContain('"id":"<planId-or-sprintId>"')
    expect(templateApply?.examples?.[0]).toContain('"scopeId":"<scopeId>"')
    expect(templateApply?.examples?.[0]).not.toContain('"project"')
  })
})
