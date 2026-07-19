import { describe, expect, it } from 'vitest'

import { getAgentspaceOperationContractById } from './contract.js'
import { buildAgentspaceDomainCapabilityManifest } from './dcm.js'
import { buildAgentspaceHostRouteProjection } from './host-projection.js'
import { getAgentspaceContractSchema } from './schemas.js'
import { parseAgentspaceToolInput } from './tool-input.js'

const scope = {
  schemaVersion: 1,
  slug: 'aops-official-catalog',
  kind: 'agentspace-skill-catalog',
  owner: 'aops-community-setup',
  reserved: true,
}

describe('official catalog operation projection', () => {
  it('publishes exactly one read and two apply-guarded composite operations', () => {
    const inspect = getAgentspaceOperationContractById('official-catalog.inspect', { refresh: true })
    const reconcile = getAgentspaceOperationContractById('official-catalog.reconcile', { refresh: true })
    const rollback = getAgentspaceOperationContractById('official-catalog.rollback', { refresh: true })

    expect(inspect).toMatchObject({
      operationId: 'official-catalog.inspect',
      serviceKey: 'skillService',
      serviceEntity: 'official-catalog',
      methodName: 'inspectOfficialCatalog',
      sideEffect: 'none',
    })
    expect(reconcile).toMatchObject({
      operationId: 'official-catalog.reconcile',
      methodName: 'reconcileOfficialCatalog',
      sideEffect: 'db',
      policy: { safety: { applyRequired: true, destructive: false } },
    })
    expect(rollback).toMatchObject({
      operationId: 'official-catalog.rollback',
      methodName: 'rollbackOfficialCatalog',
      sideEffect: 'db',
      policy: { safety: { applyRequired: true, destructive: true, confirmationRequired: true } },
    })
  })

  it('projects strict fixed-scope, signed package, CAS, receipt, and no-effect schemas', () => {
    const inspectInput = getAgentspaceContractSchema('official-catalog.inspect.input') as any
    const reconcileInput = getAgentspaceContractSchema('official-catalog.reconcile.input') as any
    const rollbackInput = getAgentspaceContractSchema('official-catalog.rollback.input') as any
    const receiptOutput = getAgentspaceContractSchema('official-catalog.reconcile.output') as any

    expect(inspectInput).toMatchObject({ type: 'object', additionalProperties: false, required: ['scope'] })
    expect(inspectInput.properties.scope.properties.slug).toEqual({ const: 'aops-official-catalog' })
    expect(reconcileInput.properties.plan.properties).toMatchObject({
      expectedCatalogRevision: { type: 'integer', minimum: 0 },
      historyDeleteCount: { const: 0 },
    })
    expect(reconcileInput.properties.plan.properties.packages.items.properties.meta.properties.aopsOfficialCatalog.properties).toMatchObject({
      source: { const: 'signed-community-release' },
      inert: { const: true },
    })
    expect(rollbackInput.properties.request.properties).toMatchObject({
      deleteHistory: { const: false },
      receiptId: { type: 'string', minLength: 1 },
    })
    expect(receiptOutput.properties).toMatchObject({
      historyDeleteCount: { const: 0 },
      activationEffects: { type: 'array', maxItems: 0 },
    })

    expect(parseAgentspaceToolInput('official-catalog.inspect', { scope })).toEqual({ scope })
    expect(() => parseAgentspaceToolInput('official-catalog.inspect', {
      scope: { ...scope, slug: 'user-catalog' },
    })).toThrow('tool_input_schema_invalid:agentspace.official-catalog.inspect')
    expect(() => parseAgentspaceToolInput('official-catalog.inspect', {
      scope,
      genericCrudFallback: true,
    })).toThrow('unknown_input_arg:genericCrudFallback')
  })

  it('publishes DCM docs and deterministic host routes for all three atoms', () => {
    const manifest = buildAgentspaceDomainCapabilityManifest({ refresh: true, includeDocs: true })
    const operations = manifest.capabilities.operations.filter((entry) => entry.operationId.startsWith('official-catalog.'))
    expect(operations.map((entry) => entry.operationId).sort()).toEqual([
      'official-catalog.inspect',
      'official-catalog.reconcile',
      'official-catalog.rollback',
    ])
    expect(manifest.docs?.operations?.['official-catalog.reconcile']?.notes?.join('\n')).toMatch(/only supported write boundary/)
    expect(manifest.docs?.operations?.['official-catalog.rollback']?.notes?.join('\n')).toMatch(/never deletes/)

    const routes = buildAgentspaceHostRouteProjection({ refresh: true })
      .filter((entry) => entry.operation.startsWith('official-catalog.'))
    expect(routes.map((entry) => [entry.id, entry.method, entry.pattern])).toEqual([
      ['agentspace.official-catalog.inspect', 'POST', '/operations/official-catalog/inspect'],
      ['agentspace.official-catalog.reconcile', 'POST', '/operations/official-catalog/reconcile'],
      ['agentspace.official-catalog.rollback', 'POST', '/operations/official-catalog/rollback'],
    ])
  })
})
