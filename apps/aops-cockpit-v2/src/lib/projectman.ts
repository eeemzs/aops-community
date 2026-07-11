import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ProjectmanCockpitClient,
  type PmBoard,
  type PmFeedback,
  type PmImplementationPlan,
  type PmIssue,
  type PmKanbanTask,
  type PmListFilter,
  type PmReviewRequest,
  type PmSprint
} from "@aopslab/projectman-cockpit-client";
import type { AopsApiClient, AopsApiIdentity } from "./aopsApi";
import type { ProjectOption } from "./projects";

export type PmTone = "coral" | "amber" | "sage" | "claret" | "indigo" | "ghost";

export interface PmArchiveFields {
  archivedAt?: string | null;
  archived?: boolean | null;
}

export type CockpitPmBoard = PmBoard & PmArchiveFields;
export type CockpitPmSprint = PmSprint & PmArchiveFields & { status?: string | null };
export type CockpitPmImplementationPlan = PmImplementationPlan & PmArchiveFields;

export interface CockpitPmProgress {
  completed?: number | null;
  actionable?: number | null;
  total?: number | null;
  ratio?: number | null;
}

export interface CockpitPmMicrotask {
  id: string;
  phaseId?: string | null;
  title: string;
  status?: string | null;
  notes?: string | null;
  position?: number | null;
}

export interface CockpitPmPhase {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  position?: number | null;
  progress?: CockpitPmProgress | null;
  microtasks?: CockpitPmMicrotask[];
}

export type CockpitPmSprintDetail = CockpitPmSprint & {
  goal?: string | null;
  kanbanTaskId?: string | null;
  phases?: CockpitPmPhase[];
  progress?: CockpitPmProgress | null;
  references?: string[];
  scope?: string[];
  validationPlan?: string[];
  notes?: string | null;
};

export type CockpitPmImplementationPlanDetail = CockpitPmImplementationPlan & {
  goal?: string | null;
  kanbanTaskId?: string | null;
  phases?: CockpitPmPhase[];
  progress?: CockpitPmProgress | null;
  references?: string[];
  scope?: string[];
  validationPlan?: string[];
  notes?: string | null;
  status?: string | null;
  storage?: string | null;
};

export type CockpitPmTask = PmKanbanTask & {
  boardColumnId?: string | null;
  description?: string | null;
  progress?: number | null;
  taskCode?: string | null;
};

export interface PmKanbanColumn {
  id: string;
  name: string;
  slug?: string | null;
  wipLimit?: number | null;
}

interface PmKanbanBoardColumn {
  id: string;
  boardId: string;
  columnId: string;
  position: number;
}

export interface PmBoardColumnView {
  id: string;
  boardId: string;
  columnId: string;
  name: string;
  slug?: string | null;
  wipLimit?: number | null;
  position: number;
}

export interface ProjectmanDataModel {
  status: "select-project" | "loading" | "error" | "empty" | "ready";
  selectedProject: ProjectOption | null;
  client: AopsApiClient;
  sessionKey: string | null;
  error: unknown;
  isFetching: boolean;
  boards: CockpitPmBoard[];
  tasks: CockpitPmTask[];
  sprints: CockpitPmSprint[];
  implementationPlans: CockpitPmImplementationPlan[];
  issues: PmIssue[];
  feedback: PmFeedback[];
  reviewRequests: PmReviewRequest[];
  columnsByBoard: Record<string, PmBoardColumnView[]>;
  refresh: () => void;
}

// Board lifecycle writes (cards-mode kebab). These go through the generic
// AopsApiClient with x-project-id/x-scope-id headers against the hosted
// projectman route projection — NOT through ProjectmanCockpitClient, which
// stays read-only by contract. delete has NO server-side cascade: tasks and
// board-column links keep their dangling boardId (they only vanish from
// board-scoped reads); archive/unarchive are soft (archivedAt) and reversible.
export async function archivePmBoard(client: AopsApiClient, id: string): Promise<void> {
  await client.post("/api/projectman/operations/kanban-board/archive", { id });
}

export async function unarchivePmBoard(client: AopsApiClient, id: string): Promise<void> {
  await client.post("/api/projectman/operations/kanban-board/unarchive", { id });
}

