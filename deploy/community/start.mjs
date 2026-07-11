import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PUBLIC_HOST = "0.0.0.0";
const PUBLIC_PORT = 5900;
const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 5901;
const SERVER_ORIGIN = `http://${SERVER_HOST}:${SERVER_PORT}`;
const STATIC_ROOT = path.resolve(import.meta.dirname, "../../apps/aops-cockpit-v2/dist");
const SERVER_START = path.resolve(import.meta.dirname, "../../apps/aops-server/scripts/start.mjs");
const SERVER_INIT = path.resolve(import.meta.dirname, "../../apps/aops-server/scripts/init-community-pg.mjs");
const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
]);
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"], [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".png", "image/png"],
  [".svg", "image/svg+xml"], [".woff", "font/woff"], [".woff2", "font/woff2"],
]);

function exactEnv(env, key, expected) {
  const value = typeof env[key] === "string" ? env[key].trim() : "";
  if (value && value !== expected) throw new Error(`community_front_invalid_${key.toLowerCase()}`);
}

export function validateCommunityFrontEnvironment(env = process.env) {
  exactEnv(env, "COMMUNITY_HOST", PUBLIC_HOST);
  exactEnv(env, "COMMUNITY_PORT", String(PUBLIC_PORT));
  exactEnv(env, "HOST", SERVER_HOST);
  exactEnv(env, "PORT", String(SERVER_PORT));
  exactEnv(env, "ORIGIN", SERVER_ORIGIN);
  if (!existsSync(STATIC_ROOT)) throw new Error("community_front_cockpit_build_missing");
  if (!existsSync(SERVER_START)) throw new Error("community_front_server_start_missing");
  if (!existsSync(SERVER_INIT)) throw new Error("community_front_server_init_missing");
  return { publicHost: PUBLIC_HOST, publicPort: PUBLIC_PORT, serverOrigin: SERVER_ORIGIN };
}

export function shouldProxyPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/") ||
    pathname === "/api-info" || pathname === "/api-info.json" || pathname === "/openapi.json";
}

function proxyHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower === "host" || lower.startsWith("x-forwarded-")) continue;
    if (value !== undefined) result[lower] = value;
  }
  result.host = `${SERVER_HOST}:${SERVER_PORT}`;
  return result;
}

function proxyRequest(req, res) {
  const upstream = httpRequest({
    hostname: SERVER_HOST,
    port: SERVER_PORT,
    method: req.method,
    path: req.url,
    headers: proxyHeaders(req.headers),
  }, (upstreamResponse) => {
    const headers = {};
    for (const [key, value] of Object.entries(upstreamResponse.headers)) {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) headers[key] = value;
    }
    res.writeHead(upstreamResponse.statusCode ?? 502, headers);
    upstreamResponse.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end('{"error":"community_server_unavailable"}');
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

export function resolveStaticPath(pathname, staticRoot = STATIC_ROOT) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = decoded.replace(/\\/g, "/").replace(/^\/+/, "");
  const candidate = path.resolve(staticRoot, relative || "index.html");
  const boundary = path.relative(staticRoot, candidate);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return path.join(staticRoot, "index.html");
}

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }
  const filePath = resolveStaticPath(pathname);
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": CONTENT_TYPES.get(extension) ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
    "cache-control": path.basename(filePath) === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (req.method === "HEAD") res.end(); else createReadStream(filePath).pipe(res);
}

async function waitForServer(child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`community_server_exited_before_ready:${child.exitCode}`);
    try {
      const response = await fetch(`${SERVER_ORIGIN}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("community_server_readiness_timeout");
}

async function initializeDatabase(env) {
  const child = spawn(process.execPath, [SERVER_INIT], {
    cwd: path.resolve(path.dirname(SERVER_INIT), ".."),
    env,
    stdio: "inherit",
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0) throw new Error(`community_pg_init_failed:${result.code}:${result.signal}`);
}

export async function runCommunityFront(env = process.env) {
  const listen = validateCommunityFrontEnvironment(env);
  await initializeDatabase(env);
  const child = spawn(process.execPath, [SERVER_START], {
    cwd: path.resolve(path.dirname(SERVER_START), ".."),
    env: { ...env, HOST: SERVER_HOST, PORT: String(SERVER_PORT), ORIGIN: SERVER_ORIGIN },
    stdio: "inherit",
  });
  let shuttingDown = false;
  let server;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (server) server.close();
    if (child.exitCode === null) child.kill(signal);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  child.once("exit", (code, signal) => {
    if (!shuttingDown) {
      if (server) server.close();
      process.stderr.write(`[aops-community] server exited code=${code} signal=${signal}\n`);
      process.exitCode = code ?? 1;
    }
  });
  try {
    await waitForServer(child);
    server = createServer((req, res) => {
      let url;
      try { url = new URL(req.url ?? "/", "http://community.local"); } catch {
        res.writeHead(400); res.end(); return;
      }
      if (shouldProxyPath(url.pathname)) proxyRequest(req, res); else serveStatic(req, res, url.pathname);
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(listen.publicPort, listen.publicHost, resolve);
    });
    process.stderr.write(`[aops-community] Cockpit + API listening on http://127.0.0.1:${listen.publicPort}\n`);
  } catch (error) {
    shutdown("SIGTERM");
    throw error;
  }
}

const isMain = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCommunityFront().catch((error) => {
    process.stderr.write(`[aops-community] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
