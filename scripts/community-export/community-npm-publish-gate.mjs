#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  createCommunityCliPackageIdentityFromArchive,
} from './community-cli-public-identity.mjs';
import {
  COMMUNITY_PUBLIC_CLI_PACKAGE_NAME,
  validateCommunityCliPublicVersion,
} from './community-cli-public-package-archive.mjs';
import {
  COMMUNITY_GITHUB_OIDC_ISSUER,
  verifyCommunityReleaseArtifacts,
  verifyCommunityReleaseSignature,
} from './community-release-manifest.mjs';
import { verifyCommunityReleasePackagingCommit } from './community-release-packaging.mjs';
import { COMMUNITY_PUBLIC_GIT_URL } from './community-source-checkout.mjs';

export const COMMUNITY_NPM_PUBLIC_REGISTRY = 'https://registry.npmjs.org/';
export const COMMUNITY_NPM_PUBLIC_REPOSITORY = 'eeemzs/aops-community';
export const COMMUNITY_NPM_PUBLISH_AUTH_MODES = Object.freeze([
  'trusted-publishing',
  'bootstrap-token',
]);
export const COMMUNITY_NPM_PUBLISH_OPERATIONS = Object.freeze([
  'publish',
  'verify-published',
]);

const PRIVATE_FACTORY_WORKFLOW = 'aopslab/aops/.github/workflows/community-release.yml';
const PUBLIC_PUBLISH_WORKFLOW = '.github/workflows/npm-publish.yml';
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SHA512_INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const GITHUB_TAG_METADATA_SCRIPT = [
  "const response = await fetch(process.argv[1], {",
  "  headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GH_TOKEN}`, 'x-github-api-version': '2022-11-28' },",
  '  signal: AbortSignal.timeout(30_000),',
  '});',
  "if (!response.ok) throw new Error(`github_tag_api_status_${response.status}`);",
  'const value = await response.json();',
  "process.stdout.write(JSON.stringify({ sha: value.sha, tag: value.tag, objectType: value.object?.type, objectSha: value.object?.sha, verified: value.verification?.verified, reason: value.verification?.reason }));",
].join('\n');

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const npmIntegrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const normalizeOutput = (value) => String(value ?? '').replaceAll('\r\n', '\n');

export function compareCommunityNpmVersions(leftValue, rightValue) {
  const left = validateCommunityCliPublicVersion(leftValue);
  const right = validateCommunityCliPublicVersion(rightValue);
  const parse = (value) => {
    const separator = value.indexOf('-');
    const core = separator === -1 ? value : value.slice(0, separator);
    const prerelease = separator === -1 ? null : value.slice(separator + 1).split('.');
    return { core: core.split('.').map(Number), prerelease };
  };
  const leftVersion = parse(left);
  const rightVersion = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftVersion.core[index] !== rightVersion.core[index]) {
      return leftVersion.core[index] > rightVersion.core[index] ? 1 : -1;
    }
  }
  if (leftVersion.prerelease === null || rightVersion.prerelease === null) {
    if (leftVersion.prerelease === rightVersion.prerelease) return 0;
    return leftVersion.prerelease === null ? 1 : -1;
  }
  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      if (leftIdentifier === rightIdentifier) return 0;
      return leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) return Number(leftIdentifier) > Number(rightIdentifier) ? 1 : -1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

function redact(value, env = {}) {
  let result = String(value ?? '');
  for (const token of [
    env.NODE_AUTH_TOKEN,
    env.NPM_TOKEN,
    env.GH_TOKEN,
    env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    env.NPM_ID_TOKEN,
    env.SIGSTORE_ID_TOKEN,
  ].filter((entry) => typeof entry === 'string' && entry)) {
    result = result.replaceAll(token, '[redacted]');
  }
  return result
    .replace(/npm_[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{12,}/g, '[redacted]')
    .slice(-2000);
}

function createSecretMinimizedEnvironment(env, {
  includeGitHubToken = false,
  includeNodeAuthToken = false,
  includeOidc = false,
} = {}) {
  const githubToken = env.GH_TOKEN;
  const nodeAuthToken = env.NODE_AUTH_TOKEN;
  const oidcRequestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const oidcRequestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const minimized = Object.fromEntries(
    Object.entries(env).filter(([key]) => !/(?:token|secret|password|credential)/i.test(key)),
  );
  if (includeGitHubToken && githubToken) minimized.GH_TOKEN = githubToken;
  if (includeNodeAuthToken && nodeAuthToken) minimized.NODE_AUTH_TOKEN = nodeAuthToken;
  if (includeOidc && oidcRequestUrl && oidcRequestToken) {
    minimized.ACTIONS_ID_TOKEN_REQUEST_URL = oidcRequestUrl;
    minimized.ACTIONS_ID_TOKEN_REQUEST_TOKEN = oidcRequestToken;
  }
  return minimized;
}

function defaultRunner(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 600_000,
    ...options,
  });
}

