import { useQuery } from "@tanstack/react-query";
import type { AopsApiClient, AopsApiIdentity } from "./aopsApi";

export interface HostedProjectRecord {
  id?: string | null;
  projectId?: string | null;
  scopeId?: string | null;
  name?: string | null;
  slug?: string | null;
  status?: string | null;
  visibility?: string | null;
  projectType?: string | null;
}

export interface ProjectOption {
  key: string;
  label: string;
  name: string;
  slug: string;
  projectId: string | null;
  scopeId: string | null;
  status: string | null;
  visibility: string | null;
  projectType: string | null;
}

export const projectQueryKeys = {
  all: (identity: AopsApiIdentity) => [
    "aops-projects",
    identity.baseUrl,
  ] as const,
  list: (identity: AopsApiIdentity, sessionKey: string | null) => [
    ...projectQueryKeys.all(identity),
    "list",
    sessionKey ?? "anonymous"
  ] as const
};

export async function fetchProjectInventory(client: AopsApiClient): Promise<ProjectOption[]> {
  const records = await client.get<HostedProjectRecord[]>("/api/agentspace/projects");
  return uniqueProjects(Array.isArray(records) ? records : []);
}

export function useProjectsQuery(params: {
  client: AopsApiClient;
  sessionKey: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: projectQueryKeys.list(params.client.identity, params.sessionKey),
    queryFn: () => fetchProjectInventory(params.client),
    enabled: params.enabled ?? true,
    retry: 0,
    staleTime: 10_000
  });
}

function uniqueProjects(records: HostedProjectRecord[]): ProjectOption[] {
  const seen = new Set<string>();
  const projects: ProjectOption[] = [];
  for (const record of records) {
    const project = toProjectOption(record);
    if (!project || seen.has(project.key)) continue;
    seen.add(project.key);
    projects.push(project);
  }
  return projects;
}

function toProjectOption(record: HostedProjectRecord): ProjectOption | null {
  const projectId = normalize(record.id) ?? normalize(record.projectId) ?? normalize(record.scopeId);
  const scopeId = normalize(record.scopeId) ?? projectId;
  const slug = normalize(record.slug) ?? normalize(record.name) ?? projectId;
  if (!slug && !projectId) return null;

  const key = slug ?? projectId ?? "project";
  return {
    key,
    label: key,
    name: normalize(record.name) ?? key,
    slug: key,
    projectId,
    scopeId,
    status: normalize(record.status),
    visibility: normalize(record.visibility),
    projectType: normalize(record.projectType)
  };
}

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
