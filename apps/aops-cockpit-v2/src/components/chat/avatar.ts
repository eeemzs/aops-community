// Deterministic avatar identity (ported from apps/aops-cockpit). Color is a
// reference-token var() ref (NOT a hardcoded hex) so avatars stay on-token +
// theme-aware (light/dark). The hex lives only in the token layer.
const TOKEN_VARS = ["var(--coral)", "var(--sage)", "var(--indigo)", "var(--amber)", "var(--claret)"];

export function avatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TOKEN_VARS[hash % TOKEN_VARS.length];
}

export function initials(handle: string): string {
  const cleaned = handle.replace(/^@/, "").trim();
  const words = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return (cleaned.slice(0, 2) || "?").toUpperCase();
}
