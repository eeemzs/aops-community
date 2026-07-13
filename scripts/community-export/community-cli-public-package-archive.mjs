import { TextDecoder } from 'node:util';
import { gunzipSync } from 'node:zlib';

export const COMMUNITY_PUBLIC_CLI_PACKAGE_NAME = '@aopslab/aops-cli';
export const COMMUNITY_CLI_REVIEWED_FILE_KEYS = Object.freeze([
  'license',
  'notice',
  'readme',
  'thirdPartyNotices',
]);

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
const MAX_NPM_VERSION_LENGTH = 256;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const EXPECTED_ENTRIES = Object.freeze([
  'package/LICENSE',
  'package/NOTICE',
  'package/README.md',
  'package/THIRD_PARTY_NOTICES',
  'package/dist/aops-cli.mjs',
  'package/package.json',
]);
const MANIFEST_KEYS = Object.freeze([
  'name',
  'version',
  'type',
  'description',
  'license',
  'repository',
  'homepage',
  'bugs',
  'bin',
  'files',
  'engines',
  'publishConfig',
]);
const REVIEWED_FILE_PATHS = Object.freeze({
  license: 'package/LICENSE',
  notice: 'package/NOTICE',
  readme: 'package/README.md',
  thirdPartyNotices: 'package/THIRD_PARTY_NOTICES',
});
const NPM_DIST_TAG = /^(?:latest|next|beta|rc|canary)$/;
const NPM_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const NODE_SHEBANG = Buffer.from('#!/usr/bin/env node\n', 'utf8');

function fail(code) {
  throw new Error(code);
}

export function validateCommunityCliPublicVersion(value) {
  if (typeof value !== 'string' || value.length > MAX_NPM_VERSION_LENGTH) {
    fail('community_cli_public_version_invalid');
  }
  const match = value.match(NPM_VERSION);
  if (!match) fail('community_cli_public_version_invalid');
  // Deliberate AOPS policy: numeric identifiers must also fit losslessly in JavaScript.
  for (const component of match.slice(1, 4)) {
    if (!Number.isSafeInteger(Number(component))) fail('community_cli_public_version_invalid');
  }
  for (const identifier of String(match[4] ?? '').split('.')) {
    if (/^\d+$/.test(identifier) && !Number.isSafeInteger(Number(identifier))) {
      fail('community_cli_public_version_invalid');
    }
  }
  return value;
}

export function validateCommunityCliNpmDistTag(value, version) {
  validateCommunityCliPublicVersion(version);
  if (
    typeof value !== 'string'
    || !NPM_DIST_TAG.test(value)
    || (version.includes('-') && value === 'latest')
  ) fail('community_cli_public_npm_dist_tag_invalid');
  return value;
}

function exactRecord(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length
    || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
    || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) fail(code);
  return value;
}

function exactBytes(value, code) {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) fail(code);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function exactReviewedFiles(value) {
  exactRecord(value, COMMUNITY_CLI_REVIEWED_FILE_KEYS, 'community_cli_public_reviewed_files_shape_invalid');
  return Object.fromEntries(COMMUNITY_CLI_REVIEWED_FILE_KEYS.map((key) => [
    key,
    exactBytes(value[key], `community_cli_public_reviewed_${key}_bytes_required`),
  ]));
}

function decodeText(content, code) {
  try {
    return UTF8.decode(content);
  } catch {
    return fail(code);
  }
}

function decodeField(buffer, start, length, code) {
  const field = buffer.subarray(start, start + length);
  const zero = field.indexOf(0);
  try {
    return UTF8.decode(zero === -1 ? field : field.subarray(0, zero));
  } catch {
    return fail(code);
  }
}

