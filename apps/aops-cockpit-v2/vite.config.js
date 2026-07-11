import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appNodeModules = path.resolve(__dirname, "node_modules");
const DEFAULT_API_PROXY_TARGET = "http://127.0.0.1:5900";

function isLoopbackHostname(value) {
  const hostname = value.toLowerCase();
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  return octets[0] === 127 && octets.every((octet) => octet >= 0 && octet <= 255);
}

export function resolveCommunityApiProxyTarget(value = process.env.AOPS_COCKPIT_V2_API_PROXY_TARGET) {
  const candidate = typeof value === "string" && value.length
    ? value
    : DEFAULT_API_PROXY_TARGET;
  const hasAmbiguousRawCharacter = [...candidate].some((character) => {
    const code = character.charCodeAt(0);
    return code === 0x5c || code <= 0x20 || code === 0x7f || character.trim() === "";
  });
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("community_cockpit_invalid_api_proxy_target");
  }
  const normalizedCandidate = candidate.toLowerCase();
  const hasOriginScheme = normalizedCandidate.startsWith("http://") ||
    normalizedCandidate.startsWith("https://");
  const authorityStart = candidate.indexOf("://") + 3;
  const tailOffset = candidate.slice(authorityStart).search(/[/?#]/);
  const authorityTail = tailOffset < 0
    ? ""
    : candidate.slice(authorityStart + tailOffset);
  if (
    hasAmbiguousRawCharacter ||
    !hasOriginScheme ||
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    (authorityTail !== "" && authorityTail !== "/") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !isLoopbackHostname(parsed.hostname)
  ) {
    throw new Error("community_cockpit_loopback_api_proxy_target_required");
  }
  return parsed.origin;
}

const apiProxyTarget = resolveCommunityApiProxyTarget();
const createApiProxy = () => ({
  "/api": {
    target: apiProxyTarget,
    changeOrigin: true
  }
});

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 800,
    sourcemap: false,
    manifest: true
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: /^react$/,
        replacement: path.resolve(appNodeModules, "react/index.js")
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: path.resolve(appNodeModules, "react/jsx-runtime.js")
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: path.resolve(appNodeModules, "react/jsx-dev-runtime.js")
      },
      {
        find: /^react-dom$/,
        replacement: path.resolve(appNodeModules, "react-dom/index.js")
      },
      {
        find: /^react-dom\/client$/,
        replacement: path.resolve(appNodeModules, "react-dom/client.js")
      }
    ]
  },
  server: {
    host: "127.0.0.1",
    port: 5922,
    strictPort: true,
    proxy: createApiProxy()
  },
  preview: {
    host: "127.0.0.1",
    port: 5922,
    strictPort: true,
    proxy: createApiProxy()
  }
});
