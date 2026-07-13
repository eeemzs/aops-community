#!/usr/bin/env node

import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { codepointCompare } from './community-codepoint-compare.mjs';
import { inspectCommunityRuntimeDeployInventory } from './community-runtime-deploy-inventory.mjs';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => codepointCompare(left, right))
    .map(([key, nested]) => [key, stable(nested)]));
}

function readPlainFile(filePath, code) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) fail(`${code}_absolute_required`);
  const absolute = path.resolve(filePath);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute) fail(`${code}_unsafe`);
  return readFileSync(absolute, 'utf8');
}

export function parseCommunityRuntimeDeployInventoryArgs(argv) {
  if (!Array.isArray(argv)) fail('community_runtime_inventory_cli_arguments_invalid');
  const options = {};
  const allowed = new Set([
    '--tree-root', '--deploy-root', '--lockfile', '--importer-key', '--platform', '--surface',
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail('community_runtime_inventory_cli_unknown_option', String(flag));
    if (seen.has(flag)) fail('community_runtime_inventory_cli_duplicate_option', flag);
    seen.add(flag);
    const value = argv[index + 1];
    if (typeof value !== 'string' || !value || value.startsWith('--')) {
      fail('community_runtime_inventory_cli_option_value_missing', flag);
    }
    options[flag.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  for (const required of ['treeRoot', 'deployRoot', 'lockfile', 'importerKey', 'platform', 'surface']) {
    if (!options[required]) fail('community_runtime_inventory_cli_option_required', required);
  }
  return options;
}

export function inspectCommunityRuntimeDeployInventoryFromFiles(options) {
  const treeRoot = path.resolve(options.treeRoot);
  const deployRoot = path.resolve(options.deployRoot);
  const lockText = readPlainFile(path.resolve(options.lockfile), 'community_runtime_inventory_cli_lockfile');
  return inspectCommunityRuntimeDeployInventory({
    treeRoot,
    deployRoot,
    lockText,
    importerKey: options.importerKey,
    platform: options.platform,
    surface: options.surface,
  });
}

async function main(argv) {
  try {
    const options = parseCommunityRuntimeDeployInventoryArgs(argv);
    const result = inspectCommunityRuntimeDeployInventoryFromFiles(options);
    process.stdout.write(`${JSON.stringify(stable(result), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[community-runtime-deploy-inventory] ${error instanceof Error ? error.message : 'unexpected_failure'}\n`);
    process.exitCode = 1;
  }
}

const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main(process.argv.slice(2));
