import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { codepointCompare } from './community-codepoint-compare.mjs';

export const COMMUNITY_RUNTIME_TARGETS = Object.freeze({
  'linux/amd64': Object.freeze({ platform: 'linux/amd64', os: 'linux', cpu: 'x64', libc: 'glibc' }),
  'linux/arm64': Object.freeze({ platform: 'linux/arm64', os: 'linux', cpu: 'arm64', libc: 'glibc' }),
});

const SHA512_SRI = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const toPosix = (value) => String(value).replace(/\\/g, '/');
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function validSha512Sri(value) {
  if (!SHA512_SRI.test(String(value))) return false;
  try {
    return Buffer.from(String(value).slice('sha512-'.length), 'base64').byteLength === 64;
  } catch {
    return false;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => codepointCompare(left, right))
    .map(([key, nested]) => [key, stable(nested)]));
}

function unquote(value) {
  return String(value).trim().replace(/^['"]|['"]$/g, '');
}

function sectionLines(lines, section) {
  const start = lines.findIndex((line) => line === `${section}:`);
  if (start < 0) return [];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function inlineList(value) {
  const text = String(value).trim();
  if (!text.startsWith('[') || !text.endsWith(']')) fail('community_runtime_lock_constraint_invalid', text);
  const body = text.slice(1, -1).trim();
  return body ? body.split(',').map((entry) => unquote(entry)).filter(Boolean) : [];
}

export function parseCommunityRuntimeLockfile(text) {
  const lines = String(text).split(/\r?\n/);
  const importers = {};
  let importer = null;
  let importerField = null;
  let dependency = null;
  for (const line of sectionLines(lines, 'importers')) {
    let match;
    if ((match = line.match(/^ {2}(\S.*?):\s*(?:\{\})?\s*$/))) {
      importer = unquote(match[1]);
      importers[importer] = { dependencies: {}, optionalDependencies: {}, devDependencies: {} };
      importerField = null;
      dependency = null;
    } else if ((match = line.match(/^ {4}(dependencies|optionalDependencies|devDependencies):\s*$/))) {
      importerField = match[1];
      dependency = null;
    } else if ((match = line.match(/^ {6}(\S.*?):\s*$/)) && importer && importerField) {
      dependency = unquote(match[1]);
    } else if ((match = line.match(/^ {8}version:\s*(.+?)\s*$/)) && importer && importerField && dependency) {
      importers[importer][importerField][dependency] = unquote(match[1]);
      dependency = null;
    }
  }

  const packages = {};
  let packageKey = null;
  let packageField = null;
  for (const line of sectionLines(lines, 'packages')) {
    let match;
    if ((match = line.match(/^ {2}(\S.*?):\s*(?:\{\})?\s*$/))) {
      packageKey = unquote(match[1]);
      packages[packageKey] = { integrity: null, os: [], cpu: [], libc: [] };
      packageField = null;
    } else if ((match = line.match(/^ {4}resolution:\s*\{(.*)\}\s*$/)) && packageKey) {
      const integrity = /(?:^|,)\s*integrity:\s*([^,}]+)/.exec(match[1])?.[1];
      if (integrity) packages[packageKey].integrity = unquote(integrity);
    } else if ((match = line.match(/^ {4}resolution:\s*$/)) && packageKey) {
      packageField = 'resolution';
    } else if ((match = line.match(/^ {6}integrity:\s*(.+?)\s*$/)) && packageKey && packageField === 'resolution') {
      packages[packageKey].integrity = unquote(match[1]);
    } else if ((match = line.match(/^ {4}(os|cpu|libc):\s*(\[.*\])\s*$/)) && packageKey) {
      packages[packageKey][match[1]] = inlineList(match[2]);
      packageField = null;
    } else if (/^ {4}\S/.test(line)) {
      packageField = null;
    }
  }

  const snapshots = {};
  let snapshot = null;
  let snapshotField = null;
  for (const line of sectionLines(lines, 'snapshots')) {
    let match;
    if ((match = line.match(/^ {2}(\S.*?):\s*(?:\{\})?\s*$/))) {
      snapshot = unquote(match[1]);
      snapshots[snapshot] = { dependencies: {}, optionalDependencies: {} };
      snapshotField = null;
    } else if ((match = line.match(/^ {4}(dependencies|optionalDependencies):\s*$/))) {
      snapshotField = match[1];
    } else if ((match = line.match(/^ {6}(\S.*?):\s*(.+?)\s*$/)) && snapshot && snapshotField) {
      snapshots[snapshot][snapshotField][unquote(match[1])] = unquote(match[2]);
    } else if (/^ {4}\S/.test(line)) {
      snapshotField = null;
    }
  }

  if (Object.keys(importers).length === 0) fail('community_runtime_lock_importers_missing');
  if (Object.keys(packages).length === 0) fail('community_runtime_lock_packages_missing');
  if (Object.keys(snapshots).length === 0) fail('community_runtime_lock_snapshots_missing');
  return { importers, packages, snapshots };
}

export function resolveCommunityRuntimeTarget(platform) {
  const target = COMMUNITY_RUNTIME_TARGETS[platform];
  if (!target) fail('community_runtime_platform_unsupported', String(platform));
  return target;
}

function matchesConstraint(values, actual) {
  if (!values?.length) return true;
  const denied = new Set(values.filter((value) => value.startsWith('!')).map((value) => value.slice(1)));
  if (denied.has(actual)) return false;
  const allowed = values.filter((value) => !value.startsWith('!'));
  return allowed.length === 0 || allowed.includes(actual);
}

export function packageSupportsCommunityRuntime(metadata, platform) {
  const target = typeof platform === 'string' ? resolveCommunityRuntimeTarget(platform) : platform;
  return matchesConstraint(metadata?.os, target.os)
    && matchesConstraint(metadata?.cpu, target.cpu)
    && matchesConstraint(metadata?.libc, target.libc);
}

function peerSplit(locator) {
  const peerIndex = String(locator).indexOf('(');
  return peerIndex < 0
    ? { baseLocator: String(locator), peerContext: '' }
    : { baseLocator: String(locator).slice(0, peerIndex), peerContext: String(locator).slice(peerIndex) };
}

function locatorIdentity(locator) {
  const { baseLocator, peerContext } = peerSplit(locator);
  const slash = baseLocator.startsWith('@') ? baseLocator.indexOf('/') : -1;
  const separator = baseLocator.startsWith('@')
    ? baseLocator.indexOf('@', slash + 1)
    : baseLocator.indexOf('@');
  if (separator <= 0 || separator === baseLocator.length - 1) {
    fail('community_runtime_locator_invalid', locator);
  }
  const name = baseLocator.slice(0, separator);
  const version = baseLocator.slice(separator + 1);
  const source = version.startsWith('file:');
  if (!source && !SEMVER.test(version)) fail('community_runtime_registry_version_invalid', locator);
  return {
    locator,
    baseLocator,
    peerContext,
    name,
    version: source ? null : version,
    source,
    sourceSpec: source ? version.slice('file:'.length) : null,
  };
}

function within(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function requirePlainDirectory(directory, code) {
  if (!existsSync(directory)) fail(code, directory);
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code, directory);
  return realpathSync.native(directory);
}

function requirePlainFile(filePath, code) {
  if (!existsSync(filePath)) fail(code, filePath);
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code, filePath);
  return filePath;
}

function readJson(filePath, code) {
  try {
    return JSON.parse(readFileSync(requirePlainFile(filePath, code), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) fail(code, filePath);
    throw error;
  }
}

function normalizeWorkspacePath(treeRoot, candidate, code) {
  const root = requirePlainDirectory(treeRoot, `${code}_tree_root_invalid`);
  const absolute = path.resolve(candidate);
  if (!within(root, absolute)) fail(code, absolute);
  const relative = toPosix(path.relative(root, absolute)) || '.';
  if (relative.split('/').includes('..')) fail(code, absolute);
  return relative;
}

function absoluteFileLocatorSource(identity, treeRoot, lock) {
  if (!identity.source || !identity.sourceSpec?.startsWith('//')) return null;
  let absolute;
  try {
    absolute = fileURLToPath(`file:${identity.sourceSpec}`);
  } catch {
    fail('community_runtime_package_map_file_locator_invalid', identity.locator);
  }
  const sourcePath = normalizeWorkspacePath(
    treeRoot,
    absolute,
    'community_runtime_package_map_workspace_escape',
  );
  const sourceRoot = requirePlainDirectory(
    path.join(treeRoot, ...sourcePath.split('/')),
    'community_runtime_package_map_workspace_source_invalid',
  );
  const manifest = readJson(
    path.join(sourceRoot, 'package.json'),
    'community_runtime_package_map_workspace_manifest_invalid',
  );
  if (manifest.name !== identity.name || typeof manifest.version !== 'string' || !manifest.version) {
    fail('community_runtime_package_map_workspace_identity_mismatch', identity.locator);
  }

  if (lock.importers[sourcePath]) {
    return { locator: sourcePath, sourcePath, name: identity.name, version: manifest.version };
  }
  const sourceLocator = `${identity.name}@file:${sourcePath}${identity.peerContext}`;
  if (lock.packages[sourceLocator]
    || lock.packages[peerSplit(sourceLocator).baseLocator]
    || lock.snapshots[sourceLocator]
    || lock.snapshots[peerSplit(sourceLocator).baseLocator]) {
    return { locator: sourceLocator, sourcePath, name: identity.name, version: manifest.version };
  }
  fail('community_runtime_package_map_workspace_lock_identity_missing', identity.locator);
}

function normalizePackageMapLocator({ rawLocator, treeRoot, lock, importerKey }) {
  if (rawLocator === '.') {
    return { locator: importerKey, sourcePath: importerKey, root: true };
  }
  const identity = locatorIdentity(rawLocator);
  const absoluteSource = absoluteFileLocatorSource(identity, treeRoot, lock);
  return absoluteSource
    ? { ...absoluteSource, root: false }
    : { locator: rawLocator, sourcePath: null, root: false };
}

function normalizeMapUrl({ treeRoot, deployRoot, mapRoot, rawUrl, locator, root = false }) {
  if (typeof rawUrl !== 'string' || !rawUrl) fail('community_runtime_package_map_url_invalid', locator);
  if (rawUrl.startsWith('file:')) {
    let absolute;
    try {
      absolute = fileURLToPath(rawUrl);
    } catch {
      fail('community_runtime_package_map_file_url_invalid', locator);
    }
    const sourcePath = normalizeWorkspacePath(treeRoot, absolute, 'community_runtime_package_map_workspace_escape');
    return { kind: 'workspace', ref: `workspace:${sourcePath}`, sourcePath, absolute };
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawUrl)) {
    fail('community_runtime_package_map_url_scheme_invalid', `${locator}:${rawUrl}`);
  }
  const candidate = path.resolve(mapRoot, rawUrl);
  if (root) {
    if (candidate !== path.resolve(deployRoot)) {
      fail('community_runtime_package_map_root_path_invalid', `${locator}:${rawUrl}`);
    }
    return {
      kind: 'workspace',
      ref: `workspace:${locator}`,
      sourcePath: locator,
      absolute: candidate,
    };
  }
  const nodeModulesRoot = path.join(path.resolve(deployRoot), 'node_modules');
  if (!within(nodeModulesRoot, candidate) || candidate === nodeModulesRoot) {
    fail('community_runtime_package_map_path_escape', `${locator}:${rawUrl}`);
  }
  return {
    kind: 'deploy',
    ref: toPosix(path.relative(path.resolve(deployRoot), candidate)),
    sourcePath: null,
    absolute: candidate,
  };
}

function canonicalPackageMap({ treeRoot, deployRoot, packageMapPath, lock, importerKey }) {
  const mapRoot = path.dirname(packageMapPath);
  const raw = readJson(packageMapPath, 'community_runtime_package_map_invalid');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.packages || typeof raw.packages !== 'object') {
    fail('community_runtime_package_map_shape_invalid');
  }
  const rawLocatorToCanonical = new Map();
  for (const rawLocator of Object.keys(raw.packages).sort(codepointCompare)) {
    const normalized = normalizePackageMapLocator({ rawLocator, treeRoot, lock, importerKey });
    if ([...rawLocatorToCanonical.values()].some((entry) => entry.locator === normalized.locator)) {
      fail('community_runtime_package_map_locator_ambiguous', normalized.locator);
    }
    rawLocatorToCanonical.set(rawLocator, normalized);
  }

  const entries = new Map();
  const physicalRefToLocator = new Map();
  for (const rawLocator of Object.keys(raw.packages).sort(codepointCompare)) {
    const locatorIdentity = rawLocatorToCanonical.get(rawLocator);
    const locator = locatorIdentity.locator;
    const entry = raw.packages[rawLocator];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.dependencies !== 'object') {
      fail('community_runtime_package_map_entry_invalid', locator);
    }
    const normalized = normalizeMapUrl({
      treeRoot,
      deployRoot,
      mapRoot,
      rawUrl: entry.url,
      locator,
      root: locatorIdentity.root,
    });
    const dependencies = Object.fromEntries(Object.entries(entry.dependencies ?? {})
      .map(([name, target]) => {
        if (typeof target !== 'string' || !target) fail('community_runtime_package_map_dependency_invalid', `${locator}:${name}`);
        const normalizedTarget = rawLocatorToCanonical.get(target);
        if (!normalizedTarget) fail('community_runtime_package_map_dependency_target_missing', `${locator}:${name}:${target}`);
        return [name, normalizedTarget.locator];
      })
      .sort(([left], [right]) => codepointCompare(left, right)));
    const record = {
      locator,
      url: normalized.ref,
      kind: normalized.kind,
      sourcePath: locatorIdentity.sourcePath ?? normalized.sourcePath,
      dependencies,
    };
    entries.set(locator, { ...record, absolute: normalized.absolute });
    if (normalized.kind === 'deploy') {
      if (physicalRefToLocator.has(normalized.ref)) {
        fail('community_runtime_package_map_physical_ref_ambiguous', normalized.ref);
      }
      physicalRefToLocator.set(normalized.ref, locator);
    }
  }
  return {
    entries,
    physicalRefToLocator,
  };
}

