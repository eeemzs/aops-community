import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { createHash } from 'node:crypto'

import { SkillService } from '../service.skill.js'

function sha256(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex')
}

function packageMeta(name: string, versionId: string, version: number, content = '# Package\n') {
  const contentSha256 = sha256(content)
  const packageSha256 = sha256(`SKILL.md\0${contentSha256}\n`)
  return {
    packageManifestV1: {
      schemaVersion: 1,
      assetKind: 'skill-package',
      name,
      version: String(version),
      versionId,
      entryFile: 'SKILL.md',
      standard: 'aops-skill-package-v1',
      packageSha256,
      files: [{ path: 'SKILL.md', sha256: contentSha256, byteLength: Buffer.byteLength(content, 'utf8') }],
      compatibility: { minCliVersion: '0.1.0', maxSchemaVersion: 1 },
      provenance: {
        trustClass: 'verified-hosted-package',
        expectedDigestSource: 'immutable-hosted-metadata',
        reference: `skill-version:${versionId}`,
      },
    },
  }
}

function makeSkillRepo(skills: unknown[]) {
  return {
    find: vi.fn(() => Effect.succeed(skills)),
    findById: vi.fn(),
    create: vi.fn(),
    patchById: vi.fn(),
    deleteById: vi.fn(),
  }
}

function makeVersionRepo(versions: Map<string, unknown>) {
  return {
    findById: vi.fn((id: string) => Effect.succeed(versions.get(id) ?? null)),
    find: vi.fn(),
    create: vi.fn(),
    patchById: vi.fn(),
    deleteById: vi.fn(),
  }
}

