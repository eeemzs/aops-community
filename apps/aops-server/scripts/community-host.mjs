import {
  closeSync,
  constants as fsConstants,
  createReadStream,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
} from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const COMMUNITY_HOST_MODES = Object.freeze({
  native: "direct-loopback",
  oci: "container-loopback-proxy",
});

const NATIVE_EDGE_HOST = "127.0.0.1";
const OCI_EDGE_HOST = "0.0.0.0";
const INTERNAL_HOST = "127.0.0.1";
const DEFAULT_EDGE_PORT = "5900";
const DEFAULT_OCI_INTERNAL_PORT = "5901";
const PACKAGE_STATIC_ROOT = path.resolve(import.meta.dirname, "../cockpit");
const CHECKOUT_STATIC_ROOT = path.resolve(import.meta.dirname, "../../aops-cockpit-v2/dist");
const DEFAULT_PATHS = Object.freeze({
  staticRoot: existsSync(path.join(PACKAGE_STATIC_ROOT, "index.html"))
    ? PACKAGE_STATIC_ROOT
    : CHECKOUT_STATIC_ROOT,
  handlerEntry: path.resolve(import.meta.dirname, "../build/handler.js"),
});
const FORBIDDEN_PROXY_ENV = Object.freeze([
  "ADDRESS_HEADER",
  "XFF_DEPTH",
  "PROTOCOL_HEADER",
  "HOST_HEADER",
]);
const BASE_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const FORBIDDEN_INBOUND_HEADERS = new Set([
  "cookie",
  "forwarded",
  "host",
  "origin",
  "proxy-connection",
  "referer",
  "via",
]);
const FORBIDDEN_RESPONSE_HEADERS = new Set([
  "set-cookie",
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-allow-origin",
  "access-control-expose-headers",
  "access-control-max-age",
]);
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);
const STATIC_SECURITY_HEADERS = Object.freeze({
  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
});

function nonEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePort(value, fallback, label) {
  const candidate = String(value ?? "").trim() || fallback;
  if (!/^[1-9]\d{0,4}$/.test(candidate) || Number(candidate) > 65535) {
    throw new Error(`community_host_invalid_${label}_port`);
  }
  return { text: candidate, number: Number(candidate) };
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
    parsed.hash ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password ||
    !parsed.pathname.slice(1)
  ) {
    throw new Error("community_server_postgresql_url_required");
  }
  const entries = [...parsed.searchParams.entries()];
  const uniqueQueryKeys = new Set(entries.map(([key]) => key));
  const exactQuery = (expected) =>
    entries.length === Object.keys(expected).length &&
    uniqueQueryKeys.size === entries.length &&
    entries.every(([key, entryValue]) => expected[key] === entryValue);
  const loopback = isLoopbackPostgresqlHost(parsed.hostname);
  const noQuery = entries.length === 0;
  const localDisable = loopback && exactQuery({ sslmode: "disable" });
  const tlsRequire = exactQuery({ sslmode: "require", uselibpqcompat: "true" });
  const verifyFull = exactQuery({ sslmode: "verify-full" });
  const verifyFullWithRoot = entries.length === 2 &&
    uniqueQueryKeys.size === entries.length &&
    parsed.searchParams.get("sslmode") === "verify-full" &&
    path.isAbsolute(nonEmpty(parsed.searchParams.get("sslrootcert"))) &&
    entries.every(([key]) => key === "sslmode" || key === "sslrootcert");
  if (!(loopback && noQuery) && !localDisable && !tlsRequire && !verifyFull && !verifyFullWithRoot) {
    throw new Error("community_server_postgresql_url_required");
  }
  return candidate;
}

function validateRuntimeEnvironment(env) {
  if (nonEmpty(env.NODE_ENV) !== "production") {
    throw new Error("community_host_production_mode_required");
  }
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
  requirePostgresqlUrl(env.AOPS_PG_URL);
}

