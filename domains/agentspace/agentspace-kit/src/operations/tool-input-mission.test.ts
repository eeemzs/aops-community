import { describe, expect, it } from 'vitest'

import { getAgentspaceOperationContractById } from './contract.js'
import { getAgentspaceContractSchema } from './schemas.js'
import { parseAgentspaceToolInput } from './tool-input.js'

describe('Agentspace mission operation inputs', () => {
  it('publishes mission.delete as a strict id-only hosted write', () => {
    const contract = getAgentspaceOperationContractById('mission.delete')
    const schema = getAgentspaceContractSchema('mission.delete.input') as any

    expect(contract).toMatchObject({
      operationId: 'mission.delete',
      toolId: 'agentspace.mission.delete',
      kind: 'delete',
      serviceKey: 'missionService',
      methodName: 'removeMission',
    })
    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['id'],
    })
    expect(parseAgentspaceToolInput('mission.delete', { id: 'mission-1' })).toEqual({ id: 'mission-1' })
    expect(() => parseAgentspaceToolInput('mission.delete', { id: 'mission-1', force: true } as any)).toThrow(
      /additional properties/,
    )
  })
})
