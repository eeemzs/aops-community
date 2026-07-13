#!/usr/bin/env node

import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { codepointCompare } from './community-codepoint-compare.mjs';
import { verifyCommunityReleaseArtifacts } from './community-release-manifest.mjs';
import { COMMUNITY_PUBLIC_GIT_URL, verifyCommunitySourceCheckout } from './community-source-checkout.mjs';

const SEMVER_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const toPosix = (value) => value.split(path.sep).join('/');

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function runGit(checkoutRoot, args) {
  const result = spawnSync('git', ['-C', checkoutRoot, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().slice(-2000);
    fail('community_release_packaging_git_failed', `${args.join(' ')}:${result.status}:${result.error?.message ?? detail}`);
  }
  return String(result.stdout ?? '').trim();
}

function requireAbsoluteDirectory(value, code) {
  if (!value || !path.isAbsolute(value)) fail(`${code}_absolute_required`);
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) fail(`${code}_missing`);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${code}_invalid`);
  return realpathSync.native(resolved);
}

function collectRegularFiles(root, current = root, output = []) {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => codepointCompare(left.name, right.name))) {
    const absolute = path.join(current, entry.name);
    const relative = toPosix(path.relative(root, absolute));
    const stat = lstatSync(absolute);
    if (entry.isSymbolicLink() || stat.isSymbolicLink()) fail('community_release_packaging_symlink_forbidden', relative);
    if (entry.isDirectory()) collectRegularFiles(root, absolute, output);
    else if (entry.isFile()) output.push(relative);
    else fail('community_release_packaging_special_file_forbidden', relative);
  }
  return output.sort(codepointCompare);
}

function expectedBundleFiles(manifest) {
  const expected = [
    'release.json',
    manifest.source.treeRef,
    manifest.cli.artifactRef,
    manifest.compose.ref,
    ...manifest.migrations.files.map((entry) => entry.ref),
    manifest.legal.license.ref,
    manifest.legal.notice.ref,
    manifest.legal.thirdPartyNotices.ref,
    manifest.legal.thirdPartyInventory.ref,
    manifest.evidence.sbom.ref,
    manifest.evidence.provenance.ref,
    manifest.evidence.signature.bundleRef,
  ];
  if (manifest.source.treeRef !== 'source.SHA256SUMS') fail('community_release_packaging_source_manifest_ref_invalid');
  if (manifest.cli.artifactRef !== `aopslab-aops-cli-${manifest.releaseVersion}.tgz`) fail('community_release_packaging_cli_ref_invalid');
  if (manifest.compose.ref !== 'compose.yaml') fail('community_release_packaging_compose_ref_invalid');
  if (manifest.legal.license.ref !== 'LICENSE') fail('community_release_packaging_license_ref_invalid');
  if (manifest.legal.notice.ref !== 'NOTICE') fail('community_release_packaging_notice_ref_invalid');
  if (manifest.legal.thirdPartyNotices.ref !== 'THIRD_PARTY_NOTICES') fail('community_release_packaging_third_party_notices_ref_invalid');
  if (manifest.legal.thirdPartyInventory.ref !== 'THIRD_PARTY_NOTICES.inventory.json') fail('community_release_packaging_third_party_inventory_ref_invalid');
  if (manifest.evidence.sbom.ref !== 'SBOM.spdx.json') fail('community_release_packaging_sbom_ref_invalid');
  if (manifest.evidence.provenance.ref !== 'release.provenance.json') fail('community_release_packaging_provenance_ref_invalid');
  if (manifest.evidence.signature.bundleRef !== 'release.sigstore.json') fail('community_release_packaging_signature_ref_invalid');
  if (manifest.migrations.files.length === 0 || manifest.migrations.files.some(({ ref }) => !ref.startsWith('migrations/'))) {
    fail('community_release_packaging_migration_refs_invalid');
  }
  const unique = [...new Set(expected)].sort(codepointCompare);
  if (unique.length !== expected.length) fail('community_release_packaging_duplicate_ref');
  return unique;
}

function assertExactFiles(actual, expected, code) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((entry) => !actualSet.has(entry));
  const unexpected = actual.filter((entry) => !expectedSet.has(entry));
  fail(code, `missing=${missing.join(',')}:unexpected=${unexpected.join(',')}`);
}

function readBundle(bundleRoot) {
  const root = requireAbsoluteDirectory(bundleRoot, 'community_release_packaging_bundle_root');
  const manifestPath = path.join(root, 'release.json');
  const { manifest } = verifyCommunityReleaseArtifacts({ manifestPath, artifactsRoot: root });
  const expected = expectedBundleFiles(manifest);
  assertExactFiles(collectRegularFiles(root), expected, 'community_release_packaging_bundle_inventory_mismatch');
  return { root, manifest, expected };
}

function advisoryReadme(manifest) {
  return `# AOPS Community v${manifest.releaseVersion} release bundle\n\n`+
    `This directory was added by the operator-mediated packaging commit. Its parent source commit is \`${manifest.source.commit}\`.\n\n`+
    'The signed `release.json` digest graph is authoritative for release artifacts. This README is advisory and is not covered by that graph. Do not edit files in this directory.\n';
}

