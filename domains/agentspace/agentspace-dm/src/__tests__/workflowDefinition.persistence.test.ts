import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { getTableName } from 'drizzle-orm'

import { workflowDefinitionZodSchemaInsert } from '../domain/models/workflowDefinition/zod.schema.js'
import { workflowDefinitionTable } from '../infrastructure/db/workflowDefinition/drizzle/drizzle.schema.workflowDefinition.js'
import { workflowDefinitionTableSqlite } from '../infrastructure/db/workflowDefinition/drizzle/drizzle.schema.workflowDefinition.sqlite.js'
import { WorkflowDefinitionService } from '../application/services/service.workflowDefinition.js'

describe('workflowDefinition persistence contract', () => {
  it('keeps insert schema strict and accepts the canonical payload', () => {
    const payload = {
      scopeId: 'project-1',
      definitionId: 'wf-template-1',
      name: 'Template workflow',
      mode: 'template',
      subjectType: 'projectman.issue',
      runtimeProfile: 'codex',
      steps: [{ stepId: 'step-1', kind: 'run-turn' }],
      policies: { retry: 1 },
      meta: { source: 'test' },
    }

    expect(workflowDefinitionZodSchemaInsert.parse(payload)).toMatchObject(payload)
    expect(() =>
      workflowDefinitionZodSchemaInsert.parse({
        ...payload,
        unexpected: true,
      })
    ).toThrow()
  })

  it('exports the expected workflow-definition table names', () => {
    expect(getTableName(workflowDefinitionTable)).toBe('workflow-definitions')
    expect(getTableName(workflowDefinitionTableSqlite)).toBe('workflow-definitions')
  })

  it('upserts definitions with scope/definition canonical match keys', async () => {
    const calls: Array<{ data: unknown; matchEq: unknown }> = []
    const service = new WorkflowDefinitionService({
      workflowDefinitionRepository: {
        findById: () => Effect.succeed(null as never),
        create: () => Effect.fail(new Error('create_not_used')),
        find: () => Effect.succeed([]),
        patchById: () => Effect.fail(new Error('patch_not_used')),
        insertMany: () => Effect.fail(new Error('insert_many_not_used')),
        updateById: () => Effect.fail(new Error('update_not_used')),
        upsert: (data, matchEq) => {
          calls.push({ data, matchEq })
          return Effect.succeed({
            id: 'wf-row-1',
            tenantId: 'tenant-1',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          })
        },
        deleteById: () => Effect.fail(new Error('delete_not_used')),
        deleteByIdWithMatch: () => Effect.fail(new Error('delete_with_match_not_used')),
        deleteMany: () => Effect.fail(new Error('delete_many_not_used')),
        cleanupAll: () => Effect.fail(new Error('cleanup_not_used')),
      },
    })

    const result = await Effect.runPromise(
      service.upsertWorkflowDefinition({
        scopeId: 'project-1',
        definitionId: 'wf-template-1',
        name: 'Template workflow',
        mode: 'template',
        subjectType: 'projectman.issue',
        runtimeProfile: 'codex',
        steps: [{ stepId: 'step-1', kind: 'run-turn' }],
        policies: { retry: 1 },
        meta: { source: 'test' },
      })
    )

    expect(result).toMatchObject({
      definitionId: 'wf-template-1',
      scopeId: 'project-1',
    })
    expect(calls).toEqual([
      expect.objectContaining({
        matchEq: {
          scopeId: 'project-1',
          definitionId: 'wf-template-1',
        },
      }),
    ])
  })
})
