import { Effect } from 'effect'
import type { IbmPrompt, IbmProject, IbmSkill } from '@aopslab/domain-dm-agentspace/models'
import type { AgentspaceKitProvider } from '../domain-services/types.js'

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: unknown; cause?: { code?: unknown }; _tag?: unknown }
  if (err.code === 'NotFound') return true
  if (err.cause?.code === 'NotFound') return true
  if (err._tag === 'RepositoryError' && err.code === 'NotFound') return true
  if (err._tag === 'NotFoundError') return true
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('"code":"NotFound"')) return true
  if (message.includes('"_tag":"NotFoundError"')) return true
  if (message.includes('"_tag":"RepositoryError"') && message.includes('"code":"NotFound"')) return true
  if (message.includes('"_tag":"RecordNotFoundError"')) return true
  if (message.includes('Record not found')) return true
  return false
}

async function safeFind<T = unknown, E = unknown>(effect: Effect.Effect<ReadonlyArray<T>, E, never>): Promise<T[]> {
  const items = await Effect.runPromise(
    Effect.catchAll(effect, (err) => {
      if (isNotFoundError(err)) {
        return Effect.succeed([] as ReadonlyArray<T>)
      }
      return Effect.fail(err)
    })
  )
  return Array.from(items)
}

function collectIds<T extends { id?: unknown }>(rows: ReadonlyArray<T>): string[] {
  const ids = new Set<string>()
  for (const row of rows) {
    const id = normalizeNonEmpty(row.id)
    if (id) ids.add(id)
  }
  return Array.from(ids)
}

type HardDeleteProjectKit = Pick<
  AgentspaceKitProvider,
  | 'getProjectRepository'
  | 'getProjectPathRepository'
  | 'getProjectMemberRepository'
  | 'getPromptRepository'
  | 'getPromptVersionRepository'
  | 'getSkillRepository'
  | 'getSkillVersionRepository'
  | 'getAgentSessionRepository'
  | 'getAgentRunRepository'
  | 'getArtifactRepository'
  | 'getArtifactLinkRepository'
  | 'getResourceRepository'
  | 'getExperienceItemRepository'
  | 'getMemoryItemRepository'
  | 'getMissionRepository'
  | 'getCodexChatThreadRepository'
  | 'getCodexChatMessageRepository'
>

type MatchEqRepository<TDomainModel> = {
  find(params: { matchEq: Partial<TDomainModel> }): Effect.Effect<ReadonlyArray<TDomainModel>, unknown, never>
  deleteMany(params: { matchEq: Partial<TDomainModel> }): Effect.Effect<number, unknown, never>
}

type MatchEqDeleteByIdRepository<TDomainModel> = {
  deleteByIdWithMatch(id: string, matchEq?: Partial<TDomainModel>): Effect.Effect<number, unknown, never>
}

type FindByIdRepository<TDomainModel> = {
  findById(id: string): Effect.Effect<TDomainModel, unknown, never>
}

function asMatchEqRepository<TDomainModel>(repository: unknown): MatchEqRepository<TDomainModel> {
  return repository as MatchEqRepository<TDomainModel>
}

function asMatchEqDeleteByIdRepository<TDomainModel>(repository: unknown): MatchEqDeleteByIdRepository<TDomainModel> {
  return repository as MatchEqDeleteByIdRepository<TDomainModel>
}

function asFindByIdRepository<TDomainModel>(repository: unknown): FindByIdRepository<TDomainModel> {
  return repository as FindByIdRepository<TDomainModel>
}

async function findByMatchEq<TDomainModel>(
  label: string,
  repository: unknown,
  matchEq: Partial<TDomainModel>
): Promise<TDomainModel[]> {
  try {
    return await safeFind(asMatchEqRepository<TDomainModel>(repository).find({ matchEq }))
  } catch (error) {
    throw new Error(`hardDeleteAgentspaceProjectCascade.findByMatchEq failed: ${label}`, { cause: error })
  }
}

async function deleteManyByMatchEq<TDomainModel>(
  label: string,
  repository: unknown,
  matchEq: Partial<TDomainModel>
): Promise<number> {
  try {
    return await Effect.runPromise(asMatchEqRepository<TDomainModel>(repository).deleteMany({ matchEq }))
  } catch (error) {
    throw new Error(`hardDeleteAgentspaceProjectCascade.deleteManyByMatchEq failed: ${label}`, { cause: error })
  }
}

/**
 * Hard-delete a project and Agentspace-owned child records (child-first).
 *
 * This is intended for orchestrators (e.g. host plugin runner / ops scripts) that need a
 * safe permanent delete operation.
 */
