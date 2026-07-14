import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "5900";
const FORBIDDEN_PROXY_ENV = [
  "ADDRESS_HEADER",
  "XFF_DEPTH",
  "PROTOCOL_HEADER",
  "HOST_HEADER"
];

function nonEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isLoopbackPostgresqlHost(value) {
  const host = nonEmpty(value).replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  const match = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return Boolean(match && match.slice(1).every((octet) => Number(octet) <= 255));
}

function requirePostgresqlUrl(value) {
  const candidate = nonEmpty(value);
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("community_server_postgresql_url_required");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    parsed.search ||
    parsed.hash ||
    !isLoopbackPostgresqlHost(parsed.hostname) ||
    !parsed.username ||
    !parsed.password ||
    !parsed.pathname.slice(1)
  ) {
    throw new Error("community_server_postgresql_url_required");
  }
  return candidate;
}

export function resolveCommunityListenConfig(env = process.env) {
  const ambientPgKeys = Object.keys(env)
    .filter((key) => /^PG[A-Z0-9_]+$/i.test(key) && nonEmpty(env[key]))
    .sort();
  if (ambientPgKeys.length > 0) {
    throw new Error(`community_server_ambient_pg_env_forbidden:${ambientPgKeys.join(",")}`);
  }
  for (const key of FORBIDDEN_PROXY_ENV) {
    if (nonEmpty(env[key])) {
      throw new Error(`community_server_proxy_trust_env_forbidden:${key}`);
    }
  }
  if (nonEmpty(env.AOPS_DB_BOOTSTRAP_MODE).toLowerCase() !== "explicit") {
    throw new Error("community_strict_bootstrap_mode_required");
  }

  const requestedHost = nonEmpty(env.HOST);
  if (requestedHost && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(requestedHost.toLowerCase())) {
    throw new Error("community_server_loopback_host_required");
  }

  const requestedPort = nonEmpty(env.PORT) || DEFAULT_PORT;
  if (!/^[1-9]\d{0,4}$/.test(requestedPort) || Number(requestedPort) > 65535) {
    throw new Error("community_server_invalid_port");
  }

  requirePostgresqlUrl(env.AOPS_PG_URL);
  const origin = `http://${DEFAULT_HOST}:${requestedPort}`;
  const requestedOrigin = nonEmpty(env.ORIGIN);
  if (requestedOrigin && requestedOrigin !== origin) {
    throw new Error("community_server_loopback_origin_required");
  }
  return { host: DEFAULT_HOST, port: requestedPort, origin };
}

export async function runStart(env = process.env) {
  const listen = resolveCommunityListenConfig(env);
  process.env.HOST = listen.host;
  process.env.PORT = listen.port;
  process.env.ORIGIN = listen.origin;
  process.env.AOPS_PG_URL = requirePostgresqlUrl(env.AOPS_PG_URL);

  const rootDir = path.resolve(import.meta.dirname, "..");
  const buildEntry = path.join(rootDir, "build", "index.js");
  if (!existsSync(buildEntry)) {
    throw new Error(`community_server_build_missing:${buildEntry}`);
  }
  process.stderr.write(`[aops-community-server] listening on ${listen.origin}\n`);
  await import(pathToFileURL(buildEntry).href);
}

const isMain = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runStart().catch((error) => {
    process.stderr.write(`[aops-community-server] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