function assertOnlyReleaseWorktreeChanges(checkoutRoot) {
  const records = runGit(checkoutRoot, ['status', '--porcelain', '-z', '--untracked-files=all']).split('\0').filter(Boolean);
  if (records.length === 0) fail('community_release_packaging_release_changes_missing');
  for (const record of records) {
    if (!record.startsWith('?? release/')) fail('community_release_packaging_non_release_worktree_change', record);
  }
}

export function stageCommunityReleasePackaging({ checkoutRoot, bundleRoot, apply = false, confirm } = {}) {
  const checkout = requireAbsoluteDirectory(checkoutRoot, 'community_release_packaging_checkout_root');
  const bundle = readBundle(bundleRoot);
  verifyCommunitySourceCheckout({ checkoutRoot: checkout, expectedCommit: bundle.manifest.source.commit });
  const releaseRoot = path.join(checkout, 'release');
  if (existsSync(releaseRoot)) fail('community_release_packaging_release_directory_exists');
  const result = {
    schemaVersion: 1,
    status: apply ? 'community-release-packaging-staged' : 'community-release-packaging-preview',
    releaseVersion: bundle.manifest.releaseVersion,
    sourceCommit: bundle.manifest.source.commit,
    checkoutRoot: checkout,
    releaseRoot,
    files: [...bundle.expected, 'README.md'].sort(codepointCompare).map((entry) => `release/${entry}`),
  };
  if (!apply) return result;
  if (confirm !== `stage-v${bundle.manifest.releaseVersion}`) fail('community_release_packaging_confirmation_required');
  mkdirSync(releaseRoot, { recursive: false });
  try {
    for (const relative of bundle.expected) {
      const destination = path.join(releaseRoot, ...relative.split('/'));
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(path.join(bundle.root, ...relative.split('/')), destination, constants.COPYFILE_EXCL);
    }
    writeFileSync(path.join(releaseRoot, 'README.md'), advisoryReadme(bundle.manifest), { flag: 'wx' });
    assertOnlyReleaseWorktreeChanges(checkout);
    assertExactFiles(
      collectRegularFiles(releaseRoot),
      [...bundle.expected, 'README.md'].sort(codepointCompare),
      'community_release_packaging_staged_inventory_mismatch',
    );
    verifyCommunityReleaseArtifacts({ manifestPath: path.join(releaseRoot, 'release.json'), artifactsRoot: releaseRoot });
  } catch (error) {
    rmSync(releaseRoot, { recursive: true, force: true });
    throw error;
  }
  return result;
}

function normalizedRemote(value) {
  return value.trim().replace(/\/$/, '').replace(/\.git$/, '');
}

