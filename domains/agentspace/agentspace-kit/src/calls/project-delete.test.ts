import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

import { hardDeleteAgentspaceProjectCascade } from './project-delete.js'

function successRepo(overrides: Record<string, unknown> = {}) {
  return {
    find: vi.fn(() => Effect.succeed([])),
    deleteMany: vi.fn(() => Effect.succeed(0)),
    deleteByIdWithMatch: vi.fn(() => Effect.succeed(1)),
    findById: vi.fn(() =>
      Effect.succeed({
        id: 'project-1',
        scopeId: 'scope-1',
      }),
    ),
    ...overrides,
  }
}

describe('hardDeleteAgentspaceProjectCascade', () => {
  it('deletes only agentspace-owned records', async () => {
    const projectRepository = successRepo()
    const promptRepository = successRepo()
    const promptVersionRepository = successRepo()
    const skillRepository = successRepo()
    const skillVersionRepository = successRepo()
    const projectPathRepository = successRepo()
    const projectMemberRepository = successRepo()
    const artifactRepository = successRepo()
    const artifactLinkRepository = successRepo()
    const resourceRepository = successRepo()
    const experienceItemRepository = successRepo()
    const memoryItemRepository = successRepo()
    const missionRepository = successRepo()
    const agentSessionRepository = successRepo()
    const agentRunRepository = successRepo()
    const codexChatThreadRepository = successRepo()
    const codexChatMessageRepository = successRepo()

    const result = await hardDeleteAgentspaceProjectCascade({
      projectId: 'project-1',
      kit: {
        getProjectRepository: async () => projectRepository as any,
        getProjectPathRepository: async () => projectPathRepository as any,
        getProjectMemberRepository: async () => projectMemberRepository as any,
        getPromptRepository: async () => promptRepository as any,
        getPromptVersionRepository: async () => promptVersionRepository as any,
        getSkillRepository: async () => skillRepository as any,
        getSkillVersionRepository: async () => skillVersionRepository as any,
        getAgentSessionRepository: async () => agentSessionRepository as any,
        getAgentRunRepository: async () => agentRunRepository as any,
        getArtifactRepository: async () => artifactRepository as any,
        getArtifactLinkRepository: async () => artifactLinkRepository as any,
        getResourceRepository: async () => resourceRepository as any,
        getExperienceItemRepository: async () => experienceItemRepository as any,
        getMemoryItemRepository: async () => memoryItemRepository as any,
        getMissionRepository: async () => missionRepository as any,
        getCodexChatThreadRepository: async () => codexChatThreadRepository as any,
        getCodexChatMessageRepository: async () => codexChatMessageRepository as any,
      } as any,
    })

    expect(result).toMatchObject({
      project: 1,
    })
    expect(result).not.toHaveProperty('tasks')
    expect(result).not.toHaveProperty('kanbanBoards')
    expect(result).not.toHaveProperty('sprints')
    expect(projectRepository.deleteByIdWithMatch).toHaveBeenCalledWith('project-1', { scopeId: 'scope-1' })
  })

  it('treats a missing project as an idempotent no-op', async () => {
    const projectRepository = successRepo({
      findById: vi.fn(() => Effect.fail({ _tag: 'NotFoundError', code: 'NotFound' })),
    })

    const result = await hardDeleteAgentspaceProjectCascade({
      projectId: 'missing-project',
      kit: {
        getProjectRepository: async () => projectRepository as any,
        getProjectPathRepository: async () => successRepo() as any,
        getProjectMemberRepository: async () => successRepo() as any,
        getPromptRepository: async () => successRepo() as any,
        getPromptVersionRepository: async () => successRepo() as any,
        getSkillRepository: async () => successRepo() as any,
        getSkillVersionRepository: async () => successRepo() as any,
        getAgentSessionRepository: async () => successRepo() as any,
        getAgentRunRepository: async () => successRepo() as any,
        getArtifactRepository: async () => successRepo() as any,
        getArtifactLinkRepository: async () => successRepo() as any,
        getResourceRepository: async () => successRepo() as any,
        getExperienceItemRepository: async () => successRepo() as any,
        getMemoryItemRepository: async () => successRepo() as any,
        getMissionRepository: async () => successRepo() as any,
        getCodexChatThreadRepository: async () => successRepo() as any,
        getCodexChatMessageRepository: async () => successRepo() as any,
      } as any,
    })

    expect(result).toMatchObject({
      project: 0,
      projectMembers: 0,
      projectPaths: 0,
      prompts: 0,
      promptVersions: 0,
      skills: 0,
      skillVersions: 0,
      agentSessions: 0,
      agentRuns: 0,
      artifacts: 0,
      artifactLinks: 0,
      resources: 0,
      experienceItems: 0,
      memoryItems: 0,
      missions: 0,
      codexChatThreads: 0,
      codexChatMessages: 0,
    })
    expect(projectRepository.deleteByIdWithMatch).not.toHaveBeenCalled()
  })
})
