import { describe, expect, it } from 'vitest'

import { buildAgentspaceDomainCapabilityManifest } from './dcm.js'
import { getAgentspaceOperationContractById } from './contract.js'
import { toPlaybookProjections } from './playbook-projection.js'

describe('Agentspace playbook projection', () => {
  it('publishes playbook.list as a read projection operation', () => {
    const contract = getAgentspaceOperationContractById('playbook.list', { refresh: true })
    expect(contract).toMatchObject({
      operationId: 'playbook.list',
      toolId: 'agentspace.playbook.list',
      serviceEntity: 'playbook',
      sideEffect: 'none',
    })

    const manifest = buildAgentspaceDomainCapabilityManifest({ refresh: true })
    expect(manifest.docs?.operations?.['playbook.list']?.notes?.join('\n')).toMatch(/memory items/)
  })

  it('projects only playbook-tagged memory rules or constraints', () => {
    const projected = toPlaybookProjections([
      {
        id: 'mem-1',
        kind: 'rule',
        durability: 'durable',
        content: '# Hexagen backend playbook',
        tags: ['playbook', 'playbook-scope:project', 'playbook-area:backend'],
        sourceType: 'agentspace.experience-item',
        sourceId: 'exp-1',
        meta: {
          playbook: {
            id: 'hexagen-backend',
            title: 'Hexagen backend playbook',
            scope: 'project',
            area: 'backend',
            reviewState: 'accepted',
            enforcement: 'advisory',
            promotedFromExperienceId: 'exp-1',
          },
        },
      },
      {
        id: 'mem-2',
        kind: 'note',
        durability: 'durable',
        content: 'Descriptive note, not a playbook.',
        tags: ['playbook'],
      },
      {
        id: 'mem-3',
        kind: 'constraint',
        durability: 'short',
        content: 'Session-only playbook',
        tags: ['playbook-scope:session'],
      },
    ], { scope: 'project', area: 'backend' })

    expect(projected).toHaveLength(1)
    expect(projected[0]).toMatchObject({
      id: 'hexagen-backend',
      memoryItemId: 'mem-1',
      scope: 'project',
      area: 'backend',
      reviewState: 'accepted',
      promotedFromExperienceId: 'exp-1',
      projection: {
        kind: 'agentspace.playbook.memory-projection.v1',
        authority: 'agentspace.memory-item',
      },
    })
  })
})