function runChecked(runner, command, args, options = {}, code = 'community_npm_publish_command_failed') {
  const result = runner(command, args, options);
  if (result?.error || result?.status !== 0) {
    const detail = redact(
      `${command} ${args.join(' ')}:${result?.status ?? 'none'}:${result?.error?.message ?? ''}\n${result?.stderr ?? ''}`,
      options.env,
    );
    fail(code, detail);
  }
  return result;
}

function requireCheckoutRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail('community_npm_publish_checkout_absolute_required');
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) fail('community_npm_publish_checkout_missing');
  const stats = lstatSync(resolved);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail('community_npm_publish_checkout_invalid');
  const root = realpathSync.native(resolved);
  if (existsSync(path.join(root, '.npmrc'))) fail('community_npm_publish_checkout_npmrc_forbidden');
  return root;
}

export function verifyCommunityNpmToolingCheckout({
  toolingRoot = path.resolve(import.meta.dirname, '..', '..'),
  runner = defaultRunner,
  env = process.env,
} = {}) {
  if (typeof toolingRoot !== 'string' || !path.isAbsolute(toolingRoot)) {
    fail('community_npm_publish_tooling_root_absolute_required');
  }
  const resolved = path.resolve(toolingRoot);
  if (!existsSync(resolved)) fail('community_npm_publish_tooling_root_missing');
  const stats = lstatSync(resolved);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail('community_npm_publish_tooling_root_invalid');
  const root = realpathSync.native(resolved);
  const executingRoot = realpathSync.native(path.resolve(import.meta.dirname, '..', '..'));
  if (root !== executingRoot) fail('community_npm_publish_tooling_execution_root_mismatch');
  const commandEnv = createSecretMinimizedEnvironment(env);
  const runGit = (args, code) => normalizeOutput(runChecked(
    runner,
    'git',
    ['-C', root, ...args],
    { encoding: 'utf8', windowsHide: true, env: commandEnv },
    code,
  ).stdout).trim();
  const commit = runGit(['rev-parse', 'HEAD'], 'community_npm_publish_tooling_commit_failed');
  if (commit !== env.GITHUB_SHA) fail('community_npm_publish_tooling_commit_mismatch');
  if (runGit(['status', '--porcelain'], 'community_npm_publish_tooling_status_failed')) {
    fail('community_npm_publish_tooling_checkout_dirty');
  }
  const repository = runGit(['remote', 'get-url', 'origin'], 'community_npm_publish_tooling_remote_failed')
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
  const expectedRepository = COMMUNITY_PUBLIC_GIT_URL.replace(/\/$/, '').replace(/\.git$/, '');
  if (repository !== expectedRepository) fail('community_npm_publish_tooling_repository_invalid');
  return Object.freeze({
    status: 'community-npm-publish-tooling-verified',
    toolingRoot: root,
    toolingCommit: commit,
  });
}

