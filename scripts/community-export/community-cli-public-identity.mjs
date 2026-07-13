import { createHash } from 'node:crypto';

import {
  COMMUNITY_PUBLIC_CLI_PACKAGE_NAME,
  canonicalCommunityCliArtifactRef,
  inspectCommunityCliPublicPackageArchive,
  inspectCommunityCliPublicPackageArchiveContents,
  validateCommunityCliNpmDistTag,
  validateCommunityCliPublicVersion,
} from './community-cli-public-package-archive.mjs';

export { COMMUNITY_PUBLIC_CLI_PACKAGE_NAME };

export const COMMUNITY_CLI_BUILD_IDENTITY_KEYS = Object.freeze([
  'packageName',
  'version',
  'commandSchemaVersion',
  'bundleSha256',
  'bundleByteLength',
]);

export const COMMUNITY_CLI_PACKAGE_IDENTITY_KEYS = Object.freeze([
  ...COMMUNITY_CLI_BUILD_IDENTITY_KEYS,
  'npmDistTag',
  'artifactRef',
  'artifactSha256',
  'npmIntegrity',
]);

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const NPM_INTEGRITY_SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/;
const SAFE_TGZ_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/;
const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function fail(code) {
  throw new Error(code);
}

function exactRecord(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length
    || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
    || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    fail(code);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail(code);
  }
  return value;
}

function exactBytes(value, code) {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) fail(code);
  return value;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function npmIntegrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

function validatePackageName(value) {
  if (value !== COMMUNITY_PUBLIC_CLI_PACKAGE_NAME) fail('community_cli_public_package_name_invalid');
  return value;
}

function validateCommandSchemaVersion(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('community_cli_public_command_schema_version_invalid');
  return value;
}

function validateSha256(value, code) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function validateBundleByteLength(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('community_cli_public_bundle_byte_length_invalid');
  return value;
}

function validateArtifactRef(value, version) {
  if (
    typeof value !== 'string'
    || Buffer.byteLength(value, 'utf8') > 255
    || !SAFE_TGZ_BASENAME.test(value)
    || WINDOWS_RESERVED_BASENAME.test(value)
    || value !== canonicalCommunityCliArtifactRef(version)
  ) {
    fail('community_cli_public_artifact_ref_invalid');
  }
  return value;
}

function validateNpmIntegrity(value) {
  if (typeof value !== 'string' || !NPM_INTEGRITY_SHA512.test(value)) {
    fail('community_cli_public_npm_integrity_invalid');
  }
  return value;
}

function validateBuildIdentityRecord(identity) {
  exactRecord(identity, COMMUNITY_CLI_BUILD_IDENTITY_KEYS, 'community_cli_public_build_identity_keys_invalid');
  validatePackageName(identity.packageName);
  validateCommunityCliPublicVersion(identity.version);
  validateCommandSchemaVersion(identity.commandSchemaVersion);
  validateSha256(identity.bundleSha256, 'community_cli_public_bundle_sha256_invalid');
  validateBundleByteLength(identity.bundleByteLength);
  return identity;
}

function validatePackageIdentityRecord(identity) {
  exactRecord(identity, COMMUNITY_CLI_PACKAGE_IDENTITY_KEYS, 'community_cli_public_package_identity_keys_invalid');
  validatePackageName(identity.packageName);
  validateCommunityCliPublicVersion(identity.version);
  validateCommandSchemaVersion(identity.commandSchemaVersion);
  validateSha256(identity.bundleSha256, 'community_cli_public_bundle_sha256_invalid');
  validateBundleByteLength(identity.bundleByteLength);
  validateCommunityCliNpmDistTag(identity.npmDistTag, identity.version);
  validateArtifactRef(identity.artifactRef, identity.version);
  validateSha256(identity.artifactSha256, 'community_cli_public_artifact_sha256_invalid');
  validateNpmIntegrity(identity.npmIntegrity);
  return identity;
}

function canonicalBuildIdentity(identity) {
  return {
    packageName: identity.packageName,
    version: identity.version,
    commandSchemaVersion: identity.commandSchemaVersion,
    bundleSha256: identity.bundleSha256,
    bundleByteLength: identity.bundleByteLength,
  };
}

function canonicalPackageIdentity(identity) {
  return {
    ...canonicalBuildIdentity(identity),
    npmDistTag: identity.npmDistTag,
    artifactRef: identity.artifactRef,
    artifactSha256: identity.artifactSha256,
    npmIntegrity: identity.npmIntegrity,
  };
}

export function validateCommunityCliPackageIdentity(identity) {
  validatePackageIdentityRecord(identity);
  return canonicalPackageIdentity(identity);
}