function parseOctal(buffer, start, length, code) {
  const field = decodeField(buffer, start, length, code).trim();
  if (!/^[0-7]+$/.test(field)) fail(code);
  const value = Number.parseInt(field, 8);
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

function verifyChecksum(header) {
  const expected = parseOctal(header, 148, 8, 'community_cli_public_archive_checksum_invalid');
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  const actual = copy.reduce((sum, byte) => sum + byte, 0);
  if (actual !== expected) fail('community_cli_public_archive_checksum_mismatch');
}

function parseArchive(archiveBytes) {
  const archive = exactBytes(archiveBytes, 'community_cli_public_archive_bytes_required');
  if (
    archive.byteLength > MAX_ARCHIVE_BYTES
    || archive[0] !== 0x1f
    || archive[1] !== 0x8b
  ) fail('community_cli_public_archive_gzip_invalid');

  let tar;
  try {
    tar = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES });
  } catch {
    fail('community_cli_public_archive_gzip_invalid');
  }
  if (tar.byteLength === 0 || tar.byteLength % 512 !== 0) {
    fail('community_cli_public_archive_tar_size_invalid');
  }

  const files = new Map();
  let offset = 0;
  let zeroBlocks = 0;
  while (offset < tar.byteLength) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      continue;
    }
    if (zeroBlocks > 0) fail('community_cli_public_archive_trailing_data');
    verifyChecksum(header);

    const name = decodeField(header, 0, 100, 'community_cli_public_archive_name_invalid');
    const prefix = decodeField(header, 345, 155, 'community_cli_public_archive_prefix_invalid');
    const linkName = decodeField(header, 157, 100, 'community_cli_public_archive_link_invalid');
    const magic = decodeField(header, 257, 6, 'community_cli_public_archive_magic_invalid');
    const version = decodeField(header, 263, 2, 'community_cli_public_archive_magic_invalid');
    const entryPath = prefix ? `${prefix}/${name}` : name;
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    if (
      !entryPath
      || entryPath.includes('\\')
      || entryPath.startsWith('/')
      || entryPath.split('/').some((part) => part === '' || part === '.' || part === '..')
      || type !== '0'
      || linkName
      || magic !== 'ustar'
      || version !== '00'
      || files.has(entryPath)
    ) fail('community_cli_public_archive_entry_invalid');

    const mode = parseOctal(header, 100, 8, 'community_cli_public_archive_mode_invalid');
    const uid = parseOctal(header, 108, 8, 'community_cli_public_archive_owner_invalid');
    const gid = parseOctal(header, 116, 8, 'community_cli_public_archive_owner_invalid');
    const size = parseOctal(header, 124, 12, 'community_cli_public_archive_size_invalid');
    const mtime = parseOctal(header, 136, 12, 'community_cli_public_archive_mtime_invalid');
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const paddedEnd = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd > tar.byteLength || paddedEnd > tar.byteLength) {
      fail('community_cli_public_archive_entry_truncated');
    }
    if (tar.subarray(dataEnd, paddedEnd).some((byte) => byte !== 0)) {
      fail('community_cli_public_archive_padding_invalid');
    }
    if (uid !== 0 || gid !== 0 || mtime !== 0) {
      fail('community_cli_public_archive_metadata_invalid');
    }
    files.set(entryPath, Object.freeze({
      mode,
      content: Buffer.from(tar.subarray(dataStart, dataEnd)),
    }));
    offset = paddedEnd;
  }
  if (zeroBlocks !== 2) fail('community_cli_public_archive_terminator_invalid');
  if (
    files.size !== EXPECTED_ENTRIES.length
    || EXPECTED_ENTRIES.some((entry) => !files.has(entry))
  ) fail('community_cli_public_archive_inventory_invalid');
  return files;
}

function decodeJson(content) {
  let value;
  try {
    value = JSON.parse(UTF8.decode(content));
  } catch {
    fail('community_cli_public_archive_manifest_invalid');
  }
  return exactRecord(value, MANIFEST_KEYS, 'community_cli_public_archive_manifest_shape_invalid');
}

function validateManifest(manifest, version, npmDistTag) {
  if (
    manifest.name !== COMMUNITY_PUBLIC_CLI_PACKAGE_NAME
    || manifest.version !== version
    || manifest.type !== 'module'
    || manifest.description !== 'AOPS Community operator CLI.'
    || manifest.license !== 'Apache-2.0'
    || manifest.homepage !== 'https://github.com/eeemzs/aops-community#readme'
  ) fail('community_cli_public_archive_manifest_identity_mismatch');

  exactRecord(manifest.repository, ['type', 'url', 'directory'], 'community_cli_public_archive_repository_invalid');
  if (
    manifest.repository.type !== 'git'
    || manifest.repository.url !== 'git+https://github.com/eeemzs/aops-community.git'
    || manifest.repository.directory !== 'apps/aops-cli'
  ) fail('community_cli_public_archive_repository_invalid');

  exactRecord(manifest.bugs, ['url'], 'community_cli_public_archive_bugs_invalid');
  if (manifest.bugs.url !== 'https://github.com/eeemzs/aops-community/issues') {
    fail('community_cli_public_archive_bugs_invalid');
  }
  exactRecord(manifest.bin, ['aops-cli'], 'community_cli_public_archive_bin_invalid');
  if (manifest.bin['aops-cli'] !== 'dist/aops-cli.mjs') {
    fail('community_cli_public_archive_bin_invalid');
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify([
    'dist',
    'LICENSE',
    'NOTICE',
    'README.md',
    'THIRD_PARTY_NOTICES',
  ])) fail('community_cli_public_archive_files_invalid');
  exactRecord(manifest.engines, ['node'], 'community_cli_public_archive_engines_invalid');
  if (manifest.engines.node !== '>=22.9.0') fail('community_cli_public_archive_engines_invalid');
  exactRecord(
    manifest.publishConfig,
    ['access', 'registry', 'provenance', 'tag'],
    'community_cli_public_archive_publish_config_invalid',
  );
  if (
    manifest.publishConfig.access !== 'public'
    || manifest.publishConfig.registry !== 'https://registry.npmjs.org/'
    || manifest.publishConfig.provenance !== true
    || manifest.publishConfig.tag !== npmDistTag
  ) fail('community_cli_public_archive_publish_config_invalid');
}

