import { describe, expect, it } from 'vitest'

import { getAgentspaceContractSchema } from './schemas.js'
import { parseAgentspaceToolInput } from './tool-input.js'
import { buildAgentspaceDomainCapabilityManifest } from './dcm.js'

describe('skill discovery and package export operation schemas', () => {
  it('keeps search/ask inputs strict and bounded', () => {
    const schema = getAgentspaceContractSchema('skill.search.input') as any
    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['query'],
    })
    expect(schema.properties.limit).toMatchObject({ minimum: 1, maximum: 5 })

    expect(parseAgentspaceToolInput('skill.search', {
      query: 'project management',
      scopeId: 'project-1',
      scopeResolution: 'explicit',
      limit: 5,
    })).toEqual({
      query: 'project management',
      scopeId: 'project-1',
      scopeResolution: 'explicit',
      limit: 5,
    })
    expect(() => parseAgentspaceToolInput('skill.ask', { query: 'kanban', limit: 6 })).toThrow(
      'tool_input_schema_invalid:agentspace.skill.ask',
    )
  })

  it('projects strict metadata-only and trusted package output contracts', () => {
    const searchOutput = getAgentspaceContractSchema('skill.search.output') as any
    expect(searchOutput.additionalProperties).toBe(false)
    expect(searchOutput.properties.candidates.maxItems).toBe(5)
    expect(searchOutput.properties.candidates.items.properties).not.toHaveProperty('content')
    expect(searchOutput.properties.candidates.items.properties).not.toHaveProperty('files')
    expect(searchOutput.properties.candidates.items.required).toEqual(expect.arrayContaining([
      'packageSha256',
      'contentSha256',
      'computedTrustClass',
      'rationale',
    ]))
    expect(searchOutput.properties.candidates.items.properties.computedTrustClass).toEqual({
      const: 'verified-hosted-package',
    })
    expect(searchOutput.properties.candidates.items.properties.rationale).toMatchObject({ maxLength: 160 })

    const exportOutput = getAgentspaceContractSchema('skill-version.export-skill-package.output') as any
    expect(exportOutput.additionalProperties).toBe(false)
    expect(exportOutput.properties.manifest.properties.provenance.properties).toMatchObject({
      trustClass: { const: 'verified-hosted-package' },
      expectedDigestSource: { const: 'immutable-hosted-metadata' },
    })
    expect(exportOutput.required).toContain('skillName')
    expect(exportOutput.properties.package.properties).not.toHaveProperty('sourcePath')

    const manifest = buildAgentspaceDomainCapabilityManifest({ refresh: true })
    expect(manifest.contracts?.schemas['skill.search.output']).toMatchObject(searchOutput)
    expect(manifest.docs?.operations?.['skill.search']?.notes?.join('\n')).toMatch(/2 KiB/)
    expect(manifest.docs?.operations?.['skill.search']?.notes?.join('\n')).toMatch(/entry-content SHA-256/)
  })
})
