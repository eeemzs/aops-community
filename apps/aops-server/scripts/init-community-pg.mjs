import { applyCommunityAopsPgSchema } from "@aops/pg-bootstrap";
import { applyChatv3PgSchema } from "@aopslab/domain-pg-bootstrap-chatv3";
import { applyDocmanPgSchema } from "@aopslab/domain-pg-bootstrap-docman";
import { applyProjectmanPgSchema } from "@aopslab/domain-pg-bootstrap-projectman";
import { applySysPgSchema } from "@aopslab/domain-pg-bootstrap-sys";
import { pathToFileURL } from "node:url";

function requireRepoUrl(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) throw new Error("community_pg_init_url_required");
  const parsed = new URL(candidate);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.username || !parsed.password || !parsed.pathname.slice(1)) {
    throw new Error("community_pg_init_url_invalid");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopbackV4 = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  const loopback = hostname === "localhost" || hostname === "::1" ||
    Boolean(loopbackV4 && loopbackV4.slice(1).every((octet) => Number(octet) <= 255));
  if (!loopback || parsed.search || parsed.hash) throw new Error("community_pg_init_loopback_required");
  return candidate;
}

export async function initializeCommunityPg(repoUrl = process.env.AOPS_PG_URL) {
  const resolved = requireRepoUrl(repoUrl);
  const logs = { sys: [], agentspace: [], docman: [], projectman: [] };
  await applySysPgSchema({ repoUrl: resolved, logs: logs.sys });
  await applyCommunityAopsPgSchema({ repoUrl: resolved, logs: logs.agentspace });
  await applyDocmanPgSchema({ repoUrl: resolved, logs: logs.docman });
  await applyProjectmanPgSchema({ repoUrl: resolved, logs: logs.projectman });
  const chatv3 = await applyChatv3PgSchema({ repoUrl: resolved });
  return {
    status: "community-pg-initialized",
    domains: ["sys", "agentspace", "docman", "projectman", "chatv3"],
    chatv3Applied: chatv3.applied.length,
    chatv3Skipped: chatv3.skipped.length,
  };
}

const isMain = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  initializeCommunityPg().then((result) => {
    process.stdout.write(JSON.stringify(result) + "\n");
  }).catch((error) => {
    process.stderr.write(`[aops-community-pg-init] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