export async function deletePmBoard(client: AopsApiClient, id: string): Promise<void> {
  await client.del(`/api/projectman/kanban-boards/${encodeURIComponent(id)}`);
}

/** Sprint lifecycle writes (sprint-cards kebab; same route-projection contract
 *  as boards). NOTE: implementation-plan has NO archive/delete ops in the kit
 *  catalog, so plan cards do not offer lifecycle actions. */
export async function archivePmSprint(client: AopsApiClient, id: string): Promise<void> {
  await client.post("/api/projectman/operations/sprint/archive", { id });
}

export async function unarchivePmSprint(client: AopsApiClient, id: string): Promise<void> {
  await client.post("/api/projectman/operations/sprint/unarchive", { id });
}

export async function deletePmSprint(client: AopsApiClient, id: string): Promise<void> {
  await client.del(`/api/projectman/sprints/${encodeURIComponent(id)}`);
}

/** Flat PM record deletes (record-cards kebab; issues / feedback / review
 *  requests all expose a delete op; none has an archive op). `resource` is the
 *  host route segment: issues | feedbacks | review-requests. */
export async function deletePmRecord(
  client: AopsApiClient,
  resource: "issues" | "feedbacks" | "review-requests",
  id: string
): Promise<void> {
  await client.del(`/api/projectman/${resource}/${encodeURIComponent(id)}`);
}

/** Per-board task list (cards mode): fetched on demand when a board card
 *  expands (or its detail pane opens) and cached — the project-wide tasks
 *  list stays deferred on that surface. Server-side filter: the hosted
 *  kanban-task.list op accepts a `board` arg via the query string. */
export function boardTasksQueryKey(
  identity: AopsApiIdentity,
  sessionKey: string | null,
  selectedProject: ProjectOption | null,
  boardId: string
) {
  return [...projectmanQueryKeys.all(identity, sessionKey, selectedProject), "board-tasks", boardId] as const;
}

export function useBoardTasks(model: ProjectmanDataModel, boardId: string, enabled: boolean) {
  return useQuery({
    queryKey: boardTasksQueryKey(model.client.identity, model.sessionKey, model.selectedProject, boardId),
    queryFn: async () => {
      const rows = await model.client.get<CockpitPmTask[]>("/api/projectman/kanban-tasks", { board: boardId });
      return rows.slice().sort(byPosition);
    },
    enabled: enabled && Boolean(model.selectedProject),
    staleTime: 5 * 60_000
  });
}

export const projectmanQueryKeys = {
  all: (
    identity: AopsApiIdentity,
    sessionKey: string | null,
    selectedProject: ProjectOption | null
  ) =>
    [
      "aops-projectman",
      identity.baseUrl,
      sessionKey ?? "anonymous",
      selectedProject?.projectId ?? "no-project-id",
      selectedProject?.scopeId ?? "no-scope-id",
      selectedProject?.slug ?? "no-slug"
    ] as const,
  entity: (
    identity: AopsApiIdentity,
    sessionKey: string | null,
    selectedProject: ProjectOption | null,
    entity: string
  ) => [...projectmanQueryKeys.all(identity, sessionKey, selectedProject), entity] as const,
  boardColumns: (
    identity: AopsApiIdentity,
    sessionKey: string | null,
    selectedProject: ProjectOption | null,
    boardIds: string[]
  ) => [...projectmanQueryKeys.all(identity, sessionKey, selectedProject), "board-columns", boardIds] as const,
  detail: (
    identity: AopsApiIdentity,
    sessionKey: string | null,
    selectedProject: ProjectOption | null,
    entity: "sprint" | "implementation-plan",
    id: string | null
  ) => [...projectmanQueryKeys.all(identity, sessionKey, selectedProject), "detail", entity, id ?? "none"] as const
};

function byUpdatedDesc<T extends { updatedAt?: string; createdAt?: string }>(a: T, b: T): number {
  return Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? "");
}

function byPosition<T extends { position?: number | null }>(a: T, b: T): number {
  return (a.position ?? 0) - (b.position ?? 0);
}

async function listWithArchiveHint<T>(load: (filter?: PmListFilter) => Promise<T[]>): Promise<T[]> {
  try {
    return await load({ includeArchived: "true" });
  } catch {
    return load();
  }
}