describe('SkillService metadata discovery', () => {
  it('ranks deterministic TR/EN raw metadata matches without reading skill bodies', async () => {
    const skills = [
      {
        id: 'skill-projectman',
        scopeId: 'project-1',
        name: 'aops-cli-projectman',
        shortDescription: 'Project planning CLI guide',
        description: 'Kanban and sprint command help.',
        tags: ['pm', 'planning'],
        currentVersionId: 'version-projectman',
      },
      {
        id: 'skill-draft',
        scopeId: 'project-1',
        name: 'draft-project-manager',
        currentVersionId: 'version-draft',
      },
    ]
    const versions = new Map<string, unknown>([
      ['version-projectman', {
        id: 'version-projectman',
        projectId: 'project-1',
        skillId: 'skill-projectman',
        version: 7,
        status: 'published',
        content: 'BODY-MUST-NOT-BE-SEARCHED',
        entryFile: 'SKILL.md',
        skillStandard: 'aops-skill-package-v1',
        meta: {
          ...packageMeta('aops-cli-projectman', 'version-projectman', 7),
          discovery: {
            aliases: ['proje yönetimi', 'project management'],
            cliFamilies: ['pm'],
            domains: ['projectman'],
          },
        },
      }],
      ['version-draft', {
        id: 'version-draft',
        projectId: 'project-1',
        skillId: 'skill-draft',
        version: 1,
        status: 'draft',
        content: 'proje yönetimi kanban',
        entryFile: 'SKILL.md',
        skillStandard: 'aops-skill-v1',
      }],
    ])
    const skillRepo = makeSkillRepo(skills)
    const versionRepo = makeVersionRepo(versions)
    const service = new SkillService({
      skillRepository: skillRepo as any,
      skillVersionRepository: versionRepo as any,
    })

    const turkish = await Effect.runPromise(service.searchSkills('Proje yönetimi', 'project-1', 'explicit', 5))
    const english = await Effect.runPromise(service.searchSkills('kanban', 'project-1', 'explicit', 5))

    expect(turkish.candidates).toHaveLength(1)
    expect(turkish.candidates[0]).toMatchObject({
      skillId: 'skill-projectman',
      versionId: 'version-projectman',
      exactRef: 'skill-version:version-projectman',
      version: '7',
      origin: 'hosted',
      computedTrustClass: 'verified-hosted-package',
    })
    expect(turkish.candidates[0]?.packageSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(turkish.candidates[0]?.contentSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(turkish.candidates[0]?.matchedBy).toContain('meta.discovery.aliases')
    expect(turkish.candidates[0]?.rationale).toContain('meta.discovery.aliases')
    expect(english.candidates[0]?.matchedBy).toContain('description')
    expect(english.candidates.some((candidate) => candidate.skillId === 'skill-draft')).toBe(false)
  })

  it('keeps the 1000-skill corpus bounded to five deterministic candidates', async () => {
    const skills = Array.from({ length: 1_000 }, (_, index) => ({
      id: `skill-${String(index).padStart(4, '0')}`,
      scopeId: 'project-1',
      name: index < 20 ? `kanban-${String(index).padStart(4, '0')}` : `fixture-${String(index).padStart(4, '0')}`,
      shortDescription: index < 20 ? 'Kanban CLI family' : 'Unrelated hosted skill',
      currentVersionId: `version-${String(index).padStart(4, '0')}`,
    }))
    const versions = new Map(skills.map((skill, index) => [skill.currentVersionId, {
      id: skill.currentVersionId,
      projectId: 'project-1',
      skillId: skill.id,
      version: 1,
      status: 'published',
      content: index >= 20 ? 'kanban appears only in body' : '# Matching package',
      entryFile: 'SKILL.md',
      skillStandard: 'aops-skill-package-v1',
      meta: packageMeta(skill.name, skill.currentVersionId, 1),
    }]))
    const service = new SkillService({
      skillRepository: makeSkillRepo(skills) as any,
      skillVersionRepository: makeVersionRepo(versions) as any,
    })

    const result = await Effect.runPromise(service.searchSkills('kanban', 'project-1', 'explicit', 5))
    const reversed = await Effect.runPromise(new SkillService({
      skillRepository: makeSkillRepo([...skills].reverse()) as any,
      skillVersionRepository: makeVersionRepo(versions) as any,
    }).searchSkills('kanban', 'project-1', 'explicit', 5))

    expect(result.count).toBeGreaterThanOrEqual(1)
    expect(result.count).toBeLessThanOrEqual(5)
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(2 * 1024)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual([
      'kanban-0000',
      'kanban-0001',
      'kanban-0002',
      'kanban-0003',
      'kanban-0004',
    ].slice(0, result.count))
    expect(reversed).toEqual(result)
  })

  it('builds ask as a bounded projection of one search retrieval', async () => {
    const skills = [{
      id: 'skill-1',
      scopeId: 'project-1',
      name: 'aops-cli-projectman',
      shortDescription: 'Kanban CLI guide',
      currentVersionId: 'version-1',
    }]
    const versionRepo = makeVersionRepo(new Map([['version-1', {
      id: 'version-1',
      projectId: 'project-1',
      skillId: 'skill-1',
      version: 3,
      status: 'published',
      content: '# Body',
      entryFile: 'SKILL.md',
      skillStandard: 'aops-skill-package-v1',
      meta: packageMeta('aops-cli-projectman', 'version-1', 3),
    }]]))
    const service = new SkillService({
      skillRepository: makeSkillRepo(skills) as any,
      skillVersionRepository: versionRepo as any,
    })

    const result = await Effect.runPromise(service.askSkills('kanban', 'project-1', 'explicit', 3))

    expect(result.candidates).toHaveLength(1)
    expect(result.answer).toContain('skill-version:version-1')
    expect(result.answer).toContain('Matched raw metadata')
    expect(result.answer).not.toContain('# Body')
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(2 * 1024)
    expect(versionRepo.findById).toHaveBeenCalledTimes(1)
  })

  it('excludes current published versions without self-consistent immutable metadata', async () => {
    const skills = [{
      id: 'skill-1',
      scopeId: 'project-1',
      name: 'kanban-guide',
      description: 'Kanban planning',
      currentVersionId: 'version-1',
    }]
    const meta = packageMeta('kanban-guide', 'version-1', 1)
    meta.packageManifestV1.packageSha256 = 'f'.repeat(64)
    const service = new SkillService({
      skillRepository: makeSkillRepo(skills) as any,
      skillVersionRepository: makeVersionRepo(new Map([['version-1', {
        id: 'version-1',
        projectId: 'project-1',
        skillId: 'skill-1',
        version: 1,
        status: 'published',
        content: 'kanban body must not establish trust',
        entryFile: 'SKILL.md',
        skillStandard: 'aops-skill-package-v1',
        meta,
      }]])) as any,
    })

    const result = await Effect.runPromise(service.searchSkills('kanban', 'project-1', 'explicit', 5))

    expect(result).toMatchObject({ count: 0, candidates: [] })
  })

  it('does not touch package bodies while deriving digest and trust evidence from immutable metadata', async () => {
    const version = {
      id: 'version-1',
      projectId: 'project-1',
      skillId: 'skill-1',
      version: 1,
      status: 'published',
      entryFile: 'SKILL.md',
      skillStandard: 'aops-skill-package-v1',
      meta: packageMeta('kanban-guide', 'version-1', 1),
    }
    Object.defineProperties(version, {
      content: { get: () => { throw new Error('content_body_read') } },
      files: { get: () => { throw new Error('package_files_read') } },
    })
    const service = new SkillService({
      skillRepository: makeSkillRepo([{
        id: 'skill-1',
        scopeId: 'project-1',
        name: 'kanban-guide',
        description: 'Kanban planning',
        currentVersionId: 'version-1',
      }]) as any,
      skillVersionRepository: makeVersionRepo(new Map([['version-1', version]])) as any,
    })

    const result = await Effect.runPromise(service.searchSkills('kanban', 'project-1', 'explicit', 5))

    expect(result.candidates[0]).toMatchObject({
      computedTrustClass: 'verified-hosted-package',
      packageSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })
})