export function canonicalCommunityCliArtifactRef(version) {
  return `aopslab-aops-cli-${version}.tgz`;
}

function inspectCommunityCliPublicPackageArchiveContentsInternal({
  archiveBytes,
  version,
  npmDistTag,
} = {}) {
  validateCommunityCliPublicVersion(version);
  validateCommunityCliNpmDistTag(npmDistTag, version);
  const archive = exactBytes(archiveBytes, 'community_cli_public_archive_bytes_required');
  const files = parseArchive(archive);
  const manifestEntry = files.get('package/package.json');
  const bundleEntry = files.get('package/dist/aops-cli.mjs');
  if (!manifestEntry || !bundleEntry) fail('community_cli_public_archive_inventory_invalid');
  validateManifest(decodeJson(manifestEntry.content), version, npmDistTag);
  if (bundleEntry.mode !== 0o755) fail('community_cli_public_archive_bundle_mode_invalid');
  for (const entry of EXPECTED_ENTRIES) {
    const record = files.get(entry);
    if (!record || (entry !== 'package/dist/aops-cli.mjs' && record.mode !== 0o644)) {
      fail('community_cli_public_archive_mode_invalid');
    }
    if (record.content.byteLength === 0) fail('community_cli_public_archive_empty_file');
  }
  const licenseText = decodeText(files.get('package/LICENSE').content, 'community_cli_public_archive_license_utf8_invalid');
  const noticeText = decodeText(files.get('package/NOTICE').content, 'community_cli_public_archive_notice_utf8_invalid');
  const readmeText = decodeText(files.get('package/README.md').content, 'community_cli_public_archive_readme_utf8_invalid');
  const thirdPartyText = decodeText(
    files.get('package/THIRD_PARTY_NOTICES').content,
    'community_cli_public_archive_third_party_notices_utf8_invalid',
  );
  if (!/Apache License[\s\S]*Version 2\.0, January 2004/.test(licenseText)) {
    fail('community_cli_public_archive_license_invalid');
  }
  if (!/AOPS Community/.test(noticeText)) fail('community_cli_public_archive_notice_invalid');
  if (!/AOPS Community Third-Party Notices/.test(thirdPartyText)) {
    fail('community_cli_public_archive_third_party_notices_invalid');
  }
  if (!/git clone/i.test(readmeText) || !/@aopslab\/aops-cli/.test(readmeText)) {
    fail('community_cli_public_archive_readme_invalid');
  }
  if (!bundleEntry.content.subarray(0, NODE_SHEBANG.byteLength).equals(NODE_SHEBANG)) {
    fail('community_cli_public_archive_bundle_shebang_invalid');
  }
  return { archive, bundleBytes: Buffer.from(bundleEntry.content), files };
}

export function inspectCommunityCliPublicPackageArchiveContents(options = {}) {
  const inspected = inspectCommunityCliPublicPackageArchiveContentsInternal(options);
  return Object.freeze({
    packageName: COMMUNITY_PUBLIC_CLI_PACKAGE_NAME,
    version: options.version,
    bin: 'aops-cli',
    binTarget: 'dist/aops-cli.mjs',
    entryCount: inspected.files.size,
    bundleBytes: inspected.bundleBytes,
  });
}

export function inspectCommunityCliPublicPackageArchive({
  archiveBytes,
  bundleBytes,
  version,
  npmDistTag,
  reviewedFiles,
} = {}) {
  const inspected = inspectCommunityCliPublicPackageArchiveContentsInternal({ archiveBytes, version, npmDistTag });
  const bundle = exactBytes(bundleBytes, 'community_cli_public_bundle_bytes_required');
  if (!inspected.bundleBytes.equals(bundle)) fail('community_cli_public_archive_bundle_mismatch');
  const reviewed = exactReviewedFiles(reviewedFiles);
  for (const key of COMMUNITY_CLI_REVIEWED_FILE_KEYS) {
    const record = inspected.files.get(REVIEWED_FILE_PATHS[key]);
    if (!record || !record.content.equals(reviewed[key])) {
      fail(`community_cli_public_reviewed_${key}_mismatch`);
    }
  }
  return Object.freeze({
    packageName: COMMUNITY_PUBLIC_CLI_PACKAGE_NAME,
    version,
    bin: 'aops-cli',
    binTarget: 'dist/aops-cli.mjs',
    entryCount: inspected.files.size,
  });
}