function normalizeCredentialHeaderName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCredentialHeaderName(name: string): boolean {
  const normalized = normalizeCredentialHeaderName(name);
  return normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("session") ||
    normalized.endsWith("token") ||
    normalized.includes("accesstoken") ||
    normalized.includes("apikey") ||
    normalized.includes("password") ||
    normalized.includes("secret");
}

function isLoopbackFetchHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  return octets[0] === 127 && octets.every((octet) => octet >= 0 && octet <= 255);
}

function normalizeCredentialQueryKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCredentialQueryKey(name: string): boolean {
  const normalized = normalizeCredentialQueryKey(name);
  return normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("session") ||
    normalized.endsWith("token") ||
    normalized.includes("apikey") ||
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("credential") ||
    normalized.includes("bearer") ||
    normalized.includes("csrf") ||
    normalized.includes("xsrf") ||
    normalized === "jwt" ||
    normalized.endsWith("jwt");
}

function normalizeTrustedServerBaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("community_cockpit_trusted_server_base_rejected");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !isLoopbackFetchHostname(parsed.hostname)
  ) {
    throw new Error("community_cockpit_trusted_server_base_rejected");
  }
  return parsed;
}

function assertTrustedFetchTarget(
  input: RequestInfo | URL,
  trustedServerBaseUrl: URL,
  allowedPathPrefix: string
): void {
  const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("community_cockpit_trusted_fetch_target_rejected");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.origin !== trustedServerBaseUrl.origin ||
    parsed.hash ||
    (parsed.pathname !== allowedPathPrefix.slice(0, -1) && !parsed.pathname.startsWith(allowedPathPrefix))
  ) {
    throw new Error("community_cockpit_trusted_fetch_target_rejected");
  }
  for (const name of parsed.searchParams.keys()) {
    if (isCredentialQueryKey(name)) {
      throw new Error("community_cockpit_credential_query_rejected");
    }
  }
}

function mergeTrustedFetchHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  for (const [name, value] of new Headers(init?.headers)) headers.set(name, value);
  return headers;
}

