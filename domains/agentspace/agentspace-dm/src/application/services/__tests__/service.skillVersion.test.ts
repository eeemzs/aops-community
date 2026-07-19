import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'

import { SkillVersionService } from '../service.skillVersion.js'

const makeSkillVersionRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
  deleteById: vi.fn(),
})

const makeSkillService = () => ({
  getById: vi.fn(),
  updateSkill: vi.fn(),
  listSkills: vi.fn(),
  create: vi.fn(),
})

const makeResourceService = () => ({
  listResources: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
})

describe('SkillVersionService', () => {
  it('computes next imported version from the highest existing version even when repo order is unstable', async () => {
    const repo = makeSkillVersionRepo()
    const skillService = makeSkillService()

    skillService.listSkills.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'skill-1',
          scopeType: 'project',
          scopeId: 'project-1',
          name: 'my-skill',
          description: 'Example skill',
          shortDescription: 'Example short description',
          tags: ['skill-package'],
          createdBy: 'unit-test',
          updatedBy: 'unit-test',
        } as any,
      ])
    )
    skillService.updateSkill.mockImplementation((id, patch) =>
      Effect.succeed({
        id,
        scopeType: 'project',
        scopeId: 'project-1',
        name: 'my-skill',
        description: 'Example skill',
        shortDescription: 'Example short description',
        tags: ['skill-package'],
        createdBy: 'unit-test',
        updatedBy: 'unit-test',
        ...patch,
      } as any)
    )

    repo.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'version-1', version: 1, status: 'published', skillId: 'skill-1' } as any,
        { id: 'version-3', version: 3, status: 'draft', skillId: 'skill-1' } as any,
        { id: 'version-2', version: 2, status: 'published', skillId: 'skill-1' } as any,
      ])
    )
    repo.create.mockImplementation((data) =>
      Effect.succeed({
        id: 'version-4',
        projectId: data.projectId,
        skillId: data.skillId,
        version: data.version,
        status: data.status,
        content: data.content,
        entryFile: data.entryFile,
        skillStandard: data.skillStandard,
        files: data.files,
        meta: data.meta,
        refType: data.refType,
        refId: data.refId,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      } as any)
    )

    const service = new SkillVersionService({
      skillVersionRepository: repo as any,
      skillService: skillService as any,
    })

    const result = await Effect.runPromise(
      service.importSkillPackage({
        projectId: 'project-1',
        scopeId: 'project-1',
        scopeType: 'project',
        createdBy: 'unit-test',
        updatedBy: 'unit-test',
        bundle: {
          sourcePath: '/tmp/my-skill',
          metadata: {
            source: 'unit-test',
          },
          files: [
            {
              path: 'SKILL.md',
              kind: 'instruction',
              content: '---\nname: my-skill\ndescription: Example skill\n---\n\n# My Skill\n',
            },
          ],
        },
      })
    )

    expect(result.skillVersion?.version).toBe(4)
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ version: 4, projectId: 'project-1' }))
  })

  it('syncs currentVersionId to the highest published version even when repo order is unstable', async () => {
    const repo = makeSkillVersionRepo()
    const skillService = makeSkillService()

    repo.findById.mockImplementation(() =>
      Effect.succeed({
        id: 'version-3',
        projectId: 'project-1',
        skillId: 'skill-1',
        version: 3,
        status: 'draft',
        content: '# v3',
        entryFile: 'SKILL.md',
        skillStandard: 'aops-skill-package-v1',
        files: [{ path: 'SKILL.md', content: '# v3' }],
      } as any)
    )
    skillService.getById.mockImplementation(() => Effect.succeed({
      id: 'skill-1',
      name: 'skill-1',
      scopeId: 'project-1',
      currentVersionId: null,
    } as any))
    repo.patchById.mockImplementation((id, patch) =>
      Effect.succeed({
        id,
        projectId: 'project-1',
        skillId: 'skill-1',
        version: 3,
        status: patch.status ?? 'published',
        publishedAt: patch.publishedAt,
        updatedBy: patch.updatedBy,
      } as any)
    )
    repo.find.mockImplementation(() =>
      Effect.succeed([
        { id: 'version-1', version: 1, status: 'published', skillId: 'skill-1' } as any,
        { id: 'version-3', version: 3, status: 'published', skillId: 'skill-1' } as any,
        { id: 'version-2', version: 2, status: 'published', skillId: 'skill-1' } as any,
      ])
    )
    skillService.updateSkill.mockImplementation((id, patch) =>
      Effect.succeed({
        id,
        currentVersionId: patch.currentVersionId ?? null,
        updatedBy: patch.updatedBy,
      } as any)
    )

    const service = new SkillVersionService({
      skillVersionRepository: repo as any,
      skillService: skillService as any,
    })

    await Effect.runPromise(service.publishSkillVersion('version-3', 'unit-test'))

    expect(skillService.updateSkill).toHaveBeenCalledWith(
      'skill-1',
      expect.objectContaining({
        currentVersionId: 'version-3',
        updatedBy: 'unit-test',
      })
    )
  })

  it('clears currentVersionId when removing the last published version even if updatedBy is null', async () => {
    const repo = makeSkillVersionRepo()
    const skillService = makeSkillService()

    repo.findById.mockImplementation(() =>
      Effect.succeed({
        id: 'version-9',
        projectId: 'project-1',
        skillId: 'skill-1',
        version: 9,
        status: 'published',
        content: '# v9',
        entryFile: 'SKILL.md',
        skillStandard: 'aops-skill-package-v1',
        files: [],
        updatedBy: null,
      } as any)
    )
    repo.deleteById.mockImplementation(() => Effect.succeed(1))
    repo.find.mockImplementation(() => Effect.succeed([]))
    skillService.updateSkill.mockImplementation((id, patch) =>
      Effect.succeed({
        id,
        currentVersionId: patch.currentVersionId ?? null,
        updatedBy: patch.updatedBy,
      } as any)
    )

    const service = new SkillVersionService({
      skillVersionRepository: repo as any,
      skillService: skillService as any,
    })

    await Effect.runPromise(service.removeSkillVersion('version-9'))

    expect(skillService.updateSkill).toHaveBeenCalledWith(
      'skill-1',
      expect.objectContaining({
        currentVersionId: null,
      })
    )
    expect(skillService.updateSkill).not.toHaveBeenCalledWith(
      'skill-1',
      expect.objectContaining({
        updatedBy: null,
      })
    )
  })

  it('publishes immutable digest metadata and exports only the current published package without server paths', async () => {
    const repo = makeSkillVersionRepo()
    const skillService = makeSkillService()
    let currentVersion: any = {
      id: 'version-1',
      projectId: 'project-1',
      skillId: 'skill-1',
      version: 3,
      status: 'draft',
      content: '# ignored',
      entryFile: 'SKILL.md',
      skillStandard: 'aops-skill-package-v1',
      files: [
        {
          path: 'SKILL.md',
          content: '---\nname: my-skill\ndescription: Example\n---\n',
          kind: 'instruction',
        },
        {
          path: 'references/checklist.md',
          content: '# Checklist\n',
          kind: 'reference',
        },
      ],
      meta: {
        packageFormat: 'filesystem-skill-package',
        package: {
          entryFile: 'SKILL.md',
          standard: 'aops-skill-package-v1',
          sourcePath: '/tmp/my-skill',
          metadata: {
            source: 'unit-test',
            purpose: 'export-check',
            nested: { fullPath: 'C:\\server\\secret', safe: 'kept' },
          },
          fileCount: 2,
        },
      },
    }
    let currentSkill: any = { id: 'skill-1', name: 'my-skill', scopeId: 'project-1', currentVersionId: null }
    repo.findById.mockImplementation(() => Effect.succeed(currentVersion))
    repo.patchById.mockImplementation((_id, patch) => {
      currentVersion = { ...currentVersion, ...patch }
      return Effect.succeed(currentVersion)
    })
    repo.find.mockImplementation(() => Effect.succeed([currentVersion]))
    skillService.getById.mockImplementation(() => Effect.succeed(currentSkill))
    skillService.updateSkill.mockImplementation((_id, patch) => {
      currentSkill = { ...currentSkill, ...patch }
      return Effect.succeed(currentSkill)
    })

    const service = new SkillVersionService({
      skillVersionRepository: repo as any,
      skillService: skillService as any,
    })

    await Effect.runPromise(service.publishSkillVersion('version-1', 'unit-test'))
    const result = await Effect.runPromise(service.exportSkillPackage('version-1'))

    expect(result.package).toEqual({
      entryFile: 'SKILL.md',
      standard: 'aops-skill-package-v1',
      format: 'filesystem-skill-package',
      fileCount: 2,
      compatibility: {
        minCliVersion: '0.1.0',
        maxSchemaVersion: 1,
      },
      metadata: {
        source: 'unit-test',
        purpose: 'export-check',
        nested: { safe: 'kept' },
      },
    })
    expect(result.metadata).toEqual({
      source: 'unit-test',
      purpose: 'export-check',
      nested: { safe: 'kept' },
    })
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      assetKind: 'skill-package',
      name: 'my-skill',
      version: '3',
      versionId: 'version-1',
      entryFile: 'SKILL.md',
      standard: 'aops-skill-package-v1',
      provenance: {
        trustClass: 'verified-hosted-package',
        expectedDigestSource: 'immutable-hosted-metadata',
        reference: 'skill-version:version-1',
      },
    })
    expect(result.manifest.packageSha256).toBe('c9633336c4474d48410981a147a1f2e78914431b01dd21302c3a9ddb6c48ad88')
    expect(result.manifest.files).toEqual([
      {
        path: 'SKILL.md',
        sha256: 'cf1ebd6e097906dcc6b66f1a072f3b8a49875671fb8c0b97b3eaae966bf53967',
        byteLength: 44,
      },
      {
        path: 'references/checklist.md',
        sha256: '3c09e7f68bcc2d75004d5bc130b7b6275819a77fdc872d8ccf90b35697d1c203',
        byteLength: 12,
      },
    ])
    expect(result.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(['SKILL.md', 'references/checklist.md'])
    )
    expect(result.projectId).toBe('project-1')
    expect(result.scopeId).toBe('project-1')
    expect(JSON.stringify(result)).not.toContain('/tmp/my-skill')
    expect(JSON.stringify(result)).not.toContain('C:\\server\\secret')
  })

  it('rejects draft, non-current, and mutated published package export', async () => {
    const repo = makeSkillVersionRepo()
    const skillService = makeSkillService()
    let version: any = {
      id: 'version-1',
      projectId: 'project-1',
      skillId: 'skill-1',
      version: 1,
      status: 'draft',
      content: '# Skill',
      entryFile: 'SKILL.md',
      skillStandard: 'aops-skill-package-v1',
      files: [{ path: 'SKILL.md', content: '# Skill' }],
      meta: {},
    }
    let skill: any = { id: 'skill-1', name: 'skill', scopeId: 'project-1', currentVersionId: null }
    repo.findById.mockImplementation(() => Effect.succeed(version))
    repo.patchById.mockImplementation((_id, patch) => {
      version = { ...version, ...patch }
      return Effect.succeed(version)
    })
    repo.find.mockImplementation(() => Effect.succeed([version]))
    skillService.getById.mockImplementation(() => Effect.succeed(skill))
    skillService.updateSkill.mockImplementation((_id, patch) => {
      skill = { ...skill, ...patch }
      return Effect.succeed(skill)
    })
    const service = new SkillVersionService({
      skillVersionRepository: repo as any,
      skillService: skillService as any,
    })

    await expect(Effect.runPromise(service.exportSkillPackage('version-1'))).rejects.toThrow()
    await Effect.runPromise(service.publishSkillVersion('version-1'))
    skill = { ...skill, currentVersionId: 'another-version' }
    await expect(Effect.runPromise(service.exportSkillPackage('version-1'))).rejects.toThrow()
    skill = { ...skill, currentVersionId: 'version-1' }
    version = { ...version, files: [{ path: 'SKILL.md', content: '# Mutated' }] }
    await expect(Effect.runPromise(service.exportSkillPackage('version-1'))).rejects.toThrow()
    await expect(Effect.runPromise(service.updateSkillVersion('version-1', { content: '# Other' } as any))).rejects.toThrow()
  })

  it('uses project scope when creating resource during import', async () => {
    const repo = makeSkillVersionRepo()
    const skillService = makeSkillService()
    const resourceService = makeResourceService()

    skillService.listSkills.mockImplementation(() => Effect.succeed([]))
    skillService.create.mockImplementation((data) =>
      Effect.succeed({
        id: 'skill-1',
        scopeId: data.scopeId,
        scopeType: 'project',
        name: data.name,
        description: data.description,
        shortDescription: data.shortDescription,
        tags: data.tags,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      } as any)
    )
    skillService.updateSkill.mockImplementation((id, patch) =>
      Effect.succeed({
        id,
        scopeType: 'project',
        scopeId: 'project-1',
        name: 'my-skill',
        description: 'Example skill',
        shortDescription: '# My Skill',
        tags: ['skill-package'],
        createdBy: 'unit-test',
        updatedBy: 'unit-test',
        ...patch,
      } as any)
    )

    repo.find.mockImplementation(() => Effect.succeed([]))
    repo.create.mockImplementation((data) =>
      Effect.succeed({
        id: 'version-1',
        projectId: data.projectId,
        skillId: data.skillId,
        version: data.version,
        status: data.status,
        content: data.content,
        entryFile: data.entryFile,
        skillStandard: data.skillStandard,
        files: data.files,
        meta: data.meta,
        refType: data.refType,
        refId: data.refId,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      } as any)
    )

    resourceService.listResources.mockImplementation(() => Effect.succeed([]))
    resourceService.createResource.mockImplementation((data) =>
      Effect.succeed({
        id: 'resource-1',
        ...data,
      } as any)
    )

    const service = new SkillVersionService({
      skillVersionRepository: repo as any,
      skillService: skillService as any,
      resourceService: resourceService as any,
    })

    const result = await Effect.runPromise(
      service.importSkillPackage({
        projectId: 'project-1',
        scopeId: 'project-1',
        scopeType: 'project',
        createdBy: 'unit-test',
        updatedBy: 'unit-test',
        bundle: {
          sourcePath: '/tmp/my-skill',
          metadata: {
            source: 'unit-test',
          },
          files: [
            {
              path: 'SKILL.md',
              kind: 'instruction',
              content: '---\nname: my-skill\ndescription: Example skill\n---\n\n# My Skill\n',
            },
          ],
        },
      })
    )

    expect(resourceService.createResource).toHaveBeenCalledTimes(1)
    expect(resourceService.createResource.mock.calls[0][0].projectId).toBeUndefined()
    expect(resourceService.createResource.mock.calls[0][0].scopeId).toBe('project-1')
    expect(result.resource?.id).toBe('resource-1')
  })
})
