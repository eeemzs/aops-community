#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { codepointCompare } from './community-codepoint-compare.mjs';

const HASH = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_SURFACES = Object.freeze(['image-cli-prod-deploy', 'server-prod-deploy']);

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function sha256(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => codepointCompare(left, right))
    .map(([key, nested]) => [key, stable(nested)]));
}

function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function readPlainFile(filePath, code) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) fail(`${code}_absolute_required`);
  const absolute = path.resolve(filePath);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || path.resolve(realpathSync(absolute)) !== absolute) fail(`${code}_unsafe`);
  return readFileSync(absolute, 'utf8');
}

function parseJson(content, code) {
  let value;
  try { value = JSON.parse(content); } catch { fail(`${code}_json_invalid`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${code}_shape_invalid`);
  return value;
}

function validateRuntimeInventory(value, { lockSha256, platform }) {
  if (
    value?.schemaVersion !== 1 || value.status !== 'community-runtime-deploy-inventory-valid' ||
    value.platform !== platform || value.lockSha256 !== lockSha256 ||
    !REQUIRED_SURFACES.includes(value.surface) || !HASH.test(String(value.inventorySha256)) ||
    !HASH.test(String(value.packageMapProjectionSha256))
  ) fail('community_product_payload_runtime_inventory_invalid', String(value?.surface ?? 'missing'));
  const unsealed = { ...value };
  delete unsealed.inventorySha256;
  if (sha256(JSON.stringify(stable(unsealed))) !== value.inventorySha256) {
    fail('community_product_payload_runtime_inventory_seal_invalid', value.surface);
  }
  return value;
}

export function verifyCommunityProductPayload({
  lockText,
  productInventoryContent,
  runtimeInventories,
  cockpitInventoryContent,
  platform,
} = {}) {
  if (typeof lockText !== 'string' || !/^lockfileVersion:\s*['"]?9\.0['"]?\s*$/m.test(lockText)) {
    fail('community_product_payload_lockfile_invalid');
  }
  if (!['linux/amd64', 'linux/arm64'].includes(platform)) fail('community_product_payload_platform_invalid');
  const lockSha256 = sha256(lockText);
  const product = parseJson(productInventoryContent, 'community_product_payload_inventory');
  if (
    product.schemaVersion !== 1 || product.status !== 'community-product-third-party-notices-ready' ||
    product.lockSha256 !== lockSha256 || !Array.isArray(product.runtimeSurfaces) ||
    product.runtimeSurfaces.length !== 4 || !Array.isArray(product.platforms) ||
    JSON.stringify(product.platforms) !== JSON.stringify(['linux/amd64', 'linux/arm64']) ||
    product.cockpit?.surface !== 'cockpit-vite-bundle' || !HASH.test(String(product.cockpit.moduleInventorySha256))
  ) fail('community_product_payload_inventory_invalid');
  if (!Array.isArray(runtimeInventories) || runtimeInventories.length !== 2) {
    fail('community_product_payload_runtime_matrix_incomplete');
  }
  const expected = new Map(product.runtimeSurfaces.map((entry) => [`${entry.surface}:${entry.platform}`, entry]));
  if (expected.size !== 4) fail('community_product_payload_expected_runtime_matrix_invalid');
  const seen = new Set();
  const runtimeProof = runtimeInventories.map((value) => {
    const actual = validateRuntimeInventory(value, { lockSha256, platform });
    if (seen.has(actual.surface)) fail('community_product_payload_runtime_duplicate', actual.surface);
    seen.add(actual.surface);
    const pinned = expected.get(`${actual.surface}:${platform}`);
    if (
      !pinned || pinned.runtimeInventorySha256 !== actual.inventorySha256 ||
      pinned.packageMapProjectionSha256 !== actual.packageMapProjectionSha256 ||
      pinned.importerKey !== actual.importerKey
    ) fail('community_product_payload_runtime_drift', actual.surface);
    return {
      surface: actual.surface,
      inventorySha256: actual.inventorySha256,
      packageMapProjectionSha256: actual.packageMapProjectionSha256,
    };
  }).sort((left, right) => codepointCompare(left.surface, right.surface));
  if (JSON.stringify(runtimeProof.map((entry) => entry.surface)) !== JSON.stringify(REQUIRED_SURFACES)) {
    fail('community_product_payload_runtime_matrix_incomplete');
  }
  const cockpit = parseJson(cockpitInventoryContent, 'community_product_payload_cockpit_inventory');
  if (
    cockpit.schemaVersion !== 1 || cockpit.status !== 'community-vite-runtime-module-inventory-ready' ||
    !Array.isArray(cockpit.outputs) || cockpit.outputCount !== cockpit.outputs.length ||
    stableJson(cockpit) !== cockpitInventoryContent
  ) fail('community_product_payload_cockpit_inventory_invalid');
  const cockpitSha256 = sha256(cockpitInventoryContent);
  if (cockpitSha256 !== product.cockpit.moduleInventorySha256) {
    fail('community_product_payload_cockpit_inventory_drift');
  }
  return {
    schemaVersion: 1,
    status: 'community-product-payload-evidence-valid',
    platform,
    lockSha256,
    productInventorySha256: sha256(productInventoryContent),
    cockpitInventorySha256: cockpitSha256,
    runtimeProof,
  };
}

export function parseCommunityProductPayloadGateArgs(argv) {
  if (!Array.isArray(argv)) fail('community_product_payload_gate_arguments_invalid');
  const singles = new Set(['--lockfile', '--product-inventory', '--cockpit-inventory', '--platform']);
  const options = { runtimeInventory: [] };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!singles.has(flag) && flag !== '--runtime-inventory') {
      fail('community_product_payload_gate_unknown_option', String(flag));
    }
    if (singles.has(flag) && seen.has(flag)) fail('community_product_payload_gate_duplicate_option', flag);
    seen.add(flag);
    const value = argv[index + 1];
    if (typeof value !== 'string' || !value || value.startsWith('--')) {
      fail('community_product_payload_gate_option_value_missing', flag);
    }
    if (flag === '--runtime-inventory') options.runtimeInventory.push(value);
    else options[flag.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  for (const required of ['lockfile', 'productInventory', 'cockpitInventory', 'platform']) {
    if (!options[required]) fail('community_product_payload_gate_option_required', required);
  }
  if (options.runtimeInventory.length !== 2) fail('community_product_payload_runtime_matrix_incomplete');
  return options;
}

async function main(argv) {
  try {
    const options = parseCommunityProductPayloadGateArgs(argv);
    const result = verifyCommunityProductPayload({
      lockText: readPlainFile(path.resolve(options.lockfile), 'community_product_payload_gate_lockfile'),
      productInventoryContent: readPlainFile(path.resolve(options.productInventory), 'community_product_payload_gate_inventory'),
      runtimeInventories: options.runtimeInventory.map((filePath) => parseJson(
        readPlainFile(path.resolve(filePath), 'community_product_payload_gate_runtime_inventory'),
        'community_product_payload_gate_runtime_inventory',
      )),
      cockpitInventoryContent: readPlainFile(path.resolve(options.cockpitInventory), 'community_product_payload_gate_cockpit_inventory'),
      platform: options.platform,
    });
    process.stdout.write(`${JSON.stringify(stable(result), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[community-product-payload-gate] ${error instanceof Error ? error.message : 'unexpected_failure'}\n`);
    process.exitCode = 1;
  }
}

const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main(process.argv.slice(2));
