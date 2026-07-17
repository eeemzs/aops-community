import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  COMMUNITY_HOST_MODES,
  runCommunityHost,
} from "../../apps/aops-server/scripts/community-host.mjs";

const SERVER_INIT = path.resolve(import.meta.dirname, "../../apps/aops-server/scripts/init-community-pg.mjs");

export async function initializeCommunityContainerDatabase(env = process.env, timeoutMs = 120_000) {
  const child = spawn(process.execPath, [SERVER_INIT], {
    cwd: path.resolve(path.dirname(SERVER_INIT), ".."),
    env,
    stdio: "inherit",
  });
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      finish(() => reject(new Error("community_pg_init_timeout")));
    }, timeoutMs);
    timer.unref();
    child.once("error", () => finish(() => reject(new Error("community_pg_init_spawn_failed"))));
    child.once("exit", (code, signal) => finish(() => {
      if (code === 0) resolve();
      else reject(new Error(`community_pg_init_failed:${code}:${signal}`));
    }));
  });
}

export async function runCommunityContainer(env = process.env) {
  if (env !== process.env) throw new Error("community_container_process_env_required");
  await initializeCommunityContainerDatabase(env);
  return runCommunityHost({
    mode: COMMUNITY_HOST_MODES.oci,
    edgeHost: "0.0.0.0",
    edgePort: 5900,
    publicPort: env.AOPS_PUBLIC_PORT,
    internalHost: "127.0.0.1",
    internalPort: 5901,
  }, env);
}

const isMain = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCommunityContainer().catch((error) => {
    process.stderr.write(`[aops-community] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
