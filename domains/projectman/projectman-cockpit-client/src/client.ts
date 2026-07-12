import { EnvelopeHttp, MemoryTokenProvider, TokenProvider } from '@aopslab/light-client-core'
import {
  PmBoard,
  PmFeedback,
  PmImplementationPlan,
  PmIssue,
  PmKanbanTask,
  PmListFilter,
  PmReviewRequest,
  PmSprint,
} from './types.js'

export type ProjectmanCockpitOptions = {
  serverBaseUrl: string
  /** AOPS access token (Bearer/JWT). Optional in dev where auth is open. */
  accessToken?: string
  /**
   * Project/scope selection. The PM host resolves the owner scope from the
   * x-project-id / x-scope-id REQUEST HEADERS, NOT from a query param — so the
   * scope a cockpit reads is set here (sent as headers), not per-list. Without
   * it the host falls back to the principal's default scope.
   */
  projectId?: string
  scopeId?: string
  tokenProvider?: TokenProvider
  fetchImpl?: typeof fetch
}

function withQuery(path: string, filter?: PmListFilter): string {
  if (!filter) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filter)) {
    if (value != null && value !== '') params.set(key, value)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Read-only Projectman cockpit client. Every method is a GET against the
 * hosted /api/projectman surface — the cockpit never mutates PM state (F3
 * f3-pm-client v0). Auth, envelope unwrap and fetch binding come from
 * light-client-core; this layer owns only PM routes and read-model types.
 *
 * Data note: this reads server-canonical hosted Projectman state. `aops-cli pm`
 * writes go directly through the hosted gateway; local PM cache views are
 * read-only projections refreshed through pull/bootstrap sync operations.
 */
export class ProjectmanCockpitClient {
  readonly http: EnvelopeHttp

  constructor(options: ProjectmanCockpitOptions) {
    const tokens = options.tokenProvider ?? new MemoryTokenProvider(options.accessToken ?? null)
    const defaultHeaders: Record<string, string> = {}
    if (options.projectId) defaultHeaders['x-project-id'] = options.projectId
    if (options.scopeId) defaultHeaders['x-scope-id'] = options.scopeId
    this.http = new EnvelopeHttp({
      serverBaseUrl: options.serverBaseUrl,
      apiPrefix: '/api/projectman',
      tokenProvider: tokens,
      fetchImpl: options.fetchImpl,
      defaultHeaders,
    })
  }

  listBoards(filter?: PmListFilter): Promise<PmBoard[]> {
    return this.http.get<PmBoard[]>(withQuery('/kanban-boards', filter))
  }
  getBoard(id: string): Promise<PmBoard> {
    return this.http.get<PmBoard>(`/kanban-boards/${encodeURIComponent(id)}`)
  }

  listSprints(filter?: PmListFilter): Promise<PmSprint[]> {
    return this.http.get<PmSprint[]>(withQuery('/sprints', filter))
  }
  /** sprint.get carries the nested phases/microtasks when a plan was saved. */
  getSprint(id: string): Promise<PmSprint> {
    return this.http.get<PmSprint>(`/sprints/${encodeURIComponent(id)}`)
  }

  listImplementationPlans(filter?: PmListFilter): Promise<PmImplementationPlan[]> {
    return this.http.get<PmImplementationPlan[]>(withQuery('/implementation-plans', filter))
  }
  getImplementationPlan(id: string): Promise<PmImplementationPlan> {
    return this.http.get<PmImplementationPlan>(`/implementation-plans/${encodeURIComponent(id)}`)
  }

  listKanbanTasks(filter?: PmListFilter): Promise<PmKanbanTask[]> {
    return this.http.get<PmKanbanTask[]>(withQuery('/kanban-tasks', filter))
  }
  getKanbanTask(id: string): Promise<PmKanbanTask> {
    return this.http.get<PmKanbanTask>(`/kanban-tasks/${encodeURIComponent(id)}`)
  }

  listIssues(filter?: PmListFilter): Promise<PmIssue[]> {
    return this.http.get<PmIssue[]>(withQuery('/issues', filter))
  }
  getIssue(id: string): Promise<PmIssue> {
    return this.http.get<PmIssue>(`/issues/${encodeURIComponent(id)}`)
  }

  listFeedback(filter?: PmListFilter): Promise<PmFeedback[]> {
    return this.http.get<PmFeedback[]>(withQuery('/feedbacks', filter))
  }
  getFeedback(id: string): Promise<PmFeedback> {
    return this.http.get<PmFeedback>(`/feedbacks/${encodeURIComponent(id)}`)
  }

  listReviewRequests(filter?: PmListFilter): Promise<PmReviewRequest[]> {
    return this.http.get<PmReviewRequest[]>(withQuery('/review-requests', filter))
  }
  /** review-request.get carries the nested result (RRR) history. */
  getReviewRequest(id: string): Promise<PmReviewRequest> {
    return this.http.get<PmReviewRequest>(`/review-requests/${encodeURIComponent(id)}`)
  }
}