export function resolveCommunityHostConfig(options, env = process.env) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("community_host_options_required");
  }
  validateRuntimeEnvironment(env);
  const mode = nonEmpty(options.mode);
  const edgePort = parsePort(options.edgePort, DEFAULT_EDGE_PORT, "edge");
  if (mode === COMMUNITY_HOST_MODES.native) {
    if (
      options.edgeHost !== NATIVE_EDGE_HOST ||
      options.publicPort !== undefined ||
      options.internalHost !== undefined ||
      options.internalPort !== undefined
    ) {
      throw new Error("community_host_native_literal_contract_required");
    }
    return Object.freeze({
      mode,
      edgeHost: NATIVE_EDGE_HOST,
      edgePort: edgePort.number,
      publicPort: edgePort.number,
      publicAuthority: `${NATIVE_EDGE_HOST}:${edgePort.text}`,
      publicOrigin: `http://${NATIVE_EDGE_HOST}:${edgePort.text}`,
      internalHost: null,
      internalPort: null,
    });
  }
  if (mode === COMMUNITY_HOST_MODES.oci) {
    const publicPort = parsePort(options.publicPort, "", "public");
    const internalPort = parsePort(options.internalPort, DEFAULT_OCI_INTERNAL_PORT, "internal");
    if (
      options.edgeHost !== OCI_EDGE_HOST ||
      edgePort.text !== DEFAULT_EDGE_PORT ||
      options.internalHost !== INTERNAL_HOST ||
      internalPort.text !== DEFAULT_OCI_INTERNAL_PORT
    ) {
      throw new Error("community_host_oci_literal_contract_required");
    }
    return Object.freeze({
      mode,
      edgeHost: OCI_EDGE_HOST,
      edgePort: edgePort.number,
      publicPort: publicPort.number,
      publicAuthority: `${NATIVE_EDGE_HOST}:${publicPort.text}`,
      publicOrigin: `http://${NATIVE_EDGE_HOST}:${publicPort.text}`,
      internalHost: INTERNAL_HOST,
      internalPort: internalPort.number,
    });
  }
  throw new Error("community_host_mode_required");
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRegularFile(root, candidate) {
  try {
    const rootStats = lstatSync(root);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return null;
    const candidateStats = lstatSync(candidate);
    if (!candidateStats.isFile() || candidateStats.isSymbolicLink()) return null;
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    return isWithin(realRoot, realCandidate) ? realCandidate : null;
  } catch {
    return null;
  }
}

export function validateCommunityHostPaths(paths = DEFAULT_PATHS) {
  const resolved = {
    staticRoot: path.resolve(paths.staticRoot),
    handlerEntry: path.resolve(paths.handlerEntry),
  };
  if (!safeRegularFile(resolved.staticRoot, path.join(resolved.staticRoot, "index.html"))) {
    throw new Error("community_host_cockpit_index_missing");
  }
  if (!safeRegularFile(path.dirname(resolved.handlerEntry), resolved.handlerEntry)) {
    throw new Error("community_host_handler_missing");
  }
  return Object.freeze(resolved);
}

export function shouldHandleApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/") ||
    pathname === "/api-info" || pathname === "/api-info.json" || pathname === "/openapi.json";
}

export function resolveStaticPath(pathname, staticRoot = DEFAULT_PATHS.staticRoot) {
  if (/%(?:2f|5c)/i.test(pathname)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const root = path.resolve(staticRoot);
  const relative = decoded.replace(/^\/+/, "");
  if (relative.split("/").some((segment) => segment === "." || segment === "..")) return null;
  if (!relative || relative === "index.html") {
    return safeRegularFile(root, path.join(root, "index.html"));
  }
  if (relative.startsWith("assets/")) {
    const extension = path.posix.extname(relative).toLowerCase();
    if (!CONTENT_TYPES.has(extension) || extension === ".html") return null;
    const candidate = path.resolve(root, ...relative.split("/"));
    if (!isWithin(root, candidate)) return null;
    return safeRegularFile(root, candidate);
  }
  if (path.posix.extname(relative)) return null;
  return safeRegularFile(root, path.join(root, "index.html"));
}

function parseLoopbackOrigin(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`community_host_${label}_required`);
  }
  let parsed;
  try {
    parsed = new URL(label === "host" ? `http://${value.trim()}` : value.trim());
  } catch {
    throw new Error(`community_host_${label}_invalid`);
  }
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(parsed.hostname.toLowerCase()) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`community_host_${label}_loopback_required`);
  }
  return parsed.origin;
}

function requestHeaderValue(value, label, { required = false } = {}) {
  if (value === undefined) {
    if (required) throw new Error(`community_host_${label}_required`);
    return "";
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`community_host_${label}_header_invalid`);
  }
  return value.trim();
}

