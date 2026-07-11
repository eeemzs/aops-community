import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AopsApiClient, AopsApiIdentity } from "./aopsApi";
import type { ProjectOption } from "./projects";

// Hosted Docman read layer (documents are a section GRAPH server-side; the
// cockpit reads document/group/version metadata plus the built version index
// [outline entries]. Assembled markdown retrieval is an operation surface and
// lands with the S3 detail slice.) Shapes probed live @5900 (2026-07-02).

export interface DocmanDocumentGroup {
  id: string;
  groupUid?: string | null;
  parentGroupUid?: string | null;
  title?: string | null;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocmanDocument {
  id: string;
  documentUid?: string | null;
  slug?: string | null;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  status?: string | null;
  visibility?: string | null;
  groupId?: string | null;
  groupUid?: string | null;
  tags?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocmanDocumentVersion {
  id: string;
  documentId?: string | null;
  version?: number | null;
  label?: string | null;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  isCurrent?: boolean | null;
  publishedAt?: string | null;
  releaseNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocmanIndexEntry {
  anchor?: string | null;
  parentAnchor?: string | null;
  title?: string | null;
  number?: string | null;
  depth?: number | null;
  position?: number | null;
  sectionId?: string | null;
  sectionSlug?: string | null;
  itemKind?: string | null;
}

export interface DocmanVersionIndex {
  documentId?: string | null;
  documentVersionId?: string | null;
  title?: string | null;
  built?: boolean | null;
  entries?: DocmanIndexEntry[] | null;
}

export type DocmanDataStatus = "select-project" | "loading" | "error" | "empty" | "ready";

export interface DocmanDataModel {
  status: DocmanDataStatus;
  error: unknown;
  isFetching: boolean;
  groups: DocmanDocumentGroup[];
  documents: DocmanDocument[];
  refresh: () => void;
  /** Carried for on-demand detail hooks (projectman model idiom). */
  client: AopsApiClient;
  sessionKey: string | null;
  selectedProject: ProjectOption | null;
}

export const docmanQueryKeys = {
  all: (identity: AopsApiIdentity, sessionKey: string | null, selectedProject: ProjectOption | null) =>
    [
      "aops-docman",
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
  ) => [...docmanQueryKeys.all(identity, sessionKey, selectedProject), entity] as const,
  detail: (
    identity: AopsApiIdentity,
    sessionKey: string | null,
    selectedProject: ProjectOption | null,
    entity: string,
    id: string | null
  ) => [...docmanQueryKeys.all(identity, sessionKey, selectedProject), "detail", entity, id ?? "none"] as const
};

function byUpdatedDesc<T extends { updatedAt?: string; createdAt?: string }>(a: T, b: T): number {
  return Date.parse(b.updatedAt ?? b.createdAt ?? "") - Date.parse(a.updatedAt ?? a.createdAt ?? "");
}

export function useDocmanData(params: {
  client: AopsApiClient;
  selectedProject: ProjectOption | null;
  sessionKey: string | null;
  enabled?: boolean;
}): DocmanDataModel {
  const enabled = Boolean(params.enabled && params.selectedProject);
  const groupsQuery = useQuery({
    queryKey: docmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "groups"),
    queryFn: () =>
      params.client
        .get<DocmanDocumentGroup[]>("/api/docman/document-groups")
        .then((rows) => (Array.isArray(rows) ? rows : [])),
    enabled
  });
  const documentsQuery = useQuery({
    queryKey: docmanQueryKeys.entity(params.client.identity, params.sessionKey, params.selectedProject, "documents"),
    queryFn: () =>
      params.client
        .get<DocmanDocument[]>("/api/docman/documents")
        .then((rows) => (Array.isArray(rows) ? rows : [])),
    enabled
  });

  const groups = useMemo(() => (groupsQuery.data ?? []).slice().sort(byUpdatedDesc), [groupsQuery.data]);
  const documents = useMemo(() => (documentsQuery.data ?? []).slice().sort(byUpdatedDesc), [documentsQuery.data]);

  const isPending = enabled && (groupsQuery.isPending || documentsQuery.isPending);
  const error = groupsQuery.error ?? documentsQuery.error ?? null;
  const status: DocmanDataStatus = !params.selectedProject
    ? "select-project"
    : isPending
      ? "loading"
      : error
        ? "error"
        : documents.length === 0 && groups.length === 0
          ? "empty"
          : "ready";

  return {
    status,
    error,
    isFetching: groupsQuery.isFetching || documentsQuery.isFetching,
    groups,
    documents,
    refresh: () => {
      void groupsQuery.refetch();
      void documentsQuery.refetch();
    },
    client: params.client,
    sessionKey: params.sessionKey,
    selectedProject: params.selectedProject
  };
}

/** Assembled markdown for one document version (the mirror-pull surface):
 *  POST /document-versions/:id/materialize {documentVersionId, target}. */
export function useDocmanMaterialized(params: { model: DocmanDataModel; versionId: string | null }) {
  return useQuery({
    queryKey: docmanQueryKeys.detail(
      params.model.client.identity,
      params.model.sessionKey,
      params.model.selectedProject,
      "materialized",
      params.versionId
    ),
    queryFn: () =>
      params.model.client.post<{ content?: string | null }>(
        `/api/docman/document-versions/${encodeURIComponent(params.versionId ?? "")}/materialize`,
        { documentVersionId: params.versionId, target: "markdown" }
      ),
    enabled: Boolean(params.versionId),
    retry: 0,
    staleTime: 60_000
  });
}

/** Version list for the selected document (current flagged, version desc). */
export function useDocmanDocumentVersions(params: { model: DocmanDataModel; documentId: string | null }) {
  return useQuery({
    queryKey: docmanQueryKeys.detail(
      params.model.client.identity,
      params.model.sessionKey,
      params.model.selectedProject,
      "document-versions",
      params.documentId
    ),
    queryFn: () =>
      params.model.client
        .get<DocmanDocumentVersion[]>("/api/docman/document-versions", {
          documentId: params.documentId ?? ""
        })
        .then((rows) =>
          (Array.isArray(rows) ? rows : []).slice().sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
        ),
    enabled: Boolean(params.documentId),
    retry: 0
  });
}

/** Built outline (index entries) for one document version. */
export function useDocmanVersionIndex(params: { model: DocmanDataModel; versionId: string | null }) {
  return useQuery({
    queryKey: docmanQueryKeys.detail(
      params.model.client.identity,
      params.model.sessionKey,
      params.model.selectedProject,
      "version-index",
      params.versionId
    ),
    queryFn: () =>
      params.model.client.get<DocmanVersionIndex>(
        `/api/docman/document-versions/${encodeURIComponent(params.versionId ?? "")}/index`
      ),
    enabled: Boolean(params.versionId),
    retry: 0,
    staleTime: 30_000
  });
}

export function currentDocumentVersion(versions: DocmanDocumentVersion[]): DocmanDocumentVersion | null {
  return versions.find((version) => version.isCurrent) ?? versions[0] ?? null;
}