function createNpmUserConfig(authMode) {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-community-npm-config-'));
  const userConfigPath = path.join(root, '.npmrc');
  const lines = [
    `registry=${COMMUNITY_NPM_PUBLIC_REGISTRY}`,
    `@aopslab:registry=${COMMUNITY_NPM_PUBLIC_REGISTRY}`,
    'provenance=true',
  ];
  if (authMode === 'bootstrap-token') {
    lines.push('//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}');
  }
  writeFileSync(userConfigPath, `${lines.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
  return { root, userConfigPath };
}

function createNpmEnvironment(env, { authMode, userConfigPath, includeOidc = false }) {
  const npmEnv = Object.fromEntries(
    Object.entries(createSecretMinimizedEnvironment(env, {
      includeNodeAuthToken: authMode === 'bootstrap-token',
      includeOidc,
    })).filter(([key]) => !/^npm_config_/i.test(key)),
  );
  npmEnv.NPM_CONFIG_PROVENANCE = 'true';
  npmEnv.NPM_CONFIG_REGISTRY = COMMUNITY_NPM_PUBLIC_REGISTRY;
  npmEnv.NPM_CONFIG_USERCONFIG = userConfigPath;
  return npmEnv;
}

function verifyNpmRegistryRouting({ runner, env }) {
  const result = runChecked(runner, 'npm', [
    'config',
    'get',
    '@aopslab:registry',
  ], {
    encoding: 'utf8',
    windowsHide: true,
    env,
  }, 'community_npm_publish_registry_routing_check_failed');
  const observed = normalizeOutput(result.stdout).trim().replace(/\/$/, '');
  const expected = COMMUNITY_NPM_PUBLIC_REGISTRY.replace(/\/$/, '');
  if (observed !== expected) fail('community_npm_publish_registry_routing_invalid', observed);
}

function validateAuth({ authMode, version, confirm, operation, env }) {
  if (!COMMUNITY_NPM_PUBLISH_AUTH_MODES.includes(authMode)) fail('community_npm_publish_auth_mode_invalid');
  if (!COMMUNITY_NPM_PUBLISH_OPERATIONS.includes(operation)) fail('community_npm_publish_operation_invalid');
  if (operation === 'verify-published') {
    if (authMode !== 'trusted-publishing') fail('community_npm_publish_verify_auth_mode_invalid');
    if (confirm !== `verify-v${version}`) fail('community_npm_publish_confirmation_invalid');
    if (env.NODE_AUTH_TOKEN || env.NPM_TOKEN) fail('community_npm_publish_verify_token_forbidden');
    return;
  }
  const expectedConfirm = authMode === 'bootstrap-token'
    ? `bootstrap-publish-v${version}`
    : `publish-v${version}`;
  if (confirm !== expectedConfirm) fail('community_npm_publish_confirmation_invalid');
  if (authMode === 'bootstrap-token') {
    if (typeof env.NODE_AUTH_TOKEN !== 'string' || !env.NODE_AUTH_TOKEN) {
      fail('community_npm_publish_bootstrap_token_required');
    }
  } else if (env.NODE_AUTH_TOKEN || env.NPM_TOKEN) {
    fail('community_npm_publish_trusted_mode_token_forbidden');
  }
}

function validateGitHubContext({ version, tag, authMode, confirm, operation, env }) {
  validateAuth({ authMode, version, confirm, operation, env });
  if (env.GITHUB_ACTIONS !== 'true') fail('community_npm_publish_github_actions_required');
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') fail('community_npm_publish_event_invalid');
  if (env.GITHUB_REPOSITORY !== COMMUNITY_NPM_PUBLIC_REPOSITORY) {
    fail('community_npm_publish_repository_invalid');
  }
  if (env.GITHUB_REF !== 'refs/heads/main') fail('community_npm_publish_ref_invalid');
  if (env.GITHUB_WORKFLOW_REF !== `${COMMUNITY_NPM_PUBLIC_REPOSITORY}/${PUBLIC_PUBLISH_WORKFLOW}@refs/heads/main`) {
    fail('community_npm_publish_workflow_ref_invalid');
  }
  if (env.AOPS_NPM_ENVIRONMENT !== 'npm-production') fail('community_npm_publish_environment_invalid');
  if (env.GITHUB_REF_TYPE !== undefined && env.GITHUB_REF_TYPE !== 'branch') {
    fail('community_npm_publish_ref_type_invalid');
  }
  if (env.GITHUB_REF_NAME !== undefined && env.GITHUB_REF_NAME !== 'main') {
    fail('community_npm_publish_ref_name_invalid');
  }
  if (!/^[a-f0-9]{40}$/.test(String(env.GITHUB_SHA ?? ''))) fail('community_npm_publish_sha_invalid');
  if (typeof env.GH_TOKEN !== 'string' || !env.GH_TOKEN) fail('community_npm_publish_github_token_required');
}

function verifyGitHubSignedTag({ checkoutRoot, tag, packagingCommit, runner, env }) {
  const publicCommandEnv = createSecretMinimizedEnvironment(env);
  const tagObject = normalizeOutput(runChecked(
    runner,
    'git',
    ['-C', checkoutRoot, 'rev-parse', `refs/tags/${tag}^{tag}`],
    { encoding: 'utf8', windowsHide: true, env: publicCommandEnv },
    'community_npm_publish_tag_object_failed',
  ).stdout).trim();
  if (!/^[a-f0-9]{40}$/.test(tagObject)) fail('community_npm_publish_tag_object_invalid');
  const verificationResult = normalizeOutput(runChecked(
    runner,
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      GITHUB_TAG_METADATA_SCRIPT,
      `https://api.github.com/repos/${COMMUNITY_NPM_PUBLIC_REPOSITORY}/git/tags/${tagObject}`,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: createSecretMinimizedEnvironment(env, { includeGitHubToken: true }),
    },
    'community_npm_publish_tag_verification_failed',
  ).stdout).trim();
  let verification;
  try {
    verification = JSON.parse(verificationResult);
  } catch {
    fail('community_npm_publish_tag_verification_invalid');
  }
  if (
    verification?.sha !== tagObject
    || verification?.tag !== tag
    || verification?.objectType !== 'commit'
    || verification?.objectSha !== packagingCommit
    || verification?.verified !== true
    || verification?.reason !== 'valid'
  ) fail('community_npm_publish_tag_not_verified');
  return tagObject;
}

