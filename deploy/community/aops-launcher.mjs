#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import { inspectCommunityCliPublicPackageArchiveContents } from '../../scripts/community-export/community-cli-public-package-archive.mjs';
import { validateCommunityReleaseManifest } from '../../scripts/community-export/community-release-manifest.mjs';

const EXPECTED_RELEASE_VERSION = "0.0.1";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_POWERSHELL_ARG_COUNT = 256;
const MAX_POWERSHELL_ARG_CHARACTERS = 8192;
const MAX_POWERSHELL_ARGV_BYTES = 16384;
const POWERSHELL_TRANSPORT_ENV = 'AOPS_CLONE_LAUNCHER_TRANSPORT';
const POWERSHELL_ARGV_ENV = 'AOPS_CLONE_LAUNCHER_ARGV_B64';
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const SIGNAL_EXIT_CODE = Object.freeze({ SIGINT: 130, SIGTERM: 143 });

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function digest(algorithm, content, encoding) {
  return createHash(algorithm).update(content).digest(encoding);
}

function sha256(content) {
  return `sha256:${digest('sha256', content, 'hex')}`;
}

function npmIntegrity(content) {
  return `sha512-${digest('sha512', content, 'base64')}`;
}

function hasValidUnicodeScalars(value) {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function launcherArgv() {
  const transport = process.env[POWERSHELL_TRANSPORT_ENV];
  const encoded = process.env[POWERSHELL_ARGV_ENV];
  delete process.env[POWERSHELL_TRANSPORT_ENV];
  delete process.env[POWERSHELL_ARGV_ENV];
  if (transport === undefined && encoded === undefined) return process.argv.slice(2);
  if (transport !== 'powershell-json-base64-v1' || typeof encoded !== 'string' || process.argv.length !== 2) {
    fail('community_launcher_powershell_transport_invalid');
  }
  const maximumBase64Characters = Math.ceil(MAX_POWERSHELL_ARGV_BYTES / 3) * 4;
  if (!encoded || encoded.length > maximumBase64Characters || !BASE64.test(encoded)) {
    fail('community_launcher_powershell_payload_invalid');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.byteLength > MAX_POWERSHELL_ARGV_BYTES || bytes.toString('base64') !== encoded) {
    fail('community_launcher_powershell_payload_invalid');
  }
  let parsed;
  try {
    parsed = JSON.parse(UTF8.decode(bytes));
  } catch {
    fail('community_launcher_powershell_payload_invalid');
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_POWERSHELL_ARG_COUNT) {
    fail('community_launcher_powershell_argv_invalid');
  }
  for (const argument of parsed) {
    if (
      typeof argument !== 'string'
      || argument.length > MAX_POWERSHELL_ARG_CHARACTERS
      || argument.includes('\0')
      || !hasValidUnicodeScalars(argument)
    ) fail('community_launcher_powershell_argv_invalid');
  }
  return parsed;
}

function samePhysicalPath(left, right) {
  const normalize = (value) => process.platform === 'win32'
    ? path.normalize(value).toLocaleLowerCase('en-US')
    : path.normalize(value);
  return normalize(left) === normalize(right);
}

function sameSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function lstatIfPresent(candidate, options) {
  try {
    return lstatSync(candidate, options);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

function requirePhysicalDirectory(candidate, code) {
  const resolved = path.resolve(candidate);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code);
  const physical = realpathSync.native(resolved);
  if (!samePhysicalPath(resolved, physical)) fail(code);
  return physical;
}

function resolveLocalSourceCli(repoRoot) {
  const resolved = path.resolve(repoRoot, 'apps', 'aops-cli', 'dist', 'main.js');
  const stat = lstatIfPresent(resolved, { bigint: true });
  if (stat === null) {
    fail('community_launcher_local_cli_not_built', 'run pnpm install --frozen-lockfile');
  }
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || stat.nlink !== 1n
    || stat.size <= 0n
  ) {
    fail('community_launcher_local_cli_invalid');
  }
  const physical = realpathSync.native(resolved);
  if (!samePhysicalPath(resolved, physical)) fail('community_launcher_local_cli_invalid');
  return physical;
}

function readStableFile(filePath, maximumBytes, code) {
  const before = lstatSync(filePath, { bigint: true });
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1n
    || before.size <= 0n
    || before.size > BigInt(maximumBytes)
  ) {
    fail(code);
  }
  const content = readFileSync(filePath);
  const after = lstatSync(filePath, { bigint: true });
  if (!sameSnapshot(before, after) || BigInt(content.byteLength) !== after.size) fail(`${code}_changed`);
  return content;
}