export function verifyCommunityReleasePackagingCommit({ checkoutRoot, expectedTag } = {}) {
  const checkout = requireAbsoluteDirectory(checkoutRoot, 'community_release_packaging_checkout_root');
  if (runGit(checkout, ['status', '--porcelain'])) fail('community_release_packaging_checkout_dirty');
  const repository = runGit(checkout, ['remote', 'get-url', 'origin']);
  if (normalizedRemote(repository) !== normalizedRemote(COMMUNITY_PUBLIC_GIT_URL)) fail('community_release_packaging_repository_invalid', repository);
  const releaseRoot = requireAbsoluteDirectory(path.join(checkout, 'release'), 'community_release_packaging_release_root');
  const { manifest } = verifyCommunityReleaseArtifacts({ manifestPath: path.join(releaseRoot, 'release.json'), artifactsRoot: releaseRoot });
  const head = runGit(checkout, ['rev-parse', 'HEAD']);
  const parents = runGit(checkout, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(/\s+/);
  if (parents.length !== 2 || parents[0] !== head) fail('community_release_packaging_single_parent_required');
  if (parents[1] !== manifest.source.commit) fail('community_release_packaging_parent_source_mismatch', `parent=${parents[1]}:source=${manifest.source.commit}`);
  const changes = runGit(checkout, ['diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD'])
    .split(/\r?\n/).filter(Boolean).map((line) => line.split('\t'));
  if (changes.length === 0 || changes.some(([status, relative]) => status !== 'A' || !relative?.startsWith('release/'))) {
    fail('community_release_packaging_commit_not_additive_only');
  }
  const expectedTree = [...expectedBundleFiles(manifest), 'README.md'].sort(codepointCompare).map((entry) => `release/${entry}`);
  assertExactFiles(
    runGit(checkout, ['ls-tree', '-r', '--name-only', 'HEAD', 'release']).split(/\r?\n/).filter(Boolean).sort(codepointCompare),
    expectedTree,
    'community_release_packaging_commit_inventory_mismatch',
  );
  if (expectedTag !== undefined) {
    if (!SEMVER_TAG.test(expectedTag) || expectedTag !== `v${manifest.releaseVersion}`) fail('community_release_packaging_tag_invalid');
    if (runGit(checkout, ['cat-file', '-t', `refs/tags/${expectedTag}`]) !== 'tag') fail('community_release_packaging_annotated_tag_required');
    if (runGit(checkout, ['rev-parse', `refs/tags/${expectedTag}^{commit}`]) !== head) fail('community_release_packaging_tag_target_mismatch');
  }
  return {
    schemaVersion: 1,
    status: 'community-release-packaging-commit-verified',
    releaseVersion: manifest.releaseVersion,
    tag: expectedTag ?? null,
    packagingCommit: head,
    sourceCommit: parents[1],
    fileCount: expectedTree.length,
  };
}

function parseOptions(argv) {
  const command = argv[0];
  if (!['stage', 'verify-commit'].includes(command)) fail('community_release_packaging_command_required');
  const options = { command, apply: false, json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') { options.apply = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (!['--checkout-root', '--bundle-root', '--confirm', '--expected-tag'].includes(arg)) fail('community_release_packaging_unknown_option', arg);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('community_release_packaging_option_value_missing', arg);
    options[arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
}

const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const result = options.command === 'stage'
      ? stageCommunityReleasePackaging({
        checkoutRoot: path.resolve(options.checkoutRoot ?? ''),
        bundleRoot: path.resolve(options.bundleRoot ?? ''),
        apply: options.apply,
        confirm: options.confirm,
      })
      : verifyCommunityReleasePackagingCommit({
        checkoutRoot: path.resolve(options.checkoutRoot ?? ''),
        expectedTag: options.expectedTag,
      });
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.status}\n`);
  } catch (error) {
    process.stderr.write(`[community-release-packaging] ${error.message}\n`);
    process.exitCode = 1;
  }
}