export function createCommunityCliBuildIdentity({
  packageName = COMMUNITY_PUBLIC_CLI_PACKAGE_NAME,
  version,
  commandSchemaVersion,
  bundleBytes,
} = {}) {
  validatePackageName(packageName);
  validateCommunityCliPublicVersion(version);
  validateCommandSchemaVersion(commandSchemaVersion);
  const bytes = exactBytes(bundleBytes, 'community_cli_public_bundle_bytes_required');
  return {
    packageName,
    version,
    commandSchemaVersion,
    bundleSha256: sha256(bytes),
    bundleByteLength: bytes.byteLength,
  };
}

export function verifyCommunityCliBuildIdentity({ identity, bundleBytes } = {}) {
  validateBuildIdentityRecord(identity);
  const bytes = exactBytes(bundleBytes, 'community_cli_public_bundle_bytes_required');
  if (identity.bundleByteLength !== bytes.byteLength) fail('community_cli_public_bundle_byte_length_mismatch');
  if (identity.bundleSha256 !== sha256(bytes)) fail('community_cli_public_bundle_sha256_mismatch');
  return canonicalBuildIdentity(identity);
}

export function createCommunityCliPackageIdentity({
  buildIdentity,
  bundleBytes,
  npmDistTag,
  artifactRef,
  archiveBytes,
  reviewedFiles,
} = {}) {
  const verifiedBuild = verifyCommunityCliBuildIdentity({ identity: buildIdentity, bundleBytes });
  validateCommunityCliNpmDistTag(npmDistTag, verifiedBuild.version);
  validateArtifactRef(artifactRef, verifiedBuild.version);
  const archive = exactBytes(archiveBytes, 'community_cli_public_archive_bytes_required');
  inspectCommunityCliPublicPackageArchive({
    archiveBytes: archive,
    bundleBytes,
    version: verifiedBuild.version,
    npmDistTag,
    reviewedFiles,
  });
  return {
    ...verifiedBuild,
    npmDistTag,
    artifactRef,
    artifactSha256: sha256(archive),
    npmIntegrity: npmIntegrity(archive),
  };
}

export function createCommunityCliPackageIdentityFromArchive({
  version,
  commandSchemaVersion,
  npmDistTag,
  artifactRef = canonicalCommunityCliArtifactRef(version),
  archiveBytes,
} = {}) {
  validateCommunityCliPublicVersion(version);
  validateCommandSchemaVersion(commandSchemaVersion);
  validateCommunityCliNpmDistTag(npmDistTag, version);
  if (npmDistTag !== (version.includes('-') ? 'next' : 'latest')) {
    fail('community_cli_public_npm_dist_tag_policy_mismatch');
  }
  validateArtifactRef(artifactRef, version);
  const archive = exactBytes(archiveBytes, 'community_cli_public_archive_bytes_required');
  const inspected = inspectCommunityCliPublicPackageArchiveContents({
    archiveBytes: archive,
    version,
    npmDistTag,
  });
  const buildIdentity = createCommunityCliBuildIdentity({
    version,
    commandSchemaVersion,
    bundleBytes: inspected.bundleBytes,
  });
  const packageIdentity = {
    ...buildIdentity,
    npmDistTag,
    artifactRef,
    artifactSha256: sha256(archive),
    npmIntegrity: npmIntegrity(archive),
  };
  validatePackageIdentityRecord(packageIdentity);
  return canonicalPackageIdentity(packageIdentity);
}

export function verifyCommunityCliPackageIdentity({
  buildIdentity,
  packageIdentity,
  bundleBytes,
  archiveBytes,
  reviewedFiles,
} = {}) {
  validatePackageIdentityRecord(packageIdentity);
  const verifiedBuild = verifyCommunityCliBuildIdentity({ identity: buildIdentity, bundleBytes });
  for (const key of COMMUNITY_CLI_BUILD_IDENTITY_KEYS) {
    if (packageIdentity[key] !== verifiedBuild[key]) fail('community_cli_public_cross_identity_mismatch');
  }
  const archive = exactBytes(archiveBytes, 'community_cli_public_archive_bytes_required');
  if (packageIdentity.artifactSha256 !== sha256(archive)) fail('community_cli_public_artifact_sha256_mismatch');
  if (packageIdentity.npmIntegrity !== npmIntegrity(archive)) fail('community_cli_public_npm_integrity_mismatch');
  inspectCommunityCliPublicPackageArchive({
    archiveBytes: archive,
    bundleBytes,
    version: verifiedBuild.version,
    npmDistTag: packageIdentity.npmDistTag,
    reviewedFiles,
  });
  return canonicalPackageIdentity(packageIdentity);
}