function projectedPackageMapDigest(packageMap, importerKey, expected) {
  const included = new Set([importerKey, ...expected.keys()]);
  const projection = [...included].sort(codepointCompare).map((locator) => {
    const entry = packageMap.entries.get(locator);
    if (!entry) fail('community_runtime_package_map_projection_locator_missing', locator);
    const dependencies = Object.fromEntries(Object.entries(entry.dependencies)
      .filter(([, target]) => target === locator || included.has(target))
      .sort(([left], [right]) => codepointCompare(left, right)));
    return {
      locator,
      url: entry.url,
      kind: entry.kind,
      sourcePath: entry.sourcePath,
      dependencies,
    };
  });
  return sha256(JSON.stringify(stable(projection)));
}

function validateInternalSymlink(linkPath, allowedRoots) {
  let target;
  try {
    target = realpathSync.native(linkPath);
  } catch {
    fail('community_runtime_deploy_symlink_broken', linkPath);
  }
  if (!allowedRoots.some((root) => within(root, target))) {
    fail('community_runtime_deploy_symlink_escape', linkPath);
  }
}

function physicalPackages(deployRoot, treeRoot) {
  const root = requirePlainDirectory(deployRoot, 'community_runtime_deploy_root_invalid');
  const nodeModulesRoot = requirePlainDirectory(path.join(root, 'node_modules'), 'community_runtime_node_modules_invalid');
  const virtualStoreRoot = requirePlainDirectory(path.join(nodeModulesRoot, '.pnpm'), 'community_runtime_virtual_store_invalid');
  const packages = [];

  function inspectPackageParent(parent) {
    for (const entry of readdirSync(parent, { withFileTypes: true }).sort((left, right) => codepointCompare(left.name, right.name))) {
      if (entry.name === '.bin') continue;
      const absolute = path.join(parent, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        validateInternalSymlink(absolute, [root, treeRoot]);
        continue;
      }
      if (!stat.isDirectory()) fail('community_runtime_deploy_special_entry', absolute);
      if (entry.name.startsWith('@')) {
        inspectPackageParent(absolute);
        continue;
      }
      const manifestPath = path.join(absolute, 'package.json');
      if (!existsSync(manifestPath)) fail('community_runtime_deploy_package_manifest_missing', absolute);
      const manifest = readJson(manifestPath, 'community_runtime_deploy_package_manifest_invalid');
      if (typeof manifest.name !== 'string' || !manifest.name || typeof manifest.version !== 'string' || !manifest.version) {
        fail('community_runtime_deploy_package_identity_invalid', absolute);
      }
      const real = realpathSync.native(absolute);
      if (!within(virtualStoreRoot, real)) fail('community_runtime_deploy_package_escape', absolute);
      packages.push({
        name: manifest.name,
        version: manifest.version,
        physicalRef: toPosix(path.relative(root, absolute)),
      });
    }
  }

  for (const entry of readdirSync(virtualStoreRoot, { withFileTypes: true }).sort((left, right) => codepointCompare(left.name, right.name))) {
    const absolute = path.join(virtualStoreRoot, entry.name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail('community_runtime_virtual_store_symlink_forbidden', absolute);
    if (!stat.isDirectory()) {
      if (entry.name === 'lock.yaml') continue;
      fail('community_runtime_virtual_store_special_entry', absolute);
    }
    if (entry.name === 'node_modules') {
      inspectPackageParent(absolute);
      continue;
    }
    const nested = path.join(absolute, 'node_modules');
    if (!existsSync(nested)) fail('community_runtime_virtual_store_node_modules_missing', absolute);
    requirePlainDirectory(nested, 'community_runtime_virtual_store_node_modules_invalid');
    inspectPackageParent(nested);
  }
  return packages.sort((left, right) => codepointCompare(left.physicalRef, right.physicalRef));
}

function packageMetadata(lock, locator) {
  const { baseLocator } = peerSplit(locator);
  return lock.packages[locator] ?? lock.packages[baseLocator] ?? null;
}

function snapshotRecord(lock, locator) {
  return lock.snapshots[locator] ?? lock.snapshots[peerSplit(locator).baseLocator] ?? {
    dependencies: {},
    optionalDependencies: {},
  };
}

function validateSourcePath(treeRoot, sourceSpec, locator) {
  const normalized = toPosix(sourceSpec).replace(/^\.\//, '');
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    fail('community_runtime_source_path_invalid', locator);
  }
  const absolute = path.resolve(treeRoot, ...normalized.split('/'));
  return normalizeWorkspacePath(treeRoot, absolute, 'community_runtime_source_path_escape');
}

function prodClosure({ lock, packageMap, importerKey, platform, treeRoot }) {
  const importer = lock.importers[importerKey];
  if (!importer) fail('community_runtime_importer_missing', importerKey);
  const rootEntry = packageMap.entries.get(importerKey);
  if (!rootEntry || rootEntry.kind !== 'workspace') fail('community_runtime_importer_map_entry_missing', importerKey);
  const allowedRootNames = new Set([
    ...Object.keys(importer.dependencies),
    ...Object.keys(importer.optionalDependencies),
  ]);
  const optionalRootNames = new Set(Object.keys(importer.optionalDependencies));
  const rootManifest = readJson(path.join(treeRoot, importerKey, 'package.json'), 'community_runtime_importer_manifest_invalid');
  const queue = [];
  for (const [name, locator] of Object.entries(rootEntry.dependencies)) {
    if (locator === importerKey || (name === rootManifest.name && locator === importerKey)) continue;
    if (!allowedRootNames.has(name)) fail('community_runtime_package_map_nonprod_root_dependency', `${importerKey}:${name}`);
    queue.push({ locator, optional: optionalRootNames.has(name), parent: importerKey, dependencyName: name });
  }
  for (const name of allowedRootNames) {
    if (!Object.hasOwn(rootEntry.dependencies, name)) fail('community_runtime_package_map_root_dependency_missing', `${importerKey}:${name}`);
  }

  const expected = new Map();
  while (queue.length > 0) {
    const edge = queue.shift();
    if (expected.has(edge.locator)) continue;
    const mapEntry = packageMap.entries.get(edge.locator);
    if (!mapEntry) fail('community_runtime_package_map_locator_missing', edge.locator);

    if (lock.importers[edge.locator]) {
      if (mapEntry.kind !== 'deploy' || mapEntry.sourcePath !== edge.locator) {
        fail('community_runtime_source_importer_not_injected', edge.locator);
      }
      const sourceManifest = readJson(
        path.join(treeRoot, ...edge.locator.split('/'), 'package.json'),
        'community_runtime_source_manifest_invalid',
      );
      if (typeof sourceManifest.name !== 'string' || !sourceManifest.name
        || typeof sourceManifest.version !== 'string' || !sourceManifest.version) {
        fail('community_runtime_source_identity_mismatch', edge.locator);
      }
      expected.set(edge.locator, {
        locator: edge.locator,
        kind: 'source-importer',
        sourcePath: edge.locator,
        name: sourceManifest.name,
        version: sourceManifest.version,
        peerContext: '',
        integrity: null,
      });
      const linkedImporter = lock.importers[edge.locator];
      const allowed = new Set([...Object.keys(linkedImporter.dependencies), ...Object.keys(linkedImporter.optionalDependencies)]);
      const optional = new Set(Object.keys(linkedImporter.optionalDependencies));
      for (const [name, locator] of Object.entries(mapEntry.dependencies)) {
        if (locator === edge.locator) continue;
        if (!allowed.has(name)) fail('community_runtime_package_map_nonprod_link_dependency', `${edge.locator}:${name}`);
        queue.push({ locator, optional: optional.has(name), parent: edge.locator, dependencyName: name });
      }
      for (const name of allowed) {
        if (!Object.hasOwn(mapEntry.dependencies, name)) {
          fail('community_runtime_package_map_link_dependency_missing', `${edge.locator}:${name}`);
        }
      }
      continue;
    }

    const identity = locatorIdentity(edge.locator);
    const metadata = packageMetadata(lock, edge.locator);
    if (!metadata && !identity.source) fail('community_runtime_lock_package_metadata_missing', edge.locator);
    if (metadata && !packageSupportsCommunityRuntime(metadata, platform)) {
      if (!edge.optional) fail('community_runtime_required_package_platform_mismatch', `${edge.locator}:${platform.platform}`);
      continue;
    }
    const sourcePath = identity.source ? validateSourcePath(treeRoot, identity.sourceSpec, edge.locator) : null;
    let sourceVersion = null;
    if (sourcePath) {
      const sourceManifest = readJson(
        path.join(treeRoot, ...sourcePath.split('/'), 'package.json'),
        'community_runtime_source_manifest_invalid',
      );
      if (sourceManifest.name !== identity.name || typeof sourceManifest.version !== 'string' || !sourceManifest.version) {
        fail('community_runtime_source_identity_mismatch', edge.locator);
      }
      sourceVersion = sourceManifest.version;
    }
    if (!identity.source && !validSha512Sri(metadata.integrity)) {
      fail('community_runtime_registry_integrity_missing', edge.locator);
    }
    expected.set(edge.locator, {
      locator: edge.locator,
      baseLocator: identity.baseLocator,
      peerContext: identity.peerContext,
      kind: identity.source ? 'source' : 'registry',
      name: identity.name,
      version: identity.source ? sourceVersion : identity.version,
      sourcePath,
      integrity: identity.source ? null : metadata.integrity,
    });

    const snapshot = snapshotRecord(lock, edge.locator);
    const optionalNames = new Set(Object.keys(snapshot.optionalDependencies));
    for (const [name, locator] of Object.entries(mapEntry.dependencies)) {
      if (locator === edge.locator) continue;
      queue.push({ locator, optional: optionalNames.has(name), parent: edge.locator, dependencyName: name });
    }
  }
  return { expected, rootManifest, rootEntry };
}

export function inspectCommunityRuntimeDeployInventory({
  treeRoot,
  deployRoot,
  lockText,
  importerKey,
  platform,
  surface,
  packageMapPath = path.join(deployRoot ?? '', 'node_modules', '.package-map.json'),
} = {}) {
  if (!treeRoot || !path.isAbsolute(treeRoot)) fail('community_runtime_tree_root_absolute_required');
  if (!deployRoot || !path.isAbsolute(deployRoot)) fail('community_runtime_deploy_root_absolute_required');
  if (typeof importerKey !== 'string' || !importerKey) fail('community_runtime_importer_key_required');
  if (typeof surface !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(surface)) fail('community_runtime_surface_invalid');
  const target = resolveCommunityRuntimeTarget(platform);
  const tree = requirePlainDirectory(treeRoot, 'community_runtime_tree_root_invalid');
  const deploy = requirePlainDirectory(deployRoot, 'community_runtime_deploy_root_invalid');
  const lock = parseCommunityRuntimeLockfile(lockText);
  const packageMap = canonicalPackageMap({
    treeRoot: tree,
    deployRoot: deploy,
    packageMapPath,
    lock,
    importerKey,
  });
  const closure = prodClosure({ lock, packageMap, importerKey, platform: target, treeRoot: tree });
  const physical = physicalPackages(deploy, tree);
  const physicalByLocator = new Map();
  for (const entry of physical) {
    const locator = packageMap.physicalRefToLocator.get(entry.physicalRef);
    if (!locator) fail('community_runtime_physical_package_unmapped', entry.physicalRef);
    if (physicalByLocator.has(locator)) fail('community_runtime_physical_locator_duplicate', locator);
    const expected = closure.expected.get(locator);
    if (!expected) fail('community_runtime_physical_package_extra', locator);
    if (entry.name !== expected.name || entry.version !== expected.version) {
      fail('community_runtime_physical_package_identity_mismatch', `${locator}:${entry.name}@${entry.version}`);
    }
    physicalByLocator.set(locator, entry);
  }
  for (const [locator, expected] of closure.expected) {
    if (!physicalByLocator.has(locator)) fail('community_runtime_physical_package_missing', locator);
  }

  const deployManifest = readJson(path.join(deploy, 'package.json'), 'community_runtime_deploy_manifest_invalid');
  if (deployManifest.name !== closure.rootManifest.name || deployManifest.version !== closure.rootManifest.version) {
    fail('community_runtime_deploy_root_identity_mismatch');
  }
  const rootSource = {
    locator: importerKey,
    name: closure.rootManifest.name,
    version: closure.rootManifest.version,
    sourcePath: closure.rootEntry.sourcePath,
    physicalRef: '.',
    peerContext: '',
  };
  const registryRecords = [];
  const sourceRecords = [rootSource];
  for (const [locator, expected] of [...closure.expected.entries()].sort(([left], [right]) => codepointCompare(left, right))) {
    const physicalEntry = physicalByLocator.get(locator);
    const record = {
      locator,
      name: physicalEntry.name,
      version: physicalEntry.version,
      peerContext: expected.peerContext,
      physicalRef: physicalEntry.physicalRef,
    };
    if (expected.kind === 'registry') registryRecords.push({ ...record, integrity: expected.integrity });
    else sourceRecords.push({ ...record, sourcePath: expected.sourcePath });
  }
  registryRecords.sort((left, right) => codepointCompare(left.locator, right.locator));
  sourceRecords.sort((left, right) => codepointCompare(left.locator, right.locator));
  const result = {
    schemaVersion: 1,
    status: 'community-runtime-deploy-inventory-valid',
    surface,
    platform: target.platform,
    runtime: { os: target.os, cpu: target.cpu, libc: target.libc },
    importerKey,
    lockSha256: sha256(String(lockText)),
    packageMapProjectionSha256: projectedPackageMapDigest(packageMap, importerKey, closure.expected),
    physicalPackageCount: physical.length,
    locatorCount: registryRecords.length + sourceRecords.length,
    registryCount: registryRecords.length,
    sourceCount: sourceRecords.length,
    registryRecords,
    sourceRecords,
  };
  return { ...result, inventorySha256: sha256(JSON.stringify(stable(result))) };
}
