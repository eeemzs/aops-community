#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const targets = process.argv.slice(2);

for (const target of targets) {
  const normalized = String(target || "").trim();
  if (!normalized) continue;
  const absolutePath = path.resolve(process.cwd(), normalized);
  fs.rmSync(absolutePath, { recursive: true, force: true });
}
