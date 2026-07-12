import { describe, expect, it } from 'vitest'

import { getAgentspaceContractSchema } from './schemas.js'
import { parseAgentspaceToolInput } from './tool-input.js'

describe('Agentspace memory-item checkpoint input schema', () => {
  it('publishes checkpoint in memory-item create schemas and injects scope context', () => {
    const schema = getAgentspaceContractSchema('memory-item.create.input') as any

    expect(schema?.properties?.data?.properties?.kind?.enum).toContain('checkpoint')

    const parsed = parseAgentspaceToolInput('memory-item.create', {
      projectId: 'scope-1',
      kind: 'checkpoint',
      durability: 'short',
      content: 'Hosted checkpoint.',
      meta: {
        checkpointAs: 'session',
        checkpoint: {
          summary: 'Schema-visible checkpoint.',
        },
      },
    } as any) as any

    expect(parsed.data).toMatchObject({
      scopeId: 'scope-1',
      kind: 'checkpoint',
      durability: 'short',
      content: 'Hosted checkpoint.',
    })
  })

  it('rejects unsupported memory item kinds before invoke dispatch', () => {
    expect(() =>
      parseAgentspaceToolInput('memory-item.create', {
        projectId: 'scope-1',
        kind: 'milestone',
        durability: 'short',
        content: 'Unsupported kind.',
      } as any),
    ).toThrow(/tool_input_schema_invalid:agentspace\.memory-item\.create/)
  })
})
