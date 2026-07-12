import { Effect } from 'effect'
import { MemoryItemServiceError } from '../../errors/MemoryItemServiceError.js'
import { IbmMemoryItem, IbmMemoryItemInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'

export type MemorySearchRetrievalSubject = {
  type?: string
  id?: string
  label?: string
}

export type MemorySearchRetrievalRequest = {
  query?: string
  goal?: string
  runtimeProfile?: string
  workflowId?: string
  stepId?: string
  subject?: MemorySearchRetrievalSubject
  tags?: string[]
  sourceTypes?: string[]
  sourceIds?: string[]
  candidateLimit?: number
}

export type MemoryResumePackDepth = 'light' | 'deep'

export type MemoryResumePackOptions = {
  depth?: MemoryResumePackDepth
  limit?: number
}

export type MemorySynopsisOptions = {
  limit?: number
}

export type MemoryResumePackRef = {
  kind?: string
  uri?: string
  resourceId?: string
  ref?: string
  documentVersionId?: string
  sectionId?: string
  pageVersionId?: string
  pageNumber?: number
  target?: string
  locale?: string
  fallbackLocale?: string
}

export type MemoryResumePackSubject = {
  type?: string
  id?: string
  label?: string
}

export type MemoryResumePackItem = {
  id?: string
  kind?: string
  durability?: string
  content?: string
  importance?: number
  sourceType?: string
  sourceId?: string
  tags?: string[]
  meta?: unknown
}

export type MemoryResumePack = {
  subject?: MemoryResumePackSubject
  synopsis: MemorySynopsis
  bootstrapGuidance: string[]
  resumeSummary?: string
  currentFocus?: string
  openDecisions: string[]
  openBlockers: string[]
  nextActions: string[]
  recommendedRefs: MemoryResumePackRef[]
  relatedMemory: MemoryResumePackItem[]
  confidence: number
  gaps: string[]
  readStrategy: 'none' | 'recommended' | 'expand'
}

export type MemorySynopsis = {
  summary?: string
  decisions: string[]
  openItems: string[]
  bootstrapGuidance: string[]
  currentFocus?: string
  sourceMemoryIds: string[]
  generatedAt: string
}

export type MemoryItemListFilter = Partial<IbmMemoryItem> & {
  scopeResolution?: ScopeResolution
  projectId?: string
}

export type MemoryPromoteFromExperienceOptions = {
  /**
   * Memory kind override. For the durable-memory flavor (asPlaybook=false) only
   * `note` (default) or `decision` are honored. For the playbook flavor
   * (asPlaybook=true) only `rule` (default) or `constraint` are honored.
   */
  kind?: string
  /** durable (default) or sticky. */
  durability?: string
  /** Reviewed content override; defaults to the experience content. */
  content?: string
  /** Extra memory tags. */
  tags?: string[]
  /** Playbook flavor: stable playbook id (default: experience id). */
  playbookId?: string
  /** Playbook flavor: scope session | project (default: project). */
  playbookScope?: string
  /** Playbook flavor: area tag, such as backend or hexagen. */
  playbookArea?: string
  /** Playbook flavor: when this playbook should be applied. */
  appliesWhen?: string
  /** Playbook flavor: ordered steps (default: experience commands). */
  steps?: string[]
  /** Playbook flavor: advisory | soft-preflight | strict-opt-in. */
  enforcement?: string
  /** Playbook flavor: proposed | accepted | superseded | archived. */
  reviewState?: string
  /** Playbook flavor: older playbook id this one supersedes. */
  supersedes?: string
}

export interface IMemoryItemServicePort {
  getById(id: string, options?: DbQueryOptions<IbmMemoryItem>): Effect.Effect<IbmMemoryItem | null, MemoryItemServiceError>
  create(data: IbmMemoryItemInsert): Effect.Effect<IbmMemoryItem, MemoryItemServiceError>
  addMemoryItem(data: IbmMemoryItemInsert): Effect.Effect<IbmMemoryItem, MemoryItemServiceError>
  promoteFromExperience(
    experienceId: string,
    asPlaybook?: boolean,
    overrides?: MemoryPromoteFromExperienceOptions,
  ): Effect.Effect<IbmMemoryItem, MemoryItemServiceError>
  updateMemoryItem(id: string, patch: Partial<IbmMemoryItem>): Effect.Effect<IbmMemoryItem, MemoryItemServiceError>
  setMemoryImportance(id: string, importance: number | null): Effect.Effect<IbmMemoryItem, MemoryItemServiceError>
  listMemoryItems(filter?: MemoryItemListFilter, options?: DbQueryOptions<IbmMemoryItem>): Effect.Effect<IbmMemoryItem[], MemoryItemServiceError>
  searchMemoryItems(
    filter?: MemoryItemListFilter,
    retrieval?: MemorySearchRetrievalRequest,
    options?: DbQueryOptions<IbmMemoryItem>
  ): Effect.Effect<IbmMemoryItem[], MemoryItemServiceError>
  buildResumePack(
    filter: MemoryItemListFilter,
    retrieval?: MemorySearchRetrievalRequest,
    options?: MemoryResumePackOptions
  ): Effect.Effect<MemoryResumePack, MemoryItemServiceError>
  buildSynopsis(
    filter: MemoryItemListFilter,
    retrieval?: MemorySearchRetrievalRequest,
    options?: MemorySynopsisOptions
  ): Effect.Effect<MemorySynopsis, MemoryItemServiceError>
  removeMemoryItem(id: string): Effect.Effect<void, MemoryItemServiceError>
}

export interface IMemoryItemLookupPort {
  getById(id: string): Effect.Effect<IbmMemoryItem | null, MemoryItemServiceError>
}
