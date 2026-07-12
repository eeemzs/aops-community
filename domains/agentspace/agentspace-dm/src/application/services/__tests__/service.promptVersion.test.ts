import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'

import { PromptVersionService } from '../service.promptVersion.js'

const makePromptVersionRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  patchById: vi.fn(),
  find: vi.fn(),
  deleteById: vi.fn(),
  setCtx: vi.fn(),
  clearCtx: vi.fn(),
})

const makePromptService = () => ({
  getById: vi.fn(),
  updatePrompt: vi.fn(),
})

const makePromptRepo = () => ({
  findById: vi.fn(),
  patchById: vi.fn(),
  setCtx: vi.fn(),
  clearCtx: vi.fn(),
})

describe('PromptVersionService', () => {
  it('resolves projectId from prompt scope before create validation', async () => {
    const repo = makePromptVersionRepo()
    const promptService = makePromptService()

    const promptId = 'prompt-1'
    const projectId = 'project-1'
    const createdVersionId = 'version-1'
    let createdVersionNumber = 0

    promptService.getById.mockImplementation(() =>
      Effect.succeed({
        id: promptId,
        scopeId: projectId,
        name: 'Prompt',
      } as any)
    )

    repo.find.mockImplementation(() => {
      if (createdVersionNumber > 0) {
        return Effect.succeed([
          {
            id: createdVersionId,
            promptId,
            projectId,
            version: createdVersionNumber,
            status: 'draft',
            content: 'hello',
          },
        ])
      }
      return Effect.succeed([])
    })

    repo.create.mockImplementation((data) => {
      createdVersionNumber = data.version
      return Effect.succeed({
        id: createdVersionId,
        promptId,
        projectId: data.projectId,
        version: data.version,
        status: data.status,
        content: data.content,
      } as any)
    })

    promptService.updatePrompt.mockImplementation((id, patch) =>
      Effect.succeed({
        id,
        scopeId: projectId,
        name: 'Prompt',
        ...patch,
      } as any)
    )

    const service = new PromptVersionService({
      promptVersionRepository: repo as any,
      promptService: promptService as any,
    })

    const result = await Effect.runPromise(
      service.create({
        promptId,
        status: 'draft',
        content: 'hello',
      } as any)
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    expect(repo.create.mock.calls[0][0].projectId).toBe(projectId)
    expect(repo.create.mock.calls[0][0].version).toBe(1)
    expect(result.projectId).toBe(projectId)
  })

  it('computes the next version from the highest existing entry and ignores null updatedBy during prompt sync', async () => {
    const repo = makePromptVersionRepo()
    const promptService = makePromptService()

    const promptId = 'prompt-1'
    const projectId = 'project-1'
    const createdVersionId = 'version-4'
    let createdVersionNumber = 0

    promptService.getById.mockImplementation(() =>
      Effect.succeed({
        id: promptId,
        scopeId: projectId,
        name: 'Prompt',
      } as any)
    )

    repo.find.mockImplementation(() => {
      if (createdVersionNumber > 0) {
        return Effect.succeed([
          { id: 'version-2', version: 2, promptId, projectId, status: 'draft' } as any,
          { id: createdVersionId, version: createdVersionNumber, promptId, projectId, status: 'draft' } as any,
          { id: 'version-1', version: 1, promptId, projectId, status: 'draft' } as any,
        ])
      }
      return Effect.succeed([
        { id: 'version-2', version: 2, promptId, projectId, status: 'draft' } as any,
        { id: 'version-3', version: 3, promptId, projectId, status: 'draft' } as any,
        { id: 'version-1', version: 1, promptId, projectId, status: 'draft' } as any,
      ])
    })

    repo.create.mockImplementation((data) => {
      createdVersionNumber = data.version
      return Effect.succeed({
        id: createdVersionId,
        promptId,
        projectId: data.projectId,
        version: data.version,
        status: data.status,
        content: data.content,
        updatedBy: null,
      } as any)
    })

    promptService.updatePrompt.mockImplementation((id, patch) =>
      Effect.succeed({
        id,
        scopeId: projectId,
        name: 'Prompt',
        ...patch,
      } as any)
    )

    const service = new PromptVersionService({
      promptVersionRepository: repo as any,
      promptService: promptService as any,
    })

    const result = await Effect.runPromise(
      service.create({
        promptId,
        status: 'draft',
        content: 'hello',
      } as any)
    )

    expect(repo.create).toHaveBeenCalledTimes(1)
    expect(repo.create.mock.calls[0][0].version).toBe(4)
    expect(promptService.updatePrompt).toHaveBeenCalledWith(
      promptId,
      expect.objectContaining({
        currentVersionId: createdVersionId,
      })
    )
    expect(promptService.updatePrompt.mock.calls[0][1]).not.toHaveProperty('updatedBy')
    expect(result.version).toBe(4)
  })

  it('runs create inside unit of work and scopes repositories to the transaction context', async () => {
    const promptVersionRepo = makePromptVersionRepo()
    const promptRepository = makePromptRepo()
    const promptService = makePromptService()
    const txCtx = { drizzleTx: { id: 'tx-1' } }
    const unitOfWork = {
      runInTransaction: vi.fn((fn) => fn(txCtx)),
    }

    const promptId = 'prompt-1'
    const projectId = 'project-1'
    const createdVersionId = 'version-1'

    promptRepository.findById.mockImplementation(() =>
      Effect.succeed({
        id: promptId,
        scopeId: projectId,
        name: 'Prompt',
      } as any)
    )

    promptVersionRepo.find.mockImplementation(() =>
      Effect.succeed([
        { id: createdVersionId, promptId, projectId, version: 1, status: 'draft' } as any,
      ])
    )

    promptVersionRepo.create.mockImplementation((data) =>
      Effect.succeed({
        id: createdVersionId,
        promptId,
        projectId: data.projectId,
        version: data.version,
        status: data.status,
        content: data.content,
        updatedBy: null,
      } as any)
    )

    promptRepository.patchById.mockImplementation((id, patch) =>
      Effect.succeed({
        id,
        scopeId: projectId,
        name: 'Prompt',
        ...patch,
      } as any)
    )

    const service = new PromptVersionService({
      promptVersionRepository: promptVersionRepo as any,
      promptRepository: promptRepository as any,
      promptService: promptService as any,
      unitOfWork: unitOfWork as any,
    })

    const result = await Effect.runPromise(
      service.create({
        promptId,
        status: 'draft',
        content: 'hello',
      } as any)
    )

    expect(unitOfWork.runInTransaction).toHaveBeenCalledTimes(1)
    expect(promptVersionRepo.setCtx).toHaveBeenCalledWith(txCtx)
    expect(promptVersionRepo.clearCtx).toHaveBeenCalledTimes(1)
    expect(promptRepository.setCtx).toHaveBeenCalledWith(txCtx)
    expect(promptRepository.clearCtx).toHaveBeenCalledTimes(1)
    expect(promptRepository.patchById).toHaveBeenCalledWith(
      promptId,
      expect.objectContaining({ currentVersionId: createdVersionId })
    )
    expect(result.id).toBe(createdVersionId)
    expect(promptService.getById).not.toHaveBeenCalled()
    expect(promptService.updatePrompt).not.toHaveBeenCalled()
  })
})