export async function hardDeleteAgentspaceProjectCascade(params: {
  kit: HardDeleteProjectKit
  projectId: string
}): Promise<Record<string, number>> {
  const { kit, projectId } = params

  const [
    projectRepository,
    projectPathRepository,
    projectMemberRepository,
    promptRepository,
    promptVersionRepository,
    skillRepository,
    skillVersionRepository,
    agentSessionRepository,
    agentRunRepository,
    artifactRepository,
    artifactLinkRepository,
    resourceRepository,
    experienceItemRepository,
    memoryItemRepository,
    missionRepository,
    codexChatThreadRepository,
    codexChatMessageRepository,
  ] = await Promise.all([
    kit.getProjectRepository(),
    kit.getProjectPathRepository(),
    kit.getProjectMemberRepository(),
    kit.getPromptRepository(),
    kit.getPromptVersionRepository(),
    kit.getSkillRepository(),
    kit.getSkillVersionRepository(),
    kit.getAgentSessionRepository(),
    kit.getAgentRunRepository(),
    kit.getArtifactRepository(),
    kit.getArtifactLinkRepository(),
    kit.getResourceRepository(),
    kit.getExperienceItemRepository(),
    kit.getMemoryItemRepository(),
    kit.getMissionRepository(),
    kit.getCodexChatThreadRepository(),
    kit.getCodexChatMessageRepository(),
  ])

  const deleted: Record<string, number> = {
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
  }

  let project: IbmProject
  try {
    project = await Effect.runPromise(asFindByIdRepository<IbmProject>(projectRepository).findById(projectId))
  } catch (error) {
    if (isNotFoundError(error)) {
      return deleted
    }
    throw new Error('hardDeleteAgentspaceProjectCascade.findById failed: projectRepository.findById', {
      cause: error,
    })
  }

  const projectScopeId = normalizeNonEmpty(project.scopeId)
  if (!projectScopeId) {
    throw new Error(`hardDeleteAgentspaceProjectCascade.missing_scope:${projectId}`)
  }

  const [prompts, skills] = await Promise.all([
    findByMatchEq<IbmPrompt>('promptRepository.find', promptRepository, { scopeId: projectScopeId }),
    findByMatchEq<IbmSkill>('skillRepository.find', skillRepository, { scopeId: projectScopeId }),
  ])

  const promptIds = collectIds(prompts)
  const skillIds = collectIds(skills)

  // Child-first deletion order (safer if FK constraints exist in DB).
  deleted.projectMembers = await deleteManyByMatchEq('projectMemberRepository.deleteMany', projectMemberRepository, {
    projectId,
  })
  deleted.projectPaths = await deleteManyByMatchEq('projectPathRepository.deleteMany', projectPathRepository, {
    projectId,
  })

  // Prompt versions live under prompt ids (no projectId column).
  for (const promptId of promptIds) {
    deleted.promptVersions += Number(
      await deleteManyByMatchEq('promptVersionRepository.deleteMany', promptVersionRepository, { promptId })
    )
  }
  deleted.prompts = await deleteManyByMatchEq('promptRepository.deleteMany', promptRepository, { scopeId: projectScopeId })

  // Skill versions live under skill ids (projectId is optional on versions).
  for (const skillId of skillIds) {
    deleted.skillVersions += Number(
      await deleteManyByMatchEq('skillVersionRepository.deleteMany', skillVersionRepository, { skillId })
    )
  }
  deleted.skills = await deleteManyByMatchEq('skillRepository.deleteMany', skillRepository, { scopeId: projectScopeId })

  deleted.artifactLinks = await deleteManyByMatchEq('artifactLinkRepository.deleteMany', artifactLinkRepository, {
    projectId,
  })
  deleted.artifacts = await deleteManyByMatchEq('artifactRepository.deleteMany', artifactRepository, {
    scopeId: projectScopeId,
  })

  deleted.agentRuns = await deleteManyByMatchEq('agentRunRepository.deleteMany', agentRunRepository, {
    projectId,
  })
  deleted.agentSessions = await deleteManyByMatchEq('agentSessionRepository.deleteMany', agentSessionRepository, {
    scopeId: projectScopeId,
  })

  deleted.codexChatMessages = await deleteManyByMatchEq(
    'codexChatMessageRepository.deleteMany',
    codexChatMessageRepository,
    { projectId }
  )
  deleted.codexChatThreads = await deleteManyByMatchEq('codexChatThreadRepository.deleteMany', codexChatThreadRepository, {
    scopeId: projectScopeId,
  })

  deleted.resources = await deleteManyByMatchEq('resourceRepository.deleteMany', resourceRepository, {
    scopeId: projectScopeId,
  })
  deleted.experienceItems = await deleteManyByMatchEq('experienceItemRepository.deleteMany', experienceItemRepository, {
    scopeId: projectScopeId,
  })
  deleted.memoryItems = await deleteManyByMatchEq('memoryItemRepository.deleteMany', memoryItemRepository, {
    scopeId: projectScopeId,
  })
  deleted.missions = await deleteManyByMatchEq('missionRepository.deleteMany', missionRepository, {
    scopeId: projectScopeId,
  })

  // Finally delete the project record itself.
  try {
    deleted.project = await Effect.runPromise(
      asMatchEqDeleteByIdRepository<IbmProject>(projectRepository).deleteByIdWithMatch(projectId, { scopeId: projectScopeId })
    )
  } catch (error) {
    throw new Error('hardDeleteAgentspaceProjectCascade.deleteByIdWithMatch failed: projectRepository.deleteByIdWithMatch', {
      cause: error,
    })
  }
  return deleted
}