export function validateCommunityBrowserRequest(headers = {}) {
  const hostOrigin = parseLoopbackOrigin(
    requestHeaderValue(headers.host, "host", { required: true }),
    "host",
  );
  const origin = requestHeaderValue(headers.origin, "origin");
  if (origin && parseLoopbackOrigin(origin, "origin") !== hostOrigin) {
    throw new Error("community_host_origin_host_mismatch");
  }
  const fetchSite = requestHeaderValue(headers["sec-fetch-site"], "sec_fetch_site").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new Error("community_host_cross_site_forbidden");
  }
  return { hostOrigin, browserOriginPresent: Boolean(origin) };
}

function headerTokens(value) {
  const values = Array.isArray(value) ? value : [value];
  return new Set(values
    .flatMap((entry) => typeof entry === "string" ? entry.split(",") : [])
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean));
}

function sanitizedRequestHeaders(headers, config, browserOriginPresent) {
  const connectionTokens = headerTokens(headers.connection);
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      BASE_HOP_BY_HOP_HEADERS.has(lower) ||
      connectionTokens.has(lower) ||
      FORBIDDEN_INBOUND_HEADERS.has(lower) ||
      lower.startsWith("x-forwarded-")
    ) continue;
    if (value !== undefined) result[lower] = value;
  }
  result.host = config.publicAuthority;
  if (browserOriginPresent) result.origin = config.publicOrigin;
  return result;
}

function applyDirectRequestHeaders(req, headers) {
  for (const key of Object.keys(req.headers)) delete req.headers[key];
  Object.assign(req.headers, headers);
}

function responseHeaders(headers) {
  const connectionTokens = headerTokens(headers.connection);
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      BASE_HOP_BY_HOP_HEADERS.has(lower) ||
      connectionTokens.has(lower) ||
      FORBIDDEN_RESPONSE_HEADERS.has(lower) ||
      value === undefined
    ) continue;
    result[lower] = value;
  }
  return result;
}

function applyDirectResponsePolicy(res) {
  const setHeader = res.setHeader.bind(res);
  const appendHeader = typeof res.appendHeader === "function" ? res.appendHeader.bind(res) : null;
  const writeHead = res.writeHead.bind(res);
  res.setHeader = (name, value) => {
    const lower = String(name).toLowerCase();
    if (BASE_HOP_BY_HOP_HEADERS.has(lower) || FORBIDDEN_RESPONSE_HEADERS.has(lower)) return res;
    return setHeader(name, value);
  };
  if (appendHeader) {
    res.appendHeader = (name, value) => {
      const lower = String(name).toLowerCase();
      if (BASE_HOP_BY_HOP_HEADERS.has(lower) || FORBIDDEN_RESPONSE_HEADERS.has(lower)) return res;
      return appendHeader(name, value);
    };
  }
  res.writeHead = (statusCode, statusMessageOrHeaders, maybeHeaders) => {
    if (typeof statusMessageOrHeaders === "string") {
      return writeHead(statusCode, statusMessageOrHeaders, responseHeaders(maybeHeaders ?? {}));
    }
    return writeHead(statusCode, responseHeaders(statusMessageOrHeaders ?? {}));
  };
}

export function proxyCommunityRequest(req, res, config, browserOriginPresent) {
  const upstream = httpRequest({
    hostname: config.internalHost,
    port: config.internalPort,
    method: req.method,
    path: req.url,
    headers: sanitizedRequestHeaders(req.headers, config, browserOriginPresent),
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders(upstreamResponse.headers));
    upstreamResponse.once("error", () => res.destroy());
    upstreamResponse.pipe(res);
  });
  const destroyUpstream = () => upstream.destroy();
  req.once("aborted", destroyUpstream);
  req.once("close", () => {
    if (!req.complete) destroyUpstream();
  });
  res.once("close", destroyUpstream);
  upstream.once("error", () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end('{"error":"community_server_unavailable"}');
  });
  req.pipe(upstream);
}

function openStaticFile(filePath) {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const descriptor = openSync(filePath, flags);
  const stats = fstatSync(descriptor);
  if (!stats.isFile()) {
    closeSync(descriptor);
    throw new Error("community_host_static_file_unsafe");
  }
  return { descriptor, size: stats.size };
}

