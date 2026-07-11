import { useQuery } from "@tanstack/react-query";
import type { AopsApiClient, AopsApiIdentity } from "./aopsApi";

export type AuthProvider = "trusted-local";

export interface AuthPrincipal {
  userId: string;
  email?: string;
  fullName?: string;
  roles?: string[];
  permissions?: string[];
}

export interface AuthMeResult {
  principal: AuthPrincipal;
  authRequired: false;
  authProvider: "trusted-local";
  tenantId: string | null;
}

export const authQueryKeys = {
  all: (identity: AopsApiIdentity) => [
    "aops-trusted-local-auth",
    identity.baseUrl,
    identity.projectId,
    identity.scopeId
  ] as const,
  me: (identity: AopsApiIdentity) => [...authQueryKeys.all(identity), "me"] as const
};

const AUTH_RECHECK_MS = 5 * 60 * 1000;

export async function fetchAuthMe(client: AopsApiClient): Promise<AuthMeResult> {
  const response = await client.requestResult<{
    principal?: AuthPrincipal | null;
    authRequired?: boolean;
    authProvider?: string;
    tenantId?: string | null;
  }>("/api/auth/me", { method: "GET" });
  const data = response.result?.data;

  if (!response.httpOk || response.result?.ok !== true) {
    throw new Error("community_trusted_local_auth_me_failed");
  }
  if (data?.authProvider !== "trusted-local" || data.authRequired !== false) {
    throw new Error("community_trusted_local_auth_contract_rejected");
  }
  const principal = normalizePrincipal(data.principal);
  if (!principal) {
    throw new Error("community_trusted_local_principal_required");
  }

  return {
    principal,
    authRequired: false,
    authProvider: "trusted-local",
    tenantId: normalizeNullable(data.tenantId)
  };
}

export function useAuthSessionQuery(client: AopsApiClient) {
  return useQuery({
    queryKey: authQueryKeys.me(client.identity),
    queryFn: () => fetchAuthMe(client),
    retry: 0,
    refetchInterval: AUTH_RECHECK_MS,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    staleTime: 10_000
  });
}

export function authSessionKey(me: AuthMeResult | undefined): string {
  return me?.principal.userId ?? "untrusted";
}

function normalizePrincipal(value: AuthPrincipal | null | undefined): AuthPrincipal | null {
  const userId = normalizeNullable(value?.userId);
  if (!userId) return null;
  const email = normalizeNullable(value?.email);
  const fullName = normalizeNullable(value?.fullName);
  const roles = normalizeStringList(value?.roles);
  const permissions = normalizeStringList(value?.permissions);
  return {
    userId,
    ...(email ? { email } : {}),
    ...(fullName ? { fullName } : {}),
    ...(roles.length ? { roles } : {}),
    ...(permissions.length ? { permissions } : {})
  };
}

function normalizeStringList(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
