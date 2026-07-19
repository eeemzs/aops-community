import { Effect } from 'effect'
import { SkillServiceError } from '../../errors/SkillServiceError.js'
import { IbmSkill, IbmSkillInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'
import type { IOfficialCatalogServicePort } from './IOfficialCatalogServicePort.js'

export type SkillListFilter = Partial<IbmSkill> & {
  scopeResolution?: ScopeResolution
}

export const SKILL_DISCOVERY_MAX_RESULTS = 5
export const SKILL_DISCOVERY_MAX_BYTES = 2 * 1024

export type SkillDiscoveryMatchField =
  | 'name'
  | 'shortDescription'
  | 'description'
  | 'tags'
  | 'version'
  | 'entryFile'
  | 'skillStandard'
  | `meta.${string}`

export interface SkillDiscoveryCandidate {
  skillId: string
  versionId: string
  exactRef: string
  name: string
  shortDescription?: string
  version: string
  entryFile: string
  skillStandard: string
  packageSha256: string
  contentSha256: string
  origin: 'hosted'
  computedTrustClass: 'verified-hosted-package'
  score: number
  matchedBy: SkillDiscoveryMatchField[]
  rationale: string
}

export interface SkillSearchResult {
  query: string
  normalizedQuery: string
  count: number
  candidates: SkillDiscoveryCandidate[]
}

export interface SkillAskResult extends SkillSearchResult {
  answer: string
}

export interface ISkillServicePort extends IOfficialCatalogServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSkill>): Effect.Effect<IbmSkill | null, SkillServiceError>
  create(data: IbmSkillInsert): Effect.Effect<IbmSkill, SkillServiceError>
  getSkill(id: string, options?: DbQueryOptions<IbmSkill>): Effect.Effect<IbmSkill | null, SkillServiceError>
  listSkills(filter?: SkillListFilter, options?: DbQueryOptions<IbmSkill>): Effect.Effect<IbmSkill[], SkillServiceError>
  searchSkills(
    query: string,
    scopeId?: string,
    scopeResolution?: ScopeResolution,
    limit?: number
  ): Effect.Effect<SkillSearchResult, SkillServiceError>
  askSkills(
    query: string,
    scopeId?: string,
    scopeResolution?: ScopeResolution,
    limit?: number
  ): Effect.Effect<SkillAskResult, SkillServiceError>
  updateSkill(id: string, patch: Partial<IbmSkill>): Effect.Effect<IbmSkill, SkillServiceError>
  removeSkill(id: string): Effect.Effect<void, SkillServiceError>
}

export interface ISkillLookupPort {
  getById(id: string): Effect.Effect<IbmSkill | null, SkillServiceError>
}