function projectmanTrustedFetch(serverBaseUrl: string): typeof fetch {
  const trustedServerBaseUrl = normalizeTrustedServerBaseUrl(serverBaseUrl);
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assertTrustedFetchTarget(input, trustedServerBaseUrl, "/api/projectman/");
    const headers = mergeTrustedFetchHeaders(input, init);
    for (const name of [...headers.keys()]) {
      if (isCredentialHeaderName(name)) headers.delete(name);
    }
    const request = new Request(input, {
      ...init,
      headers,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
    return fetch(request, {
      headers,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
  };
}
function createProjectmanReadClient(client: AopsApiClient) {
  return new ProjectmanCockpitClient({
    serverBaseUrl: client.identity.baseUrl,
    projectId: client.identity.projectId ?? undefined,
    scopeId: client.identity.scopeId ?? undefined,
    fetchImpl: projectmanTrustedFetch(client.identity.baseUrl)
  });
}

function columnsFromRows(
  boards: CockpitPmBoard[],
  columns: PmKanbanColumn[],
  boardColumnRows: Array<readonly [string, PmKanbanBoardColumn[]]>
): Record<string, PmBoardColumnView[]> {
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const boardIds = new Set(boards.map((board) => board.id));

  return Object.fromEntries(
    boardColumnRows
      .filter(([boardId]) => boardIds.has(boardId))
      .map(([boardId, rows]) => [
        boardId,
        rows
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((row) => {
            const column = columnById.get(row.columnId);
            return {
              id: row.id,
              boardId: row.boardId,
              columnId: row.columnId,
              name: column?.name ?? row.columnId.slice(0, 8),
              slug: column?.slug,
              wipLimit: column?.wipLimit ?? null,
              position: row.position
            };
          })
      ])
  );
}

function firstError(errors: unknown[]): unknown {
  return errors.find((error) => error != null) ?? null;
}

export function useProjectmanData(params: {
  client: AopsApiClient;
  selectedProject: ProjectOption | null;
  sessionKey: string | null;
  enabled?: boolean;
  /** Defer the project-wide kanban-tasks list (boards cards mode loads tasks
   *  per board on demand instead — model.tasks stays empty while deferred). */
  tasksEnabled?: boolean;
}): ProjectmanDataModel {
  const enabled = Boolean(params.enabled && params.selectedProject);
  const tasksEnabled = enabled && params.tasksEnabled !== false;
  const queryClient = useQueryClient();
  const readClient = useMemo(
    () => createProjectmanReadClient(params.client),
    [
      params.client.identity.baseUrl,
      params.client.identity.projectId,
      params.client.identity.scopeId
    ]
  );

  const boardsQuery = useQuery({
    queryKey: projectmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "boards"),
    queryFn: () => listWithArchiveHint((filter) => readClient.listBoards(filter)) as Promise<CockpitPmBoard[]>,
    enabled
  });
  const tasksQuery = useQuery({
    queryKey: projectmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "tasks"),
    queryFn: () => readClient.listKanbanTasks() as Promise<CockpitPmTask[]>,
    enabled: tasksEnabled
  });
  const sprintsQuery = useQuery({
    queryKey: projectmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "sprints"),
    queryFn: () => listWithArchiveHint((filter) => readClient.listSprints(filter)) as Promise<CockpitPmSprint[]>,
    enabled
  });
  const plansQuery = useQuery({
    queryKey: projectmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "plans"),
    queryFn: () =>
      listWithArchiveHint((filter) => readClient.listImplementationPlans(filter)) as Promise<
        CockpitPmImplementationPlan[]
      >,
    enabled
  });
  const issuesQuery = useQuery({
    queryKey: projectmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "issues"),
    queryFn: () => readClient.listIssues(),
    enabled
  });
  const feedbackQuery = useQuery({
    queryKey: projectmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "feedback"),
    queryFn: () => readClient.listFeedback(),
    enabled
  });
  const reviewRequestsQuery = useQuery({
    queryKey: projectmanQueryKeys.entity(
      params.client.identity,
      params.sessionKey,
      params.selectedProject,
      "review-requests"
    ),
    queryFn: () => readClient.listReviewRequests(),
    enabled
  });
  const columnsQuery = useQuery({
    queryKey: projectmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "columns"),
    queryFn: () => params.client.get<PmKanbanColumn[]>("/api/projectman/kanban-columns"),
    enabled
  });

  const boards = useMemo(
    () => (boardsQuery.data ?? []).slice().sort(byPosition),
    [boardsQuery.data]
  );
  const boardIds = useMemo(() => boards.map((board) => board.id), [boards]);

  const boardColumnsQuery = useQuery({
    queryKey: projectmanQueryKeys.boardColumns(
      params.client.identity,
      params.sessionKey,
      params.selectedProject,
      boardIds
    ),
    queryFn: async () => {
      const rows = await Promise.all(
        boardIds.map(async (boardId) => {
          const result = await params.client.get<PmKanbanBoardColumn[]>("/api/projectman/kanban-board-columns", {
            board: boardId
          });
          return [boardId, result] as const;
        })
      );
      return rows;
    },
    enabled: enabled && boardsQuery.isSuccess
  });

  const tasks = useMemo(
    () => (tasksQuery.data ?? []).slice().sort(byPosition),
    [tasksQuery.data]
  );
  const sprints = useMemo(
    () => (sprintsQuery.data ?? []).slice().sort(byUpdatedDesc),
    [sprintsQuery.data]
  );
  const implementationPlans = useMemo(
    () => (plansQuery.data ?? []).slice().sort(byUpdatedDesc),
    [plansQuery.data]
  );
  const issues = useMemo(
    () => (issuesQuery.data ?? []).slice().sort(byUpdatedDesc),
    [issuesQuery.data]
  );
  const feedback = useMemo(
    () => (feedbackQuery.data ?? []).slice().sort(byUpdatedDesc),
    [feedbackQuery.data]
  );
  const reviewRequests = useMemo(
    () => (reviewRequestsQuery.data ?? []).slice().sort(byUpdatedDesc),
    [reviewRequestsQuery.data]
  );
  const columnsByBoard = useMemo(
    () => columnsFromRows(boards, columnsQuery.data ?? [], boardColumnsQuery.data ?? []),
    [boardColumnsQuery.data, boards, columnsQuery.data]
  );

  const queries = [
    boardsQuery,
    tasksQuery,
    sprintsQuery,
    plansQuery,
    issuesQuery,
    feedbackQuery,
    reviewRequestsQuery,
    columnsQuery,
    boardColumnsQuery
  ];
  // A deferred (disabled) tasks query stays isPending forever — exclude it
  // from the loading rollup so cards mode isn't stuck on the loading panel.
  const loadingQueries = tasksEnabled ? queries : queries.filter((query) => query !== tasksQuery);
  const error = firstError(queries.map((query) => query.error));
  const loading = enabled && loadingQueries.some((query) => query.isPending);
  const isFetching = queries.some((query) => query.isFetching);
  const hasData =
    boards.length +
      tasks.length +
      sprints.length +
      implementationPlans.length +
      issues.length +
      feedback.length +
      reviewRequests.length >
    0;
  const status = !params.selectedProject
    ? "select-project"
    : loading
      ? "loading"
      : error
        ? "error"
        : hasData
          ? "ready"
          : "empty";

  return {
    status,
    selectedProject: params.selectedProject,
    client: params.client,
    sessionKey: params.sessionKey,
    error,
    isFetching,
    boards,
    tasks,
    sprints,
    implementationPlans,
    issues,
    feedback,
    reviewRequests,
    columnsByBoard,
    refresh: () => {
      // Skip the deferred tasks query (refetch would force-run a disabled
      // query); refresh the per-board task caches instead.
      for (const query of loadingQueries) {
        void query.refetch();
      }
      void queryClient.invalidateQueries({
        queryKey: [
          ...projectmanQueryKeys.all(params.client.identity, params.sessionKey, params.selectedProject),
          "board-tasks"
        ]
      });
    }
  };
}

