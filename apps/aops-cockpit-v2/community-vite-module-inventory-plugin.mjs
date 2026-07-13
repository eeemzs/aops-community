import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const INVENTORY_FILE = 'community.module-inventory.json';
const BUILD_TOOL_PACKAGES = new Set(['vite', 'rollup', 'esbuild', '@vitejs/plugin-react']);
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function canonicalRoot(root) {
  const resolved = path.resolve(root ?? '');
  if (!root || !existsSync(resolved)) fail('community_vite_inventory_root_missing', resolved);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('community_vite_inventory_root_invalid', resolved);
  return realpathSync(resolved);
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function safeOutputFileName(value, code = 'community_vite_inventory_output_name_invalid') {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) fail(code, String(value));
  return value;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function stripModuleQuery(id) {
  const query = id.indexOf('?');
  const hash = id.indexOf('#');
  const boundary = [query, hash].filter((index) => index >= 0).sort((left, right) => left - right)[0];
  return boundary === undefined ? id : id.slice(0, boundary);
}

function filesystemModulePath(root, moduleId, code) {
  let candidate = stripModuleQuery(moduleId);
  if (candidate.startsWith('file://')) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      fail(code, moduleId);
    }
  } else if (candidate.startsWith('/@fs/')) {
    candidate = candidate.slice('/@fs/'.length);
    if (process.platform !== 'win32') candidate = `/${candidate}`;
  }
  const lexical = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(root, ...candidate.replaceAll('\\', '/').split('/'));
  if (!isWithin(root, lexical)) fail(`${code}_escape`, moduleId);
  if (!existsSync(lexical)) fail(`${code}_missing`, moduleId);
  const stat = lstatSync(lexical);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${code}_invalid`, moduleId);
  const canonical = realpathSync(lexical);
  if (!isWithin(root, canonical)) fail(`${code}_escape`, moduleId);
  return canonical;
}

function readPackageManifest(root, filePath) {
  let cursor = path.dirname(filePath);
  while (true) {
    const manifestPath = path.join(cursor, 'package.json');
    if (existsSync(manifestPath)) {
      const stat = lstatSync(manifestPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        fail('community_vite_inventory_package_manifest_invalid', manifestPath);
      }
      const canonicalManifest = realpathSync(manifestPath);
      if (!isWithin(root, canonicalManifest)) {
        fail('community_vite_inventory_package_manifest_escape', manifestPath);
      }
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(canonicalManifest, 'utf8').replace(/^\uFEFF/, ''));
      } catch {
        fail('community_vite_inventory_package_manifest_invalid', manifestPath);
      }
      if (typeof manifest?.name === 'string' && typeof manifest?.version === 'string') {
        const name = manifest.name.trim();
        const version = manifest.version.trim();
        if (!name || !version || /[\u0000-\u001f\u007f\s]/.test(name) || /[\u0000-\u001f\u007f\s]/.test(version)) {
          fail('community_vite_inventory_package_identity_invalid', manifestPath);
        }
        return { name, version, packageRoot: path.dirname(canonicalManifest) };
      }
    }
    if (cursor === root) return null;
    const parent = path.dirname(cursor);
    if (parent === cursor || !isWithin(root, parent)) return null;
    cursor = parent;
  }
}

function isNodeModulesPath(filePath) {
  return filePath.split(path.sep).some((segment) => segment.toLowerCase() === 'node_modules');
}

function isBuildToolPackage(name) {
  return BUILD_TOOL_PACKAGES.has(name) || name.startsWith('@rollup/rollup-') || name.startsWith('@esbuild/');
}

function isFirstPartyPackage(name) {
  return name.startsWith('@aopslab/') || name.startsWith('@aops/');
}

function packageSource(root, filePath, kind) {
  const owner = readPackageManifest(root, filePath);
  if (!owner) fail('community_vite_inventory_package_owner_missing', filePath);
  const relative = toPosix(path.relative(owner.packageRoot, filePath));
  if (!relative || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    fail('community_vite_inventory_package_source_escape', filePath);
  }
  return {
    kind,
    name: owner.name,
    version: owner.version,
    ref: `npm:${owner.name}@${owner.version}/${relative}`,
  };
}

function firstPartySource(root, filePath, kind) {
  const relative = toPosix(path.relative(root, filePath));
  if (!relative || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    fail('community_vite_inventory_first_party_source_escape', filePath);
  }
  return { kind, ref: relative };
}

function virtualSource(root, moduleId) {
  const rootVariants = new Set([
    root,
    toPosix(root),
    root.replaceAll('/', '\\'),
  ]);
  let relocated = moduleId;
  for (const variant of rootVariants) relocated = relocated.replaceAll(variant, '<root>');
  return { kind: 'virtual-module', ref: `virtual:${sha256(relocated)}` };
}

function moduleSource(root, moduleId) {
  if (moduleId.startsWith('\0') || moduleId.startsWith('virtual:')) return virtualSource(root, moduleId);
  const filePath = filesystemModulePath(root, moduleId, 'community_vite_inventory_module');
  return isNodeModulesPath(filePath)
    ? packageSource(root, filePath, 'package-module')
    : firstPartySource(root, filePath, 'first-party-module');
}

function assetSource(root, assetSourceRoot, originalFileName) {
  if (typeof originalFileName !== 'string' || !originalFileName) {
    fail('community_vite_inventory_asset_source_invalid', String(originalFileName));
  }
  const raw = stripModuleQuery(originalFileName);
  const portable = raw.replaceAll('\\', '/');
  let lexical;
  if (raw.startsWith('file://')) {
    try {
      lexical = fileURLToPath(raw);
    } catch {
      fail('community_vite_inventory_asset_source_invalid', originalFileName);
    }
  } else {
    lexical = path.isAbsolute(raw)
      ? path.resolve(raw)
      : path.resolve(assetSourceRoot, ...portable.split('/'));
  }
  if (!isWithin(root, lexical)) fail('community_vite_inventory_asset_source_escape', originalFileName);
  if (!existsSync(lexical)) {
    if (portable.toLowerCase().includes('node_modules/') || portable.toLowerCase().includes('@fontsource/')) {
      fail('community_vite_inventory_asset_source_missing', originalFileName);
    }
    return null;
  }
  const stat = lstatSync(lexical);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('community_vite_inventory_asset_source_invalid', originalFileName);
  }
  const canonical = realpathSync(lexical);
  if (!isWithin(root, canonical)) fail('community_vite_inventory_asset_source_escape', originalFileName);
  return isNodeModulesPath(canonical)
    ? packageSource(root, canonical, 'package-asset')
    : firstPartySource(root, canonical, 'first-party-asset');
}

function sourceKey(source) {
  return `${source.kind}:${source.name ?? ''}:${source.version ?? ''}:${source.ref}`;
}

function uniqueSources(sources) {
  return [...new Map(sources.map((source) => [sourceKey(source), source])).values()]
    .sort((left, right) => compare(sourceKey(left), sourceKey(right)));
}

function assetOriginalFileNames(asset) {
  const names = [];
  if (typeof asset.originalFileName === 'string') names.push(asset.originalFileName);
  if (Array.isArray(asset.originalFileNames)) names.push(...asset.originalFileNames);
  return [...new Set(names)].sort(compare);
}

function importedAssets(chunk) {
  const value = chunk?.viteMetadata?.importedAssets;
  if (!value) return [];
  if (!Array.isArray(value) && !(value instanceof Set)) {
    fail('community_vite_inventory_imported_assets_invalid', chunk.fileName);
  }
  return [...value].map((fileName) => safeOutputFileName(fileName)).sort(compare);
}

function packageInventory(outputs) {
  const packages = new Map();
  for (const output of outputs) {
    for (const source of output.sources) {
      if (!source.name) continue;
      const identity = `${source.name}@${source.version}`;
      const current = packages.get(identity) ?? {
        name: source.name,
        version: source.version,
        classification: isBuildToolPackage(source.name)
          ? 'build-tool-emitted'
          : isFirstPartyPackage(source.name)
            ? 'first-party-package'
            : 'runtime-package',
        moduleRefs: new Set(),
        assetRefs: new Set(),
        outputs: new Set(),
      };
      if (source.kind === 'package-module') current.moduleRefs.add(source.ref);
      if (source.kind === 'package-asset') current.assetRefs.add(source.ref);
      current.outputs.add(output.fileName);
      packages.set(identity, current);
    }
  }
  const records = [...packages.values()].map((record) => ({
    name: record.name,
    version: record.version,
    classification: record.classification,
    moduleRefs: [...record.moduleRefs].sort(compare),
    assetRefs: [...record.assetRefs].sort(compare),
    outputs: [...record.outputs].sort(compare),
  })).sort((left, right) => compare(`${left.name}@${left.version}`, `${right.name}@${right.version}`));
  return {
    runtimePackages: records.filter((record) => record.classification === 'runtime-package'),
    firstPartyPackages: records.filter((record) => record.classification === 'first-party-package'),
    buildToolPackages: records.filter((record) => record.classification === 'build-tool-emitted'),
  };
}

function nonPackageInventory(outputs, kind) {
  const records = new Map();
  for (const output of outputs) {
    for (const source of output.sources.filter((candidate) => candidate.kind === kind)) {
      const current = records.get(source.ref) ?? new Set();
      current.add(output.fileName);
      records.set(source.ref, current);
    }
  }
  return [...records.entries()]
    .map(([ref, outputFiles]) => ({ ref, outputs: [...outputFiles].sort(compare) }))
    .sort((left, right) => compare(left.ref, right.ref));
}

export function createCommunityViteModuleInventory({
  root,
  assetSourceRoot = root,
  moduleIds,
  getModuleInfo,
  bundle,
  inventoryFileName = INVENTORY_FILE,
} = {}) {
  const canonical = canonicalRoot(root);
  const canonicalAssetSourceRoot = canonicalRoot(assetSourceRoot);
  if (!isWithin(canonical, canonicalAssetSourceRoot)) {
    fail('community_vite_inventory_asset_root_escape', String(assetSourceRoot));
  }
  const inventoryOutput = safeOutputFileName(inventoryFileName, 'community_vite_inventory_file_name_invalid');
  if (!moduleIds || typeof moduleIds[Symbol.iterator] !== 'function' || typeof getModuleInfo !== 'function') {
    fail('community_vite_inventory_module_graph_invalid');
  }
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    fail('community_vite_inventory_bundle_invalid');
  }
  const graphIds = new Set([...moduleIds]);
  const assetImporters = new Map();
  for (const output of Object.values(bundle)) {
    if (output?.type !== 'chunk') continue;
    const chunkName = safeOutputFileName(output.fileName);
    for (const assetName of importedAssets(output)) {
      const importers = assetImporters.get(assetName) ?? new Set();
      importers.add(chunkName);
      assetImporters.set(assetName, importers);
    }
  }

  const outputs = [];
  for (const output of Object.values(bundle)) {
    if (!output || (output.type !== 'chunk' && output.type !== 'asset')) {
      fail('community_vite_inventory_output_invalid');
    }
    const fileName = safeOutputFileName(output.fileName);
    if (fileName === inventoryOutput) continue;
    if (output.type === 'chunk') {
      if (!output.modules || typeof output.modules !== 'object' || Array.isArray(output.modules)) {
        fail('community_vite_inventory_chunk_modules_invalid', fileName);
      }
      const sources = [];
      for (const moduleId of Object.keys(output.modules).sort(compare)) {
        if (!graphIds.has(moduleId)) fail('community_vite_inventory_emitted_module_not_in_graph', moduleId);
        const info = getModuleInfo(moduleId);
        if (!info || info.isExternal === true) fail('community_vite_inventory_emitted_module_info_invalid', moduleId);
        sources.push(moduleSource(canonical, moduleId));
      }
      outputs.push({
        type: 'chunk',
        fileName,
        importedAssets: importedAssets(output),
        sources: uniqueSources(sources),
      });
      continue;
    }
    const originalFileNames = assetOriginalFileNames(output);
    const isViteManifest = fileName === '.vite/manifest.json';
    if (originalFileNames.length === 0 && !isViteManifest) {
      fail('community_vite_inventory_emitted_asset_source_missing', fileName);
    }
    const sources = originalFileNames
      .map((originalFileName) => assetSource(canonical, canonicalAssetSourceRoot, originalFileName))
      .filter(Boolean);
    if (sources.length === 0 && !isViteManifest) {
      fail('community_vite_inventory_emitted_asset_source_missing', fileName);
    }
    outputs.push({
      type: 'asset',
      fileName,
      importedByChunks: [...(assetImporters.get(fileName) ?? [])].sort(compare),
      sources: uniqueSources(sources),
    });
  }
  outputs.sort((left, right) => compare(left.fileName, right.fileName));
  for (const [assetName] of assetImporters) {
    if (!outputs.some((output) => output.type === 'asset' && output.fileName === assetName)) {
      fail('community_vite_inventory_imported_asset_missing', assetName);
    }
  }
  const packages = packageInventory(outputs);
  const inventory = {
    schemaVersion: 1,
    status: 'community-vite-runtime-module-inventory-ready',
    outputCount: outputs.length,
    outputs,
    runtimePackages: packages.runtimePackages,
    firstPartyPackages: packages.firstPartyPackages,
    buildToolPackages: packages.buildToolPackages,
    firstPartyModules: nonPackageInventory(outputs, 'first-party-module'),
    firstPartyAssets: nonPackageInventory(outputs, 'first-party-asset'),
    virtualModules: nonPackageInventory(outputs, 'virtual-module'),
  };
  const content = stableJson(inventory);
  if (content.includes(canonical) || content.includes(toPosix(canonical))) {
    fail('community_vite_inventory_absolute_path_leak');
  }
  return { inventory, content, sha256: sha256(content) };
}

export function createCommunityViteModuleInventoryPlugin({
  root,
  fileName = INVENTORY_FILE,
} = {}) {
  let resolvedAssetSourceRoot = root;
  return {
    name: 'aops-community-vite-module-inventory',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      resolvedAssetSourceRoot = config.root;
    },
    generateBundle: {
      order: 'post',
      handler(_outputOptions, bundle) {
        if (typeof this.getModuleIds !== 'function' || typeof this.getModuleInfo !== 'function' || typeof this.emitFile !== 'function') {
          fail('community_vite_inventory_plugin_context_invalid');
        }
        const result = createCommunityViteModuleInventory({
          root,
          assetSourceRoot: resolvedAssetSourceRoot,
          moduleIds: this.getModuleIds(),
          getModuleInfo: (id) => this.getModuleInfo(id),
          bundle,
          inventoryFileName: fileName,
        });
        this.emitFile({ type: 'asset', fileName, source: result.content });
      },
    },
  };
}
