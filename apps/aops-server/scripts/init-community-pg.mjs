import { applyCommunityStrictPgSchema } from "@aops/pg-bootstrap";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const policy = JSON.parse(readFileSync(new URL("./community-migration-policy-v1.json", import.meta.url), "utf8"));

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
  const logs = [];
  const receipt = await applyCommunityStrictPgSchema({
    repoUrl: resolved,
    workspaceRoot: path.resolve(import.meta.dirname, "../../.."),
    policy,
    backupEvidencePath: process.env.AOPS_COMMUNITY_BACKUP_EVIDENCE,
    logs,
  });
  return {
    status: "community-pg-strict-verified",
    domains: ["sys", "agentspace", "docman", "projectman", "chatv3"],
    lineageId: receipt.lineageId,
    stateFingerprintSha256: receipt.stateFingerprintSha256,
    migrationLogCount: logs.length,
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
