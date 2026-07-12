#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { codepointCompare } from './community-codepoint-compare.mjs';

export const COMMUNITY_PUBLIC_GIT_URL = 'https://github.com/eeemzs/aops-community.git';

const COMMIT = /^[a-f0-9]{40}$/;
const sha256Hex = (content) => createHash('sha256').update(content).digest('hex');
const sha256 = (content) => `sha256:${sha256Hex(content)}`;

function runGit(checkoutRoot, args) {
  const result = spawnSync('git', ['-C', checkoutRoot, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().slice(-2000);
    throw new Error(`community_source_git_failed:${args.join(' ')}:${result.status}:${result.error?.message ?? detail}`);
  }
  return String(result.stdout ?? '');
}

function collectFiles(root, current = root, output = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) throw new Error(`community_source_symlink_refused:${relative}`);
    if (stats.isDirectory()) collectFiles(root, absolute, output);
    else if (stats.isFile()) output.push(relative);
    else throw new Error(`community_source_special_file_refused:${relative}`);
  }
  return output;
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
  const commit = runGit(checkout, ['rev-parse', 'HEAD']).trim();
  if (!COMMIT.test(commit)) throw new Error('community_source_commit_invalid');
  if (expectedCommit && commit !== expectedCommit) throw new Error(`community_source_commit_mismatch:${commit}`);
  if (runGit(checkout, ['status', '--porcelain']).trim()) throw new Error('community_source_checkout_dirty');

  const tracked = runGit(checkout, ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .sort(codepointCompare);
  if (expectedFileCount !== undefined && tracked.length !== expectedFileCount) {
    throw new Error(`community_source_file_count_mismatch:${tracked.length}`);
  }
  if (candidate) {
    const candidateFiles = collectFiles(candidate).sort(codepointCompare);
    if (JSON.stringify(tracked) !== JSON.stringify(candidateFiles)) {
      const trackedSet = new Set(tracked);
      const candidateSet = new Set(candidateFiles);
      const missing = candidateFiles.filter((file) => !trackedSet.has(file));
      const unexpected = tracked.filter((file) => !candidateSet.has(file));
      throw new Error(`community_source_file_set_mismatch:missing=${missing.join(',')}:unexpected=${unexpected.join(',')}`);
    }
  }

  const files = tracked.map((relative) => {
    const checkoutContent = readFileSync(path.join(checkout, ...relative.split('/')));
    const checkoutDigest = sha256Hex(checkoutContent);
    if (candidate) {
      const candidateContent = readFileSync(path.join(candidate, ...relative.split('/')));
      if (sha256Hex(candidateContent) !== checkoutDigest) throw new Error(`community_source_file_digest_mismatch:${relative}`);
    }
    return { path: relative, byteLength: checkoutContent.byteLength, sha256: checkoutDigest };
  });
  const treeDigest = sha256(JSON.stringify(files));
  if (expectedTreeDigest && treeDigest !== expectedTreeDigest) {
    throw new Error(`community_source_tree_digest_mismatch:${treeDigest}`);
  }
  return {
    schemaVersion: 1,
    status: 'community-public-source-checkout-verified',
    repository: COMMUNITY_PUBLIC_GIT_URL,
    commit,
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
