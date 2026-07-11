import { randomBytes } from "node:crypto";
import { closeSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const target = path.resolve(process.cwd(), ".env");
const password = randomBytes(32).toString("base64url");
const chatv3ServerKey = randomBytes(32).toString("base64url");
const content = [
  "# Generated locally by deploy/community/init-env.mjs; do not commit.",
  "AOPS_POSTGRES_DB=aops",
  "AOPS_POSTGRES_USER=aops",
  `AOPS_POSTGRES_PASSWORD=${password}`,
  "CHATV3_SERVER_KEY_ID=k1",
  `CHATV3_SERVER_KEY_SECRET=${chatv3ServerKey}`,
  "AOPS_PORT=5900",
  "",
].join("\n");

export function initializeCommunityEnvironment() {
  let descriptor;
  try {
    descriptor = openSync(target, "wx", 0o600);
    writeFileSync(descriptor, content, { encoding: "utf8" });
    closeSync(descriptor);
  } catch (error) {
    if (error?.code === "EEXIST") return { status: "community-env-existing", path: target, created: false };
    throw error;
  }
  return { status: "community-env-created", path: target, created: true };
}

const isMain = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.stdout.write(JSON.stringify(initializeCommunityEnvironment()) + "\n");
