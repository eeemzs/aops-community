#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { codepointCompare } from './community-codepoint-compare.mjs';

export const COMMUNITY_PUBLIC_GIT_URL = 'https://github.com/eeemzs/aops-community.git';

const GITHUB_SHA1_COMMIT = /^[a-f0-9]{40}$/;
const CLONE_LAUNCHER_MODES = Object.freeze({
  aops: '100755',
  'aops.ps1': '100644',
  'deploy/community/aops-launcher.mjs': '100644',
});
const sha256Hex = (content) => createHash('sha256').update(content).digest('hex');
const sha256 = (content) => `sha256:${sha256Hex(content)}`;

function runGitRaw(checkoutRoot, args) {
  const result = spawnSync('git', ['-C', checkoutRoot, ...args], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const detail = `${result.stdout?.toString('utf8') ?? ''}\n${result.stderr?.toString('utf8') ?? ''}`.trim().slice(-2000);
    throw new Error(`community_source_git_failed:${args.join(' ')}:${result.status}:${result.error?.message ?? detail}`);
  }
  return Buffer.from(result.stdout ?? []);
}

function runGit(checkoutRoot, args) {
  return runGitRaw(checkoutRoot, args).toString('utf8');
}

function gitObjectFormat(checkoutRoot) {
  const algorithm = runGit(checkoutRoot, ['rev-parse', '--show-object-format']).trim();
  if (algorithm !== 'sha1' && algorithm !== 'sha256') throw new Error('community_source_git_object_format_invalid');
  return algorithm;
}

function hashGitBlob(algorithm, content) {
  return createHash(algorithm)
    .update(`blob ${content.byteLength}\0`, 'utf8')
    .update(content)
    .digest('hex');
}

function gitModeFromStats(stats) {
  const mode = typeof stats.mode === 'bigint' ? Number(stats.mode) : stats.mode;
  return (mode & 0o111) === 0 ? '100644' : '100755';
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readStableRegularFile(filePath, relative, prefix) {
  const before = lstatSync(filePath, { bigint: true });
  if (before.isSymbolicLink()) throw new Error(`${prefix}_symlink_refused:${relative}`);
  if (!before.isFile()) throw new Error(`${prefix}_special_file_refused:${relative}`);
  if (before.nlink !== 1n) throw new Error(`${prefix}_hardlink_refused:${relative}`);
  const content = readFileSync(filePath);
  const after = lstatSync(filePath, { bigint: true });
  if (
    after.isSymbolicLink()
    || !after.isFile()
    || after.nlink !== 1n
    || !sameFileSnapshot(before, after)
    || BigInt(content.byteLength) !== after.size
  ) throw new Error(`${prefix}_changed:${relative}`);
  return { content, stats: after };
}

function collectFiles(root, current = root, output = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stats = lstatSync(absolute, { bigint: true });
    if (stats.isSymbolicLink()) throw new Error(`community_source_symlink_refused:${relative}`);
    if (stats.isDirectory()) collectFiles(root, absolute, output);
    else if (stats.isFile()) {
      const stable = readStableRegularFile(absolute, relative, 'community_source');
      output.push({
        path: relative,
        gitMode: gitModeFromStats(stable.stats),
        fileType: 'regular',
        content: stable.content,
      });
    }
    else throw new Error(`community_source_special_file_refused:${relative}`);
  }
  return output;
}

function parseGitIndex(indexBytes) {
  const records = indexBytes.toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((row) => {
      const separator = row.indexOf('\t');
      const metadata = separator === -1 ? '' : row.slice(0, separator);
      const relative = separator === -1 ? '' : row.slice(separator + 1);
      const match = /^(\d{6}) ([a-f0-9]{40,64}) ([0-3])$/.exec(metadata);
      if (!match || !relative) throw new Error('community_source_git_index_invalid');
      const [, gitMode, objectId, stage] = match;
      if (stage !== '0') throw new Error(`community_source_git_index_stage_invalid:${relative}:${stage}`);
      if (gitMode === '120000') throw new Error(`community_source_git_symlink_refused:${relative}`);
      if (gitMode === '160000') throw new Error(`community_source_gitlink_refused:${relative}`);
      if (gitMode !== '100644' && gitMode !== '100755') {
        throw new Error(`community_source_git_mode_refused:${relative}:${gitMode}`);
      }
      return { path: relative, gitMode, objectId, fileType: 'regular' };
    })
    .sort((left, right) => codepointCompare(left.path, right.path));
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.path)) throw new Error(`community_source_git_index_path_ambiguous:${record.path}`);
    seen.add(record.path);
  }
  return records;
}

