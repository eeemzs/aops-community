const TOKEN_QUERY_PARAM = "token";
const SERVER_QUERY_PARAM = "server";

export interface AopsCockpitRuntimeConfig {
  serverBaseUrl: string;
}

export function resolveAopsCockpitRuntimeConfig(): AopsCockpitRuntimeConfig {
  const url = new URL(window.location.href);
  const query = url.searchParams;
  const hadTokenQuery = query.has(TOKEN_QUERY_PARAM);

  if (hadTokenQuery) {
    query.delete(TOKEN_QUERY_PARAM);
    window.history.replaceState(
      null,
      "",
      url.pathname + (query.toString() ? "?" + query.toString() : "") + url.hash
    );
  }

  const serverFromQuery = query.get(SERVER_QUERY_PARAM)?.trim() ?? "";
  return {
    serverBaseUrl: resolveLoopbackBaseUrl(serverFromQuery, window.location.origin)
  };
}

function resolveLoopbackBaseUrl(explicitValue: string, currentOrigin: string): string {
  const selected = explicitValue || currentOrigin;
  let parsed: URL;
  try {
    parsed = new URL(selected, currentOrigin);
  } catch {
    throw new Error("community_cockpit_invalid_server_url");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    !isLoopbackHostname(parsed.hostname)
  ) {
    throw new Error("community_cockpit_loopback_server_required");
  }
  return parsed.origin;
}

function isLoopbackHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  return octets[0] === 127 && octets.every((octet) => octet >= 0 && octet <= 255);
}
