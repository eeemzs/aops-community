function isLoopbackHostname(value: string): boolean {
  const hostname = value.trim().toLowerCase();
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  return octets[0] === 127 && octets.every((octet) => octet >= 0 && octet <= 255);
}

export function resolveRequestBaseUrl(_request: Request, url: URL): string {
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    !isLoopbackHostname(url.hostname)
  ) {
    throw new Error("community_server_loopback_request_origin_required");
  }
  return url.origin;
}