function serveStatic(req, res, pathname, paths) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }
  const filePath = resolveStaticPath(pathname, paths.staticRoot);
  if (!filePath) {
    res.writeHead(404, { ...STATIC_SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  let opened;
  try {
    opened = openStaticFile(filePath);
  } catch {
    res.writeHead(404, { ...STATIC_SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    ...STATIC_SECURITY_HEADERS,
    "content-type": CONTENT_TYPES.get(extension) ?? "application/octet-stream",
    "content-length": String(opened.size),
    "cache-control": path.basename(filePath) === "index.html"
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });
  if (req.method === "HEAD") {
    closeSync(opened.descriptor);
    res.end();
    return;
  }
  const stream = createReadStream(filePath, { fd: opened.descriptor, autoClose: true });
  stream.once("error", () => res.destroy());
  stream.pipe(res);
}

function rejectUpgrade(_request, socket) {
  socket.end([
    "HTTP/1.1 426 Upgrade Required",
    "Connection: close",
    "Content-Length: 0",
    "",
    "",
  ].join("\r\n"));
}

function trackServerSockets(server) {
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", rejectUpgrade);
  server.on("clientError", (_error, socket) => socket.destroy());
  return sockets;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server, sockets) {
  if (!server) return;
  for (const socket of sockets) socket.destroy();
  server.close();
}

async function loadHandler(handlerEntry) {
  const loaded = await import(pathToFileURL(handlerEntry).href);
  if (typeof loaded.handler !== "function") {
    throw new Error("community_host_handler_export_missing");
  }
  return loaded.handler;
}

export async function runCommunityHost(options, env = process.env) {
  if (env !== process.env) throw new Error("community_host_process_env_required");
  const config = resolveCommunityHostConfig(options, env);
  const paths = validateCommunityHostPaths();
  process.env.HOST = NATIVE_EDGE_HOST;
  process.env.PORT = String(config.internalPort ?? config.edgePort);
  process.env.ORIGIN = config.publicOrigin;
  const handler = await loadHandler(paths.handlerEntry);
  let innerServer;
  let innerSockets = new Set();
  let edgeServer;
  let edgeSockets = new Set();
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    closeServer(edgeServer, edgeSockets);
    closeServer(innerServer, innerSockets);
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
  const runtimeFailure = (error) => {
    process.stderr.write(`[aops-community] runtime failure code=${error?.code ?? "unknown"}\n`);
    process.exitCode = 1;
    shutdown();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    if (config.mode === COMMUNITY_HOST_MODES.oci) {
      innerServer = createServer(handler);
      innerSockets = trackServerSockets(innerServer);
      await listen(innerServer, config.internalPort, config.internalHost);
      innerServer.on("error", runtimeFailure);
    }
    edgeServer = createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url ?? "/", "http://community.local");
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (!shouldHandleApiPath(url.pathname)) {
        serveStatic(req, res, url.pathname, paths);
        return;
      }
      let browser;
      try {
        browser = validateCommunityBrowserRequest(req.headers);
      } catch {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end('{"error":"community_loopback_request_forbidden"}');
        return;
      }
      if (config.mode === COMMUNITY_HOST_MODES.oci) {
        proxyCommunityRequest(req, res, config, browser.browserOriginPresent);
      } else {
        applyDirectRequestHeaders(
          req,
          sanitizedRequestHeaders(req.headers, config, browser.browserOriginPresent),
        );
        applyDirectResponsePolicy(res);
        try {
          handler(req, res);
        } catch {
          if (!res.headersSent) {
            res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
            res.end('{"error":"community_server_failure"}');
          } else {
            res.destroy();
          }
        }
      }
    });
    edgeSockets = trackServerSockets(edgeServer);
    await listen(edgeServer, config.edgePort, config.edgeHost);
    edgeServer.on("error", runtimeFailure);
    process.stderr.write(`[aops-community] Cockpit + API listening on ${config.publicOrigin}\n`);
    return Object.freeze({ config, shutdown });
  } catch (error) {
    shutdown();
    throw error;
  }
}

const isMain = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCommunityHost({
    mode: COMMUNITY_HOST_MODES.native,
    edgeHost: NATIVE_EDGE_HOST,
    edgePort: process.env.COMMUNITY_PORT || DEFAULT_EDGE_PORT,
  }).catch((error) => {
    process.stderr.write(`[aops-community] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