function parseManifest(content) {
  let manifest;
  try {
    manifest = JSON.parse(UTF8.decode(content));
  } catch {
    fail('community_launcher_release_manifest_invalid');
  }
  validateCommunityReleaseManifest(manifest);
  if (
    manifest.releaseVersion !== EXPECTED_RELEASE_VERSION
    || manifest.cli.version !== EXPECTED_RELEASE_VERSION
    || manifest.cli.artifactRef !== `aopslab-aops-cli-${EXPECTED_RELEASE_VERSION}.tgz`
  ) fail('community_launcher_release_version_mismatch');
  if (!SHA256.test(manifest.cli.artifactSha256) || !SHA256.test(manifest.cli.bundleSha256)) {
    fail('community_launcher_cli_digest_invalid');
  }
  return manifest;
}

function verifyCliArchive(releaseRoot, manifest) {
  const artifactPath = path.join(releaseRoot, manifest.cli.artifactRef);
  if (!samePhysicalPath(path.dirname(artifactPath), releaseRoot)) fail('community_launcher_cli_artifact_escape');
  const archiveBytes = readStableFile(artifactPath, 32 * 1024 * 1024, 'community_launcher_cli_artifact_invalid');
  if (sha256(archiveBytes) !== manifest.cli.artifactSha256) fail('community_launcher_cli_artifact_sha256_mismatch');
  if (npmIntegrity(archiveBytes) !== manifest.cli.npmIntegrity) fail('community_launcher_cli_artifact_integrity_mismatch');
  const inspected = inspectCommunityCliPublicPackageArchiveContents({
    archiveBytes,
    version: EXPECTED_RELEASE_VERSION,
    npmDistTag: manifest.cli.npmDistTag,
  });
  if (
    inspected.bundleBytes.byteLength !== manifest.cli.bundleByteLength
    || sha256(inspected.bundleBytes) !== manifest.cli.bundleSha256
  ) fail('community_launcher_cli_bundle_identity_mismatch');
  return inspected.bundleBytes;
}

function materializePrivateExecution(bundleBytes) {
  const directory = mkdtempSync(path.join(tmpdir(), 'aops-community-cli-'));
  chmodSync(directory, 0o700);
  const executable = path.join(directory, 'aops-cli.mjs');
  try {
    writeFileSync(executable, bundleBytes, { flag: 'wx', mode: 0o700 });
    chmodSync(executable, 0o700);
    const observed = readStableFile(executable, 64 * 1024 * 1024, 'community_launcher_private_cli_invalid');
    if (!observed.equals(bundleBytes)) fail('community_launcher_private_cli_mismatch');
    return { directory, executable };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function runCli(executable, repoRoot, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...argv], {
      cwd: repoRoot,
      env: process.env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    });
    let settled = false;
    let receivedSignal = null;
    const signalHandlers = new Map();
    const removeSignalHandlers = () => {
      for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    };
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => {
        receivedSignal ??= signal;
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill(signal);
          } catch {
            if (!settled) {
              settled = true;
              removeSignalHandlers();
              resolve({ code: null, signal });
            }
          }
        }
      };
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      removeSignalHandlers();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      removeSignalHandlers();
      resolve({ code, signal: receivedSignal ?? signal });
    });
  });
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 9)) fail('community_launcher_node_22_9_required');
  const launcherPath = fileURLToPath(import.meta.url);
  const repoRoot = requirePhysicalDirectory(path.resolve(path.dirname(launcherPath), '..', '..'), 'community_launcher_repo_root_invalid');
  const argv = launcherArgv();
  const releaseCandidate = path.join(repoRoot, 'release');
  if (lstatIfPresent(releaseCandidate) === null) {
    const result = await runCli(resolveLocalSourceCli(repoRoot), repoRoot, argv);
    process.exitCode = result.signal ? (SIGNAL_EXIT_CODE[result.signal] ?? 1) : (result.code ?? 1);
    return;
  }
  const releaseRoot = requirePhysicalDirectory(releaseCandidate, 'community_launcher_release_root_invalid');
  if (!samePhysicalPath(path.dirname(releaseRoot), repoRoot)) fail('community_launcher_release_root_escape');
  const manifestBytes = readStableFile(
    path.join(releaseRoot, 'release.json'),
    MAX_MANIFEST_BYTES,
    'community_launcher_release_manifest_invalid',
  );
  const manifest = parseManifest(manifestBytes);
  const bundleBytes = verifyCliArchive(releaseRoot, manifest);
  const execution = materializePrivateExecution(bundleBytes);
  try {
    const result = await runCli(execution.executable, repoRoot, argv);
    process.exitCode = result.signal ? (SIGNAL_EXIT_CODE[result.signal] ?? 1) : (result.code ?? 1);
  } finally {
    rmSync(execution.directory, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`[aops] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