function metadataUrl(version) {
  return new URL(`%40aopslab%2Faops-cli/${encodeURIComponent(version)}`, COMMUNITY_NPM_PUBLIC_REGISTRY).href;
}

function packageMetadataUrl() {
  return new URL('%40aopslab%2Faops-cli', COMMUNITY_NPM_PUBLIC_REGISTRY).href;
}

async function responseDetail(response) {
  try {
    return redact(await response.text());
  } catch {
    return `status=${response?.status ?? 'unknown'}`;
  }
}

async function requireVersionAbsent(version, fetchImpl) {
  const response = await fetchImpl(metadataUrl(version), {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (response?.status === 404) return;
  if (response?.ok) fail('community_npm_publish_version_already_exists');
  fail('community_npm_publish_registry_preflight_failed', await responseDetail(response));
}

async function requirePackageAbsent(fetchImpl) {
  const response = await fetchImpl(packageMetadataUrl(), {
    method: 'GET',
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  });
  if (response?.status === 404) return;
  if (response?.ok) fail('community_npm_publish_bootstrap_package_already_exists');
  fail('community_npm_publish_registry_preflight_failed', await responseDetail(response));
}

async function requireDistTagAdvance(candidate, fetchImpl) {
  const response = await fetchImpl(packageMetadataUrl(), {
    method: 'GET',
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  });
  if (response?.status === 404) fail('community_npm_publish_trusted_package_missing');
  if (!response?.ok) fail('community_npm_publish_registry_preflight_failed', await responseDetail(response));
  let metadata;
  try {
    metadata = await response.json();
  } catch {
    fail('community_npm_publish_registry_package_metadata_invalid');
  }
  if (metadata?.name !== COMMUNITY_PUBLIC_CLI_PACKAGE_NAME || typeof metadata?.['dist-tags'] !== 'object') {
    fail('community_npm_publish_registry_package_metadata_invalid');
  }
  const current = metadata['dist-tags'][candidate.npmDistTag];
  if (current === undefined) return;
  let comparison;
  try {
    comparison = compareCommunityNpmVersions(candidate.version, current);
  } catch {
    fail('community_npm_publish_registry_dist_tag_version_invalid');
  }
  if (comparison <= 0) {
    fail('community_npm_publish_registry_dist_tag_not_advanced', `${candidate.npmDistTag}=${current}`);
  }
}

async function readPublishedMetadata(version, { fetchImpl, wait, attempts = 12 }) {
  let response;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetchImpl(metadataUrl(version), {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (response?.ok) break;
    if (response?.status !== 404) {
      fail('community_npm_publish_registry_postflight_failed', await responseDetail(response));
    }
    if (attempt + 1 < attempts) await wait(5_000);
  }
  if (!response?.ok) fail('community_npm_publish_registry_visibility_timeout');
  let metadata;
  try {
    metadata = await response.json();
  } catch {
    fail('community_npm_publish_registry_metadata_invalid');
  }
  if (
    metadata?.name !== COMMUNITY_PUBLIC_CLI_PACKAGE_NAME
    || metadata?.version !== version
    || typeof metadata?.dist?.integrity !== 'string'
    || typeof metadata?.dist?.tarball !== 'string'
  ) fail('community_npm_publish_registry_metadata_invalid');
  return metadata;
}

async function verifyPublishedDistTag(candidate, { fetchImpl, wait, attempts = 12 }) {
  let observed = 'missing';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetchImpl(packageMetadataUrl(), {
      method: 'GET',
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    });
    if (response?.ok) {
      let metadata;
      try {
        metadata = await response.json();
      } catch {
        fail('community_npm_publish_registry_package_metadata_invalid');
      }
      if (metadata?.name !== COMMUNITY_PUBLIC_CLI_PACKAGE_NAME || typeof metadata?.['dist-tags'] !== 'object') {
        fail('community_npm_publish_registry_package_metadata_invalid');
      }
      observed = String(metadata['dist-tags'][candidate.npmDistTag] ?? 'missing');
      if (observed === candidate.version) return;
    } else if (response?.status !== 404) {
      fail('community_npm_publish_registry_postflight_failed', await responseDetail(response));
    }
    if (attempt + 1 < attempts) await wait(5_000);
  }
  fail('community_npm_publish_registry_dist_tag_mismatch', `${candidate.npmDistTag}=${observed}`);
}

function trustedFactoryIdentity(version) {
  return `https://github.com/${PRIVATE_FACTORY_WORKFLOW}@refs/tags/v${version}`;
}

export function inspectCommunityNpmPublishCandidate({
  checkoutRoot,
  version,
  tag = `v${version}`,
  confirm,
  authMode = 'trusted-publishing',
  operation = 'publish',
  toolingRoot = path.resolve(import.meta.dirname, '..', '..'),
  env = process.env,
  runner = defaultRunner,
} = {}) {
  const cliVersion = validateCommunityCliPublicVersion(version);
  if (tag !== `v${cliVersion}`) fail('community_npm_publish_tag_invalid');
  const root = requireCheckoutRoot(checkoutRoot);
  const packaging = verifyCommunityReleasePackagingCommit({ checkoutRoot: root, expectedTag: tag });
  validateGitHubContext({
    version: cliVersion,
    tag,
    authMode,
    confirm,
    operation,
    env,
  });
  const tooling = verifyCommunityNpmToolingCheckout({ toolingRoot, runner, env });
  const tagObject = verifyGitHubSignedTag({
    checkoutRoot: root,
    tag,
    packagingCommit: packaging.packagingCommit,
    runner,
    env,
  });
  const releaseRoot = path.join(root, 'release');
  const manifestPath = path.join(releaseRoot, 'release.json');
  const { manifest } = verifyCommunityReleaseArtifacts({ manifestPath, artifactsRoot: releaseRoot });
  if (manifest.releaseVersion !== cliVersion || manifest.cli.version !== cliVersion) {
    fail('community_npm_publish_release_version_mismatch');
  }
  const expectedDistTag = cliVersion.includes('-') ? 'next' : 'latest';
  if (manifest.cli.npmDistTag !== expectedDistTag) fail('community_npm_publish_dist_tag_mismatch');
  const artifactPath = path.join(releaseRoot, manifest.cli.artifactRef);
  const archiveBytes = readFileSync(artifactPath);
  const derivedIdentity = createCommunityCliPackageIdentityFromArchive({
    version: cliVersion,
    commandSchemaVersion: manifest.cli.commandSchemaVersion,
    npmDistTag: manifest.cli.npmDistTag,
    artifactRef: manifest.cli.artifactRef,
    archiveBytes,
  });
  if (JSON.stringify(derivedIdentity) !== JSON.stringify(manifest.cli)) {
    fail('community_npm_publish_package_identity_mismatch');
  }
  if (!SHA256.test(manifest.cli.artifactSha256) || !SHA512_INTEGRITY.test(manifest.cli.npmIntegrity)) {
    fail('community_npm_publish_package_digest_invalid');
  }
  verifyCommunityReleaseSignature({
    manifestPath,
    artifactsRoot: releaseRoot,
    certificateIdentity: trustedFactoryIdentity(cliVersion),
    certificateOidcIssuer: COMMUNITY_GITHUB_OIDC_ISSUER,
    runner: (command, args, options = {}) => runner(command, args, {
      ...options,
      env: createSecretMinimizedEnvironment(env),
    }),
  });
  return Object.freeze({
    schemaVersion: 1,
    status: 'community-npm-publish-candidate-verified',
    version: cliVersion,
    tag,
    npmDistTag: manifest.cli.npmDistTag,
    artifactPath,
    artifactRef: manifest.cli.artifactRef,
    artifactSha256: manifest.cli.artifactSha256,
    npmIntegrity: manifest.cli.npmIntegrity,
    packagingCommit: packaging.packagingCommit,
    toolingCommit: tooling.toolingCommit,
    tagObject,
    authMode,
    operation,
  });
}

export async function preflightCommunityNpmPublish(options = {}) {
  const candidate = inspectCommunityNpmPublishCandidate(options);
  if (candidate.operation !== 'publish') fail('community_npm_publish_preflight_operation_invalid');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (candidate.authMode === 'bootstrap-token') await requirePackageAbsent(fetchImpl);
  else await requireDistTagAdvance(candidate, fetchImpl);
  await requireVersionAbsent(candidate.version, fetchImpl);
  return Object.freeze({ ...candidate, status: 'community-npm-publish-preflight-passed' });
}

async function auditPublishedSignatures({ candidate, runner, env }) {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-community-npm-audit-'));
  try {
    writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({
      name: 'aops-community-npm-signature-audit',
      version: '0.0.0',
      private: true,
    }, null, 2)}\n`, { flag: 'wx' });
    const registryArg = `--registry=${COMMUNITY_NPM_PUBLIC_REGISTRY}`;
    runChecked(runner, 'npm', [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      registryArg,
      `${COMMUNITY_PUBLIC_CLI_PACKAGE_NAME}@${candidate.version}`,
    ], { cwd: root, encoding: 'utf8', windowsHide: true, env }, 'community_npm_publish_signature_lock_failed');
    runChecked(runner, 'npm', [
      'audit',
      'signatures',
      registryArg,
    ], { cwd: root, encoding: 'utf8', windowsHide: true, env }, 'community_npm_publish_signature_audit_failed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function verifyPublishedCommunityNpmCandidate({
  candidate,
  fetchImpl = globalThis.fetch,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  runner = defaultRunner,
  env = process.env,
  successStatus,
} = {}) {
  const metadata = await readPublishedMetadata(candidate.version, { fetchImpl, wait });
  if (metadata.dist.integrity !== candidate.npmIntegrity) fail('community_npm_publish_registry_integrity_mismatch');
  let tarballUrl;
  try {
    tarballUrl = new URL(metadata.dist.tarball);
  } catch {
    fail('community_npm_publish_registry_tarball_url_invalid');
  }
  if (tarballUrl.protocol !== 'https:' || tarballUrl.hostname !== 'registry.npmjs.org') {
    fail('community_npm_publish_registry_tarball_url_invalid');
  }
  const response = await fetchImpl(tarballUrl.href, { method: 'GET' });
  if (!response?.ok) fail('community_npm_publish_registry_tarball_download_failed', await responseDetail(response));
  const downloaded = Buffer.from(await response.arrayBuffer());
  if (sha256(downloaded) !== candidate.artifactSha256) fail('community_npm_publish_registry_sha256_mismatch');
  if (npmIntegrity(downloaded) !== candidate.npmIntegrity) fail('community_npm_publish_registry_download_integrity_mismatch');
  await verifyPublishedDistTag(candidate, { fetchImpl, wait });
  await auditPublishedSignatures({ candidate, runner, env });
  return Object.freeze({
    schemaVersion: 1,
    status: successStatus,
    version: candidate.version,
    npmDistTag: candidate.npmDistTag,
    artifactSha256: candidate.artifactSha256,
    npmIntegrity: candidate.npmIntegrity,
    tarball: tarballUrl.href,
  });
}

export async function postflightCommunityNpmPublish(options = {}) {
  if (!options.candidate || options.candidate.status !== 'community-npm-publish-preflight-passed') {
    fail('community_npm_publish_preflight_receipt_required');
  }
  return verifyPublishedCommunityNpmCandidate({
    ...options,
    successStatus: 'community-npm-publish-postflight-passed',
  });
}

export async function reconcileCommunityNpmPackage(options = {}) {
  const runner = options.runner ?? defaultRunner;
  const env = options.env ?? process.env;
  if (options.authMode !== undefined && options.authMode !== 'trusted-publishing') {
    fail('community_npm_publish_verify_auth_mode_invalid');
  }
  const candidate = inspectCommunityNpmPublishCandidate({
    ...options,
    authMode: 'trusted-publishing',
    operation: 'verify-published',
    runner,
    env,
  });
  const npmConfig = createNpmUserConfig('trusted-publishing');
  const verifyEnv = createNpmEnvironment(env, {
    authMode: 'trusted-publishing',
    userConfigPath: npmConfig.userConfigPath,
  });
  try {
    verifyNpmRegistryRouting({ runner, env: verifyEnv });
    return await verifyPublishedCommunityNpmCandidate({
      candidate,
      fetchImpl: options.fetchImpl,
      wait: options.wait,
      runner,
      env: verifyEnv,
      successStatus: 'community-npm-publish-reconciled',
    });
  } finally {
    rmSync(npmConfig.root, { recursive: true, force: true });
  }
}

export async function publishCommunityNpmPackage(options = {}) {
  const runner = options.runner ?? defaultRunner;
  const env = options.env ?? process.env;
  const candidate = await preflightCommunityNpmPublish({ ...options, runner, env });
  const npmConfig = createNpmUserConfig(candidate.authMode);
  const auditConfig = candidate.authMode === 'bootstrap-token'
    ? createNpmUserConfig('trusted-publishing')
    : npmConfig;
  const publishEnv = createNpmEnvironment(env, {
    authMode: candidate.authMode,
    userConfigPath: npmConfig.userConfigPath,
    includeOidc: true,
  });
  const auditEnv = createNpmEnvironment(env, {
    authMode: 'trusted-publishing',
    userConfigPath: auditConfig.userConfigPath,
  });
  try {
    verifyNpmRegistryRouting({ runner, env: auditEnv });
    runChecked(runner, 'npm', [
      'publish',
      candidate.artifactPath,
      `--registry=${COMMUNITY_NPM_PUBLIC_REGISTRY}`,
      '--access=public',
      `--tag=${candidate.npmDistTag}`,
      '--provenance',
    ], {
      cwd: path.resolve(options.checkoutRoot),
      encoding: 'utf8',
      windowsHide: true,
      env: publishEnv,
    }, 'community_npm_publish_command_failed');
    return await postflightCommunityNpmPublish({
      candidate,
      fetchImpl: options.fetchImpl,
      wait: options.wait,
      runner,
      env: auditEnv,
    });
  } finally {
    rmSync(npmConfig.root, { recursive: true, force: true });
    if (auditConfig.root !== npmConfig.root) rmSync(auditConfig.root, { recursive: true, force: true });
  }
}

function parseOptions(argv) {
  const command = argv[0];
  if (!COMMUNITY_NPM_PUBLISH_OPERATIONS.includes(command)) fail('community_npm_publish_command_required');
  const options = { command, json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--json') { options.json = true; continue; }
    if (!['--checkout-root', '--tooling-root', '--version', '--tag', '--confirm', '--auth-mode'].includes(flag)) {
      fail('community_npm_publish_option_invalid', flag);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('community_npm_publish_option_value_missing', flag);
    options[flag.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
}

const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const execute = options.command === 'publish'
      ? publishCommunityNpmPackage
      : reconcileCommunityNpmPackage;
    const result = await execute({
      checkoutRoot: path.resolve(options.checkoutRoot ?? ''),
      toolingRoot: path.resolve(options.toolingRoot ?? ''),
      version: options.version,
      tag: options.tag,
      confirm: options.confirm,
      authMode: options.authMode,
    });
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.status}\n`);
  } catch (error) {
    process.stderr.write(`[community-npm-publish] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