function captureRepositorySnapshot(checkout) {
  const objectFormat = gitObjectFormat(checkout);
  if (objectFormat !== 'sha1') {
    throw new Error(`community_source_github_sha1_required:observed=${objectFormat}`);
  }
  const head = runGit(checkout, ['rev-parse', 'HEAD']).trim();
  if (!GITHUB_SHA1_COMMIT.test(head)) throw new Error('community_source_commit_invalid');
  const indexBytes = runGitRaw(checkout, ['ls-files', '--stage', '-z']);
  const statusBytes = runGitRaw(checkout, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  return {
    objectFormat,
    head,
    indexBytes,
    indexDigest: sha256(indexBytes),
    statusBytes,
  };
}

function assertTerminalSnapshotUnchanged(start, terminal) {
  if (terminal.head !== start.head) throw new Error('community_source_checkout_head_changed');
  if (terminal.indexDigest !== start.indexDigest) throw new Error('community_source_checkout_index_changed');
  if (!terminal.statusBytes.equals(start.statusBytes)) throw new Error('community_source_checkout_status_changed');
}

function inspectCheckoutFiles(checkout, indexRecords, objectFormat) {
  return indexRecords.map((record) => {
    const absolute = path.join(checkout, ...record.path.split('/'));
    const stable = readStableRegularFile(absolute, record.path, 'community_source_checkout');
    const filesystemMode = gitModeFromStats(stable.stats);
    if (process.platform !== 'win32' && filesystemMode !== record.gitMode) {
      throw new Error(
        `community_source_checkout_mode_mismatch:${record.path}:index=${record.gitMode}:checkout=${filesystemMode}`,
      );
    }
    const observedObjectId = hashGitBlob(objectFormat, stable.content);
    if (observedObjectId !== record.objectId) {
      throw new Error(`community_source_checkout_git_object_mismatch:${record.path}`);
    }
    return { ...record, filesystemMode, absolute, content: stable.content };
  });
}

function normalizedRemote(value) {
  return value.trim().replace(/\/$/, '').replace(/\.git$/, '');
}

export function verifyCommunitySourceCheckout({
  candidateRoot,
  checkoutRoot,
  expectedCommit,
  expectedFileCount,
  expectedTreeDigest,
  beforeTerminalRecheck,
} = {}) {
  if (!checkoutRoot || !path.isAbsolute(checkoutRoot)) throw new Error('community_source_checkout_absolute_required');
  const checkout = path.resolve(checkoutRoot);
  const candidate = candidateRoot ? path.resolve(candidateRoot) : null;
  if (candidateRoot && !path.isAbsolute(candidateRoot)) throw new Error('community_source_candidate_absolute_required');
  if (candidate === checkout) throw new Error('community_source_roots_must_differ');

  const repository = runGit(checkout, ['remote', 'get-url', 'origin']).trim();
  if (normalizedRemote(repository) !== normalizedRemote(COMMUNITY_PUBLIC_GIT_URL)) {
    throw new Error(`community_source_repository_invalid:${repository}`);
  }
  const startSnapshot = captureRepositorySnapshot(checkout);
  const commit = startSnapshot.head;
  if (expectedCommit && commit !== expectedCommit) throw new Error(`community_source_commit_mismatch:${commit}`);
  const indexRecords = parseGitIndex(startSnapshot.indexBytes);
  if (startSnapshot.statusBytes.byteLength !== 0) throw new Error('community_source_checkout_dirty');
  const checkoutFiles = inspectCheckoutFiles(checkout, indexRecords, startSnapshot.objectFormat);

  const tracked = indexRecords.map((record) => record.path);
  const launcherPaths = Object.keys(CLONE_LAUNCHER_MODES);
  const presentLauncherPaths = launcherPaths.filter((relative) => tracked.includes(relative));
  if (presentLauncherPaths.length !== 0 && presentLauncherPaths.length !== launcherPaths.length) {
    throw new Error(`community_source_clone_launcher_set_incomplete:${presentLauncherPaths.join(',')}`);
  }
  if (presentLauncherPaths.length === launcherPaths.length) {
    const observedModes = new Map(indexRecords.map((record) => [record.path, record.gitMode]));
    for (const relative of launcherPaths) {
      if (observedModes.get(relative) !== CLONE_LAUNCHER_MODES[relative]) {
        throw new Error(
          `community_source_clone_launcher_mode_invalid:${relative}:${observedModes.get(relative) ?? 'missing'}`,
        );
      }
    }
  }
  if (expectedFileCount !== undefined && tracked.length !== expectedFileCount) {
    throw new Error(`community_source_file_count_mismatch:${tracked.length}`);
  }
  let candidateFiles;
  let candidateByPath;
  if (candidate) {
    candidateFiles = collectFiles(candidate).sort((left, right) => codepointCompare(left.path, right.path));
    const candidatePaths = candidateFiles.map((file) => file.path);
    if (JSON.stringify(tracked) !== JSON.stringify(candidatePaths)) {
      const trackedSet = new Set(tracked);
      const candidateSet = new Set(candidatePaths);
      const missing = candidatePaths.filter((file) => !trackedSet.has(file));
      const unexpected = tracked.filter((file) => !candidateSet.has(file));
      throw new Error(`community_source_file_set_mismatch:missing=${missing.join(',')}:unexpected=${unexpected.join(',')}`);
    }
    candidateByPath = new Map(candidateFiles.map((file) => [file.path, file]));
    for (const checkoutFile of checkoutFiles) {
      const candidateFile = candidateByPath.get(checkoutFile.path);
      if (process.platform !== 'win32' && candidateFile.gitMode !== checkoutFile.gitMode) {
        throw new Error(
          `community_source_candidate_mode_mismatch:${checkoutFile.path}:candidate=${candidateFile.gitMode}:checkout=${checkoutFile.gitMode}`,
        );
      }
      if (candidateFile.fileType !== checkoutFile.fileType) {
        throw new Error(`community_source_candidate_type_mismatch:${checkoutFile.path}`);
      }
    }
  }

  const files = checkoutFiles.map(({ path: relative, gitMode, fileType, content: checkoutContent }) => {
    const checkoutDigest = sha256Hex(checkoutContent);
    if (candidate) {
      const candidateContent = candidateByPath.get(relative).content;
      if (sha256Hex(candidateContent) !== checkoutDigest) throw new Error(`community_source_file_digest_mismatch:${relative}`);
    }
    return { path: relative, fileType, gitMode, byteLength: checkoutContent.byteLength, sha256: checkoutDigest };
  });
  const treeDigest = sha256(JSON.stringify(files));
  if (beforeTerminalRecheck !== undefined) {
    if (typeof beforeTerminalRecheck !== 'function') throw new Error('community_source_terminal_recheck_hook_invalid');
    beforeTerminalRecheck();
  }
  assertTerminalSnapshotUnchanged(startSnapshot, captureRepositorySnapshot(checkout));
  if (expectedTreeDigest && treeDigest !== expectedTreeDigest) {
    throw new Error(`community_source_tree_digest_mismatch:${treeDigest}`);
  }
  return {
    schemaVersion: 1,
    status: 'community-public-source-checkout-verified',
    repository: COMMUNITY_PUBLIC_GIT_URL,
    commit,
    indexDigest: startSnapshot.indexDigest,
    fileCount: files.length,
    treeDigest,
  };
}

function parseOptions(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') { options.json = true; continue; }
    if (!['--candidate-root', '--checkout-root', '--expected-commit', '--expected-file-count', '--expected-tree-digest'].includes(arg)) {
      throw new Error(`community_source_unknown_option:${arg}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`community_source_option_value_missing:${arg}`);
    options[arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
}

const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const result = verifyCommunitySourceCheckout({
      candidateRoot: options.candidateRoot ? path.resolve(options.candidateRoot) : undefined,
      checkoutRoot: path.resolve(options.checkoutRoot ?? ''),
      expectedCommit: options.expectedCommit,
      expectedFileCount: options.expectedFileCount === undefined ? undefined : Number(options.expectedFileCount),
      expectedTreeDigest: options.expectedTreeDigest,
    });
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.status}\n`);
  } catch (error) {
    process.stderr.write(`[community-source-checkout] ${error.message}\n`);
    process.exitCode = 1;
  }
}
