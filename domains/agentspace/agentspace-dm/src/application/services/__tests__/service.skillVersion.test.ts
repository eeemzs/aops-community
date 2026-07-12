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
        files: [],
      } as any)
    )
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

  it('exports canonical package descriptor and package metadata separately', async () => {
    const repo = makeSkillVersionRepo()
    const skillService = makeSkillService()

    repo.findById.mockImplementation(() =>
      Effect.succeed({
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
            },
            fileCount: 2,
          },
        },
      } as any)
    )
    skillService.getById.mockImplementation(() => Effect.succeed({ id: 'skill-1', name: 'my-skill', scopeId: 'project-1' } as any))

    const service = new SkillVersionService({
      skillVersionRepository: repo as any,
      skillService: skillService as any,
    })

    const result = await Effect.runPromise(service.exportSkillPackage('version-1'))

    expect(result.package).toEqual({
      entryFile: 'SKILL.md',
      standard: 'aops-skill-package-v1',
      format: 'filesystem-skill-package',
      fileCount: 2,
      sourcePath: '/tmp/my-skill',
      metadata: {
        source: 'unit-test',
        purpose: 'export-check',
      },
    })
    expect(result.metadata).toEqual({
      source: 'unit-test',
      purpose: 'export-check',
    })
    expect(result.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(['SKILL.md', 'references/checklist.md'])
    )
    expect(result.projectId).toBe('project-1')
    expect(result.scopeId).toBe('project-1')
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
