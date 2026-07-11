import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AopsApiClient, AopsApiIdentity } from "./aopsApi";
import type { ProjectOption } from "./projects";

// Hosted Agentspace read layer (cockpit-v1 agentspace-data port, v2 react-query
// idiom — see projectman.ts). Read-only list + version-detail surfaces over
// /api/agentspace/*; the S2 dispatcher sections render these models.
// Endpoint shapes probed live @5900 (2026-07-02); optional-friendly types.

export interface AgentspaceMemoryItem {
  id: string;
  kind?: string | null;
  durability?: string | null;
  importance?: number | null;
  content?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  tags?: string[] | null;
  meta?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentspaceMissionRef {
  refType?: string | null;
  refId?: string | null;
  title?: string | null;
  note?: string | null;
}

export interface AgentspaceMission {
  id: string;
  slug?: string | null;
  status?: string | null;
  objective?: string | null;
  taskDefinition?: string | null;
  successCriteria?: string[] | null;
  constraints?: string[] | null;
  policy?: Record<string, unknown> | null;
  roles?: Record<string, unknown> | null;
  references?: AgentspaceMissionRef[] | null;
  activeImplementationPlanRef?: { refId?: string | null; refType?: string | null } | null;
  bodyMarkdown?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentspaceDiscussionTopic {
  id: string;
  parentTopicId?: string | null;
  lineageKind?: string | null;
  referencedOutputs?: unknown;
  referencedTurnRefs?: unknown;
  referencedMemoryRefs?: unknown;
  abandonReason?: string | null;
  slug?: string | null;
  title?: string | null;
  question?: string | null;
  status?: string | null;
  participants?: string[] | null;
  initiatorAgentId?: string | null;
  blockedOn?: string | null;
  blockingTurnSeq?: number | null;
  subjectType?: string | null;
  subjectId?: string | null;
  rules?: {
    turnOrder?: string[] | null;
    minTurnsBeforeConclude?: number | null;
    requireQuestionAnswer?: boolean | null;
  } | null;
  lastSeq?: number | null;
  lastTurnAt?: string | null;
  tags?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentspaceDiscussionTurn {
  id: string;
  topicId?: string | null;
  seq?: number | null;
  agentId?: string | null;
  kind?: string | null;
  text?: string | null;
  addressedTo?: string | null;
  replyToSeq?: number | null;
  createdAt?: string;
}

export interface AgentspaceDiscussionOutput {
  id: string;
  outputKind?: string | null;
  ownerAgentId?: string | null;
  content?: string | null;
  createdAt?: string;
}

/** GET /discussion-topics/:id envelope — topic + inline turn/output projections. */
export interface AgentspaceDiscussionDetail {
  topic?: AgentspaceDiscussionTopic | null;
  turns?: AgentspaceDiscussionTurn[] | null;
  outputs?: AgentspaceDiscussionOutput[] | null;
}

export interface AgentspacePrompt {
  id: string;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  tags?: string[] | null;
  currentVersionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentspaceSkill extends AgentspacePrompt {
  shortDescription?: string | null;
}

export interface AgentspaceAssetVersion {
  id: string;
  version?: number | null;
  status?: string | null;
  content?: string | null;
  bodyMarkdown?: string | null;
  entryFile?: string | null;
  variables?: unknown;
  files?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentspaceArtifactLink {
  id: string;
  artifactId?: string | null;
  refType?: string | null;
  refId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentspaceArtifact {
  id: string;
  label?: string | null;
  artifactType?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  hash?: string | null;
  storagePath?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Ref bindings joined from the artifact-links list. */
  links?: AgentspaceArtifactLink[];
}

export interface AgentspaceResource {
  id: string;
  name?: string | null;
  description?: string | null;
  resourceType?: string | null;
  refType?: string | null;
  refId?: string | null;
  uri?: string | null;
  tags?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentspaceAgentProfile {
  id: string;
  slug?: string | null;
  name?: string | null;
  role?: string | null;
  kind?: string | null;
  capabilities?: string[] | null;
  allowedSurfaces?: string[] | null;
  defaultAgents?: unknown;
  tags?: string[] | null;
  body?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentspaceActivityItem {
  id: string;
  action?: string | null;
  status?: string | null;
  summary?: string | null;
  sourceKind?: string | null;
  sourceId?: string | null;
  refs?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export type AgentspaceDataStatus = "select-project" | "loading" | "error" | "empty" | "ready";

export interface AgentspaceDataModel {
  status: AgentspaceDataStatus;
  error: unknown;
  isFetching: boolean;
  memoryItems: AgentspaceMemoryItem[];
  missions: AgentspaceMission[];
  discussions: AgentspaceDiscussionTopic[];
  prompts: AgentspacePrompt[];
  skills: AgentspaceSkill[];
  artifacts: AgentspaceArtifact[];
  /** Artifacts load independently: an artifacts-only backend failure renders
   *  the section's explicit gap state without degrading the other sections. */
  artifactsError: unknown;
  artifactsPending: boolean;
  resources: AgentspaceResource[];
  agentProfiles: AgentspaceAgentProfile[];
  refresh: () => void;
  /** Carried for on-demand detail hooks (projectman model idiom). */
  client: AopsApiClient;
  sessionKey: string | null;
  selectedProject: ProjectOption | null;
}

export const agentspaceQueryKeys = {
  all: (identity: AopsApiIdentity, sessionKey: string | null, selectedProject: ProjectOption | null) =>
    [
      "aops-agentspace",
      identity.baseUrl,
      sessionKey ?? "anonymous",
      selectedProject?.projectId ?? "no-project-id",
      selectedProject?.scopeId ?? "no-scope-id"
    ] as const,
  entity: (
    identity: AopsApiIdentity,
    sessionKey: string | null,
    selectedProject: ProjectOption | null,
    entity: string
  ) => [...agentspaceQueryKeys.all(identity, sessionKey, selectedProject), entity] as const,
  detail: (
    identity: AopsApiIdentity,
    sessionKey: string | null,
    selectedProject: ProjectOption | null,
    entity: string,
    id: string | null
  ) => [...agentspaceQueryKeys.all(identity, sessionKey, selectedProject), "detail", entity, id ?? "none"] as const
};

function byUpdatedDesc<T extends { updatedAt?: string; createdAt?: string }>(a: T, b: T): number {
  return Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? "");
}

function firstError(errors: unknown[]): unknown {
  return errors.find((error) => error != null) ?? null;
}

export function useAgentspaceData(params: {
  client: AopsApiClient;
  selectedProject: ProjectOption | null;
  sessionKey: string | null;
  enabled?: boolean;
}): AgentspaceDataModel {
  const enabled = Boolean(params.enabled && params.selectedProject);
  const key = (entity: string) =>
    agentspaceQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, entity);
  const list = <T,>(path: string) => params.client.get<T[]>(path).then((rows) => (Array.isArray(rows) ? rows : []));

  const memoryQuery = useQuery({
    queryKey: key("memory-items"),
    queryFn: () => list<AgentspaceMemoryItem>("/api/agentspace/memory-items"),
    enabled
  });
  const missionsQuery = useQuery({
    queryKey: key("missions"),
    queryFn: () => list<AgentspaceMission>("/api/agentspace/missions"),
    enabled
  });
  const discussionsQuery = useQuery({
    queryKey: key("discussion-topics"),
    queryFn: () => list<AgentspaceDiscussionTopic>("/api/agentspace/discussion-topics"),
    enabled
  });
  const promptsQuery = useQuery({
    queryKey: key("prompts"),
    queryFn: () => list<AgentspacePrompt>("/api/agentspace/prompts"),
    enabled
  });
  const skillsQuery = useQuery({
    queryKey: key("skills"),
    queryFn: () => list<AgentspaceSkill>("/api/agentspace/skills"),
    enabled
  });
  const resourcesQuery = useQuery({
    queryKey: key("resources"),
    queryFn: () => list<AgentspaceResource>("/api/agentspace/resources"),
    enabled
  });
  const profilesQuery = useQuery({
    queryKey: key("agent-profiles"),
    queryFn: () => list<AgentspaceAgentProfile>("/api/agentspace/agent-profiles"),
    enabled
  });
  // Artifacts: the plain GET /artifacts route maps to list-artifacts-by-ref and
  // requires refType (probed live), so the read model is artifact-links (plain
  // list works) joined with per-artifact detail fetches.
  const artifactsQuery = useQuery({
    queryKey: key("artifacts"),
    queryFn: async () => {
      const links = await list<AgentspaceArtifactLink>("/api/agentspace/artifact-links");
      const byArtifact = new Map<string, AgentspaceArtifactLink[]>();
      for (const link of links) {
        if (!link.artifactId) continue;
        byArtifact.set(link.artifactId, [...(byArtifact.get(link.artifactId) ?? []), link]);
      }
      const artifacts = await Promise.all(
        [...byArtifact.keys()].map((artifactId) =>
          params.client
            .get<AgentspaceArtifact>(`/api/agentspace/artifacts/${encodeURIComponent(artifactId)}`)
            .then((artifact) => ({ ...artifact, links: byArtifact.get(artifactId) ?? [] }))
        )
      );
      return artifacts;
    },
    enabled,
    retry: 0
  });

  const queries = [
    memoryQuery,
    missionsQuery,
    discussionsQuery,
    promptsQuery,
    skillsQuery,
    resourcesQuery,
    profilesQuery
  ];
  const isPending = enabled && queries.some((query) => query.isPending);
  const error = firstError(queries.map((query) => query.error));
  const isFetching = queries.some((query) => query.isFetching);

  const memoryItems = useMemo(() => (memoryQuery.data ?? []).slice().sort(byUpdatedDesc), [memoryQuery.data]);
  const missions = useMemo(() => (missionsQuery.data ?? []).slice().sort(byUpdatedDesc), [missionsQuery.data]);
  const discussions = useMemo(
    () => (discussionsQuery.data ?? []).slice().sort(byUpdatedDesc),
    [discussionsQuery.data]
  );
  const prompts = useMemo(() => (promptsQuery.data ?? []).slice().sort(byUpdatedDesc), [promptsQuery.data]);
  const skills = useMemo(() => (skillsQuery.data ?? []).slice().sort(byUpdatedDesc), [skillsQuery.data]);
  const resources = useMemo(() => (resourcesQuery.data ?? []).slice().sort(byUpdatedDesc), [resourcesQuery.data]);
  const agentProfiles = useMemo(
    () => (profilesQuery.data ?? []).slice().sort(byUpdatedDesc),
    [profilesQuery.data]
  );
  const artifacts = useMemo(() => (artifactsQuery.data ?? []).slice().sort(byUpdatedDesc), [artifactsQuery.data]);
  const artifactsError = artifactsQuery.error ?? null;
  const artifactsPending = enabled && artifactsQuery.isPending;

  // Artifacts count/pending/error participate in the aggregate empty check so
  // an artifacts-only project (or an artifacts-only backend gap) does not read
  // as globally "empty" and shadow the section (codex RRR: issue a02ca283).
  const isEmpty =
    !isPending &&
    !error &&
    memoryItems.length === 0 &&
    missions.length === 0 &&
    discussions.length === 0 &&
    prompts.length === 0 &&
    skills.length === 0 &&
    resources.length === 0 &&
    agentProfiles.length === 0 &&
    artifacts.length === 0 &&
    !artifactsPending &&
    !artifactsError;

  const status: AgentspaceDataStatus = !params.selectedProject
    ? "select-project"
    : isPending
      ? "loading"
      : error
        ? "error"
        : isEmpty
          ? "empty"
          : "ready";

  return {
    status,
    error,
    isFetching: isFetching || artifactsQuery.isFetching,
    memoryItems,
    missions,
    discussions,
    prompts,
    skills,
    artifacts,
    artifactsError,
    artifactsPending,
    resources,
    agentProfiles,
    refresh: () => {
      for (const query of queries) void query.refetch();
      void artifactsQuery.refetch();
    },
    client: params.client,
    sessionKey: params.sessionKey,
    selectedProject: params.selectedProject
  };
}

/** Prompt/skill current-version body — fetched on demand in the detail pane. */
export function useAgentspaceAssetVersion(params: {
  model: AgentspaceDataModel;
  asset: "prompt" | "skill";
  versionId: string | null;
}) {
  const path =
    params.asset === "prompt"
      ? `/api/agentspace/prompt-versions/${encodeURIComponent(params.versionId ?? "")}`
      : `/api/agentspace/skill-versions/${encodeURIComponent(params.versionId ?? "")}`;
  return useQuery({
    queryKey: agentspaceQueryKeys.detail(
      params.model.client.identity,
      params.model.sessionKey,
      params.model.selectedProject,
      `${params.asset}-version`,
      params.versionId
    ),
    queryFn: () => params.model.client.get<AgentspaceAssetVersion>(path),
    enabled: Boolean(params.versionId),
    retry: 0,
    staleTime: 30_000
  });
}

/** Topic detail (turns + outputs ride the projection; there is no GET
 *  /discussion-turns route) — fetched when the topic detail opens. */
export function useAgentspaceDiscussionDetail(params: {
  model: AgentspaceDataModel;
  topicId: string | null;
}) {
  return useQuery({
    queryKey: agentspaceQueryKeys.detail(
      params.model.client.identity,
      params.model.sessionKey,
      params.model.selectedProject,
      "discussion-topic",
      params.topicId
    ),
    queryFn: () =>
      params.model.client.get<AgentspaceDiscussionDetail>(
        `/api/agentspace/discussion-topics/${encodeURIComponent(params.topicId ?? "")}`
      ),
    enabled: Boolean(params.topicId),
    retry: 0
  });
}

/** Activity feed — opt-in and client-side capped: the hosted endpoint has no
 *  limit param (probed live; unknown params filter to zero), and the feed can
 *  run to tens of thousands of rows. */
export function useAgentspaceActivity(params: {
  client: AopsApiClient;
  selectedProject: ProjectOption | null;
  sessionKey: string | null;
  enabled?: boolean;
  cap?: number;
}) {
  const cap = params.cap ?? 100;
  return useQuery({
    queryKey: [
      ...agentspaceQueryKeys.entity(
        params.client.identity,
        params.sessionKey,
        params.selectedProject,
        "activity-items"
      ),
      cap
    ],
    queryFn: () =>
      params.client
        .get<AgentspaceActivityItem[]>("/api/agentspace/activity-items")
        .then((rows) => (Array.isArray(rows) ? rows : []).sort(byUpdatedDesc).slice(0, cap)),
    enabled: Boolean(params.enabled && params.selectedProject),
    retry: 0,
    staleTime: 30_000
  });
}