export function useProjectmanSprintDetail(params: {
  model: ProjectmanDataModel;
  sprintId: string | null;
  enabled?: boolean;
}) {
  const sprintId = params.sprintId?.trim() || null;
  return useQuery({
    queryKey: projectmanQueryKeys.detail(
      params.model.client.identity,
      params.model.sessionKey,
      params.model.selectedProject,
      "sprint",
      sprintId
    ),
    queryFn: () => params.model.client.get<CockpitPmSprintDetail>(`/api/projectman/sprints/${sprintId}`),
    enabled: Boolean(params.enabled && sprintId && params.model.selectedProject)
  });
}

export function useProjectmanImplementationPlanDetail(params: {
  model: ProjectmanDataModel;
  planId: string | null;
  enabled?: boolean;
}) {
  const planId = params.planId?.trim() || null;
  return useQuery({
    queryKey: projectmanQueryKeys.detail(
      params.model.client.identity,
      params.model.sessionKey,
      params.model.selectedProject,
      "implementation-plan",
      planId
    ),
    queryFn: () => params.model.client.get<CockpitPmImplementationPlanDetail>(
      `/api/projectman/implementation-plans/${planId}`
    ),
    enabled: Boolean(params.enabled && planId && params.model.selectedProject)
  });
}

export function isArchivedPmRecord(record: PmArchiveFields): boolean {
  return record.archived === true || Boolean(record.archivedAt);
}

export function isDoneStatus(status?: string | null): boolean {
  return ["done", "completed", "closed", "accepted", "approved"].includes(status?.toLowerCase() ?? "");
}

export function isOpenStatus(status?: string | null): boolean {
  return ["open", "new", "doing", "in_progress", "in-progress", "requested", "blocked"].includes(
    status?.toLowerCase() ?? ""
  );
}

export function toneForSeverity(severity?: string | null): PmTone {
  const value = severity?.toLowerCase();
  if (value === "critical" || value === "high" || value === "p0" || value === "p1") return "claret";
  if (value === "medium" || value === "p2") return "amber";
  return "ghost";
}

export function toneForStatus(status?: string | null): PmTone {
  const value = status?.toLowerCase().replace(/_/g, "-");
  if (!value) return "ghost";
  if (["done", "closed", "resolved", "accepted", "approved", "completed", "published"].includes(value)) return "sage";
  if (["doing", "in-progress", "requested", "open", "new"].includes(value)) return "amber";
  if (["changes-requested", "rejected", "blocked", "failed"].includes(value)) return "claret";
  return "indigo";
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
