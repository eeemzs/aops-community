import { createHash, randomUUID } from 'node:crypto';
import { existsSync, linkSync, lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  COMMUNITY_IMAGE_PLATFORMS,
  COMMUNITY_IMAGE_REPOSITORY,
  COMMUNITY_PUBLIC_SOURCE_REPOSITORY,
} from './community-image-contract.mjs';

export const COMMUNITY_RELEASE_MANIFEST_PATH = 'release.json';
export const COMMUNITY_RELEASE_PROVENANCE_PATH = 'release.provenance.json';
export const COMMUNITY_RELEASE_SIGNATURE_PATH = 'release.sigstore.json';
export const COMMUNITY_GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SAFE_REF = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const codepointCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

const sha256 = (content) => `sha256:${createHash('sha256').update(content).digest('hex')}`;
const hashFile = (filePath) => sha256(readFileSync(filePath));
const digestHex = (digest) => digest.slice('sha256:'.length);
const toPosix = (value) => String(value).replace(/\\/g, '/');

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, actual.join(','));
}

function requireString(value, pattern, code) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(code);
}

function requireDigest(value, code) {
  requireString(value, SHA256, code);
}

function requireSafeRef(value, code) {
  requireString(value, SAFE_REF, code);
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => codepointCompare(left, right))
    .map(([key, nested]) => [key, stableJson(nested)]));
}

function relativeArtifactRef(artifactsRoot, filePath, code) {
  const root = path.resolve(artifactsRoot);
  const absolute = path.resolve(filePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail(code);
  const ref = toPosix(relative);
  requireSafeRef(ref, code);
  return ref;
}

function assertArtifactsRoot(artifactsRoot) {
  if (!path.isAbsolute(artifactsRoot)) fail('community_release_artifacts_root_absolute_required');
  if (!existsSync(artifactsRoot)) fail('community_release_artifacts_root_missing');
  const stat = lstatSync(artifactsRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('community_release_artifacts_root_invalid');
  return realpathSync.native(artifactsRoot);
}

function requireConfinedFile(artifactsRoot, filePath, code) {
  requireFile(filePath, code);
  const root = path.resolve(artifactsRoot);
  const realRoot = assertArtifactsRoot(root);
  const ref = relativeArtifactRef(root, filePath, `${code}_outside_root`);
  let cursor = root;
  for (const segment of ref.split('/')) {
    cursor = path.join(cursor, segment);
    if (lstatSync(cursor).isSymbolicLink()) fail(`${code}_symlink_forbidden`, ref);
  }
  const stat = lstatSync(filePath);
  if (!stat.isFile()) fail(`${code}_regular_file_required`, ref);
  const realFile = realpathSync.native(filePath);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) fail(`${code}_path_escape`, ref);
  return filePath;
}

function resolveArtifactRef(artifactsRoot, ref, code) {
  requireSafeRef(ref, code);
  const root = path.resolve(artifactsRoot);
  const absolute = path.resolve(root, ref);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail(code);
  return absolute;
}

function requireFile(filePath, code) {
  if (!existsSync(filePath)) fail(code, filePath);
}

function installReleasePair({ provenancePath, provenanceContent, manifestPath, manifestContent }) {
  const suffix = `${process.pid}-${randomUUID()}`;
  const provenanceTemp = `${provenancePath}.${suffix}.tmp`;
  const manifestTemp = `${manifestPath}.${suffix}.tmp`;
  let provenanceInstalled = false;
  let manifestInstalled = false;
  try {
    writeFileSync(provenanceTemp, provenanceContent, { flag: 'wx' });
    writeFileSync(manifestTemp, manifestContent, { flag: 'wx' });
    linkSync(provenanceTemp, provenancePath);
    provenanceInstalled = true;
    linkSync(manifestTemp, manifestPath);
    manifestInstalled = true;
  } catch (error) {
    if (manifestInstalled) rmSync(manifestPath, { force: true });
    if (provenanceInstalled) rmSync(provenancePath, { force: true });
    throw error;
  } finally {
    rmSync(manifestTemp, { force: true });
    rmSync(provenanceTemp, { force: true });
  }
}

export function computeCommunityMigrationSetDigest({ tags, files }) {
  return sha256(JSON.stringify(stableJson({ tags, files })));
}

export function createCommunityReleaseProvenance({
  releaseVersion,
  source,
  image,
  cli,
  compose,
  migrations,
  sbom,
  builder,
}) {
  exactObject(builder, ['id', 'invocationId'], 'community_release_builder_invalid');
  if (typeof builder.id !== 'string' || !builder.id) fail('community_release_builder_id_required');
  if (typeof builder.invocationId !== 'string' || !builder.invocationId) fail('community_release_invocation_id_required');
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [
      { name: `${image.repository}@${image.indexDigest}`, digest: { sha256: digestHex(image.indexDigest) } },
      { name: cli.artifactRef, digest: { sha256: digestHex(cli.artifactSha256) } },
      { name: compose.ref, digest: { sha256: digestHex(compose.sha256) } },
      { name: source.treeRef, digest: { sha256: digestHex(source.treeDigest) } },
      { name: sbom.ref, digest: { sha256: digestHex(sbom.sha256) } },
    ],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType: 'https://aops.dev/buildtypes/community-release/v1',
        externalParameters: {
          releaseVersion,
          image: {
            repository: image.repository,
            tag: image.tag,
            platforms: image.platforms.map(({ platform }) => platform),
          },
          migrationTags: migrations.tags,
        },
        resolvedDependencies: [{
          uri: source.repository,
          digest: {
            gitCommit: source.commit,
            sha256: digestHex(source.treeDigest),
          },
        }],
      },
      runDetails: {
        builder: { id: builder.id },
        metadata: { invocationId: builder.invocationId },
      },
    },
  };
}

export function validateCommunityReleaseProvenance(manifest, provenance) {
  if (provenance?._type !== 'https://in-toto.io/Statement/v1') fail('community_release_provenance_statement_type_invalid');
  if (provenance?.predicateType !== 'https://slsa.dev/provenance/v1') fail('community_release_provenance_predicate_type_invalid');
  const expectedSubjects = [
    { name: `${manifest.image.repository}@${manifest.image.indexDigest}`, digest: { sha256: digestHex(manifest.image.indexDigest) } },
    { name: manifest.cli.artifactRef, digest: { sha256: digestHex(manifest.cli.artifactSha256) } },
    { name: manifest.compose.ref, digest: { sha256: digestHex(manifest.compose.sha256) } },
    { name: manifest.source.treeRef, digest: { sha256: digestHex(manifest.source.treeDigest) } },
    { name: manifest.evidence.sbom.ref, digest: { sha256: digestHex(manifest.evidence.sbom.sha256) } },
  ];
  if (JSON.stringify(provenance.subject) !== JSON.stringify(expectedSubjects)) fail('community_release_provenance_subjects_mismatch');
  const definition = provenance?.predicate?.buildDefinition;
  if (definition?.buildType !== 'https://aops.dev/buildtypes/community-release/v1') fail('community_release_provenance_build_type_invalid');
  const external = definition?.externalParameters;
  const expectedExternal = {
    releaseVersion: manifest.releaseVersion,
    image: {
      repository: manifest.image.repository,
      tag: manifest.image.tag,
      platforms: manifest.image.platforms.map(({ platform }) => platform),
    },
    migrationTags: manifest.migrations.tags,
  };
  if (JSON.stringify(external) !== JSON.stringify(expectedExternal)) fail('community_release_provenance_parameters_mismatch');
  const dependencies = definition?.resolvedDependencies;
  const expectedDependencies = [{
    uri: manifest.source.repository,
    digest: {
      gitCommit: manifest.source.commit,
      sha256: digestHex(manifest.source.treeDigest),
    },
  }];
  if (JSON.stringify(dependencies) !== JSON.stringify(expectedDependencies)) fail('community_release_provenance_dependencies_mismatch');
  if (typeof provenance?.predicate?.runDetails?.builder?.id !== 'string' || !provenance.predicate.runDetails.builder.id) fail('community_release_provenance_builder_missing');
  if (typeof provenance?.predicate?.runDetails?.metadata?.invocationId !== 'string' || !provenance.predicate.runDetails.metadata.invocationId) fail('community_release_provenance_invocation_missing');
  return provenance;
}

export function validateCommunityReleaseManifest(manifest) {
  exactObject(manifest, ['schemaVersion', 'releaseVersion', 'source', 'image', 'cli', 'compose', 'migrations', 'evidence'], 'community_release_manifest_keys_invalid');
  if (manifest.schemaVersion !== 1) fail('community_release_schema_version_invalid');
  requireString(manifest.releaseVersion, SEMVER, 'community_release_version_invalid');

  exactObject(manifest.source, ['repository', 'commit', 'treeRef', 'treeDigest'], 'community_release_source_invalid');
  if (manifest.source.repository !== COMMUNITY_PUBLIC_SOURCE_REPOSITORY) fail('community_release_source_repository_invalid');
  requireString(manifest.source.commit, COMMIT, 'community_release_source_commit_invalid');
  requireSafeRef(manifest.source.treeRef, 'community_release_source_tree_ref_invalid');
  requireDigest(manifest.source.treeDigest, 'community_release_source_tree_digest_invalid');

  exactObject(manifest.image, ['repository', 'tag', 'indexDigest', 'platforms'], 'community_release_image_invalid');
  if (manifest.image.repository !== COMMUNITY_IMAGE_REPOSITORY) fail('community_release_image_repository_invalid');
  if (manifest.image.tag !== `v${manifest.releaseVersion}`) fail('community_release_image_tag_invalid');
  requireDigest(manifest.image.indexDigest, 'community_release_image_index_digest_invalid');
  if (!Array.isArray(manifest.image.platforms) || manifest.image.platforms.length !== COMMUNITY_IMAGE_PLATFORMS.length) fail('community_release_platforms_invalid');
  const platforms = manifest.image.platforms.map((entry) => {
    exactObject(entry, ['platform', 'digest'], 'community_release_platform_entry_invalid');
    requireDigest(entry.digest, 'community_release_platform_digest_invalid');
    return entry.platform;
  });
  if (JSON.stringify(platforms) !== JSON.stringify(COMMUNITY_IMAGE_PLATFORMS)) fail('community_release_platform_order_invalid');

  exactObject(manifest.cli, ['packageName', 'version', 'artifactRef', 'artifactSha256'], 'community_release_cli_invalid');
  if (manifest.cli.packageName !== '@aops/aops-cli') fail('community_release_cli_package_invalid');
  requireString(manifest.cli.version, SEMVER, 'community_release_cli_version_invalid');
  requireSafeRef(manifest.cli.artifactRef, 'community_release_cli_ref_invalid');
  requireDigest(manifest.cli.artifactSha256, 'community_release_cli_digest_invalid');

  exactObject(manifest.compose, ['ref', 'sha256'], 'community_release_compose_invalid');
  requireSafeRef(manifest.compose.ref, 'community_release_compose_ref_invalid');
  requireDigest(manifest.compose.sha256, 'community_release_compose_digest_invalid');

  exactObject(manifest.migrations, ['setDigest', 'tags', 'files'], 'community_release_migrations_invalid');
  if (!Array.isArray(manifest.migrations.tags) || manifest.migrations.tags.some((tag) => typeof tag !== 'string' || !tag)) fail('community_release_migration_tags_invalid');
  if (JSON.stringify(manifest.migrations.tags) !== JSON.stringify([...new Set(manifest.migrations.tags)].sort())) fail('community_release_migration_tag_order_invalid');
  if (!Array.isArray(manifest.migrations.files)) fail('community_release_migration_files_invalid');
  const migrationRefs = manifest.migrations.files.map((entry) => {
    exactObject(entry, ['ref', 'sha256'], 'community_release_migration_file_invalid');
    requireSafeRef(entry.ref, 'community_release_migration_ref_invalid');
    requireDigest(entry.sha256, 'community_release_migration_digest_invalid');
    return entry.ref;
  });
  if (JSON.stringify(migrationRefs) !== JSON.stringify([...new Set(migrationRefs)].sort())) fail('community_release_migration_file_order_invalid');
  requireDigest(manifest.migrations.setDigest, 'community_release_migration_set_digest_invalid');
  if (manifest.migrations.setDigest !== computeCommunityMigrationSetDigest(manifest.migrations)) fail('community_release_migration_set_digest_mismatch');

  exactObject(manifest.evidence, ['sbom', 'provenance', 'signature'], 'community_release_evidence_invalid');
  for (const [kind, entry] of [['sbom', manifest.evidence.sbom], ['provenance', manifest.evidence.provenance]]) {
    exactObject(entry, ['ref', 'sha256'], `community_release_${kind}_invalid`);
    requireSafeRef(entry.ref, `community_release_${kind}_ref_invalid`);
    requireDigest(entry.sha256, `community_release_${kind}_digest_invalid`);
  }
  exactObject(manifest.evidence.signature, ['bundleRef'], 'community_release_signature_invalid');
  requireSafeRef(manifest.evidence.signature.bundleRef, 'community_release_signature_ref_invalid');
  return manifest;
}

export function writeCommunityReleaseManifest({
  artifactsRoot,
  outputPath = path.join(artifactsRoot, COMMUNITY_RELEASE_MANIFEST_PATH),
  releaseVersion,
  source,
  image,
  cli,
  composePath,
  migrations,
  sbomPath,
  provenancePath = path.join(artifactsRoot, COMMUNITY_RELEASE_PROVENANCE_PATH),
  signatureBundlePath = path.join(artifactsRoot, COMMUNITY_RELEASE_SIGNATURE_PATH),
  builder,
}) {
  assertArtifactsRoot(artifactsRoot);
  const outputRef = relativeArtifactRef(artifactsRoot, outputPath, 'community_release_manifest_outside_root');
  if (outputRef !== COMMUNITY_RELEASE_MANIFEST_PATH) fail('community_release_manifest_path_invalid');
  if (relativeArtifactRef(artifactsRoot, provenancePath, 'community_release_provenance_outside_root') !== COMMUNITY_RELEASE_PROVENANCE_PATH) fail('community_release_provenance_path_invalid');
  if (relativeArtifactRef(artifactsRoot, signatureBundlePath, 'community_release_signature_outside_root') !== COMMUNITY_RELEASE_SIGNATURE_PATH) fail('community_release_signature_path_invalid');
  if (!migrations || !Array.isArray(migrations.paths) || !Array.isArray(migrations.tags)) fail('community_release_migrations_input_invalid');
  for (const [filePath, code] of [
    [source.treeManifestPath, 'community_release_source_tree_missing'],
    [cli.artifactPath, 'community_release_cli_artifact_missing'],
    [composePath, 'community_release_compose_missing'],
    [sbomPath, 'community_release_sbom_missing'],
    ...migrations.paths.map((filePath) => [filePath, 'community_release_migration_missing']),
  ]) requireConfinedFile(artifactsRoot, filePath, code);
  if (existsSync(outputPath)) fail('community_release_manifest_already_exists');
  if (existsSync(provenancePath)) fail('community_release_provenance_already_exists');

  const sourceRecord = {
    repository: source.repository,
    commit: source.commit,
    treeRef: relativeArtifactRef(artifactsRoot, source.treeManifestPath, 'community_release_source_tree_outside_root'),
    treeDigest: hashFile(source.treeManifestPath),
  };
  const imageRecord = {
    repository: image.repository,
    tag: image.tag,
    indexDigest: image.indexDigest,
    platforms: image.platforms.map((entry) => ({ platform: entry.platform, digest: entry.digest })),
  };
  const cliRecord = {
    packageName: '@aops/aops-cli',
    version: cli.version,
    artifactRef: relativeArtifactRef(artifactsRoot, cli.artifactPath, 'community_release_cli_outside_root'),
    artifactSha256: hashFile(cli.artifactPath),
  };
  const composeRecord = {
    ref: relativeArtifactRef(artifactsRoot, composePath, 'community_release_compose_outside_root'),
    sha256: hashFile(composePath),
  };
  const migrationFiles = migrations.paths
    .map((filePath) => ({
      ref: relativeArtifactRef(artifactsRoot, filePath, 'community_release_migration_outside_root'),
      sha256: hashFile(filePath),
    }))
    .sort((left, right) => codepointCompare(left.ref, right.ref));
  const migrationRecord = {
    setDigest: '',
    tags: [...new Set(migrations.tags)].sort(),
    files: migrationFiles,
  };
  migrationRecord.setDigest = computeCommunityMigrationSetDigest(migrationRecord);
  const sbomRecord = {
    ref: relativeArtifactRef(artifactsRoot, sbomPath, 'community_release_sbom_outside_root'),
    sha256: hashFile(sbomPath),
  };
  const provenance = createCommunityReleaseProvenance({
    releaseVersion,
    source: sourceRecord,
    image: imageRecord,
    cli: cliRecord,
    compose: composeRecord,
    migrations: migrationRecord,
    sbom: sbomRecord,
    builder,
  });
  const provenanceContent = `${JSON.stringify(provenance, null, 2)}\n`;
  const manifest = {
    schemaVersion: 1,
    releaseVersion,
    source: sourceRecord,
    image: imageRecord,
    cli: cliRecord,
    compose: composeRecord,
    migrations: migrationRecord,
    evidence: {
      sbom: sbomRecord,
      provenance: {
        ref: relativeArtifactRef(artifactsRoot, provenancePath, 'community_release_provenance_outside_root'),
        sha256: sha256(provenanceContent),
      },
      signature: {
        bundleRef: relativeArtifactRef(artifactsRoot, signatureBundlePath, 'community_release_signature_outside_root'),
      },
    },
  };
  validateCommunityReleaseManifest(manifest);
  validateCommunityReleaseProvenance(manifest, provenance);
  installReleasePair({
    provenancePath,
    provenanceContent,
    manifestPath: outputPath,
    manifestContent: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  return manifest;
}

export function verifyCommunityReleaseArtifacts({ manifestPath, artifactsRoot = path.dirname(manifestPath), requireSignatureBundle = true }) {
  requireConfinedFile(artifactsRoot, manifestPath, 'community_release_manifest');
  const manifest = validateCommunityReleaseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  const hashed = [
    [manifest.source.treeRef, manifest.source.treeDigest, 'source-tree'],
    [manifest.cli.artifactRef, manifest.cli.artifactSha256, 'cli'],
    [manifest.compose.ref, manifest.compose.sha256, 'compose'],
    ...manifest.migrations.files.map((entry) => [entry.ref, entry.sha256, 'migration']),
    [manifest.evidence.sbom.ref, manifest.evidence.sbom.sha256, 'sbom'],
    [manifest.evidence.provenance.ref, manifest.evidence.provenance.sha256, 'provenance'],
  ];
  for (const [ref, expected, kind] of hashed) {
    const artifactPath = resolveArtifactRef(artifactsRoot, ref, `community_release_${kind}_ref_invalid`);
    requireConfinedFile(artifactsRoot, artifactPath, `community_release_${kind}`);
    if (hashFile(artifactPath) !== expected) fail(`community_release_${kind}_digest_mismatch`, ref);
  }
  const provenancePath = resolveArtifactRef(artifactsRoot, manifest.evidence.provenance.ref, 'community_release_provenance_ref_invalid');
  let provenance;
  try {
    provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  } catch {
    fail('community_release_provenance_json_invalid');
  }
  validateCommunityReleaseProvenance(manifest, provenance);
  const bundlePath = resolveArtifactRef(artifactsRoot, manifest.evidence.signature.bundleRef, 'community_release_signature_ref_invalid');
  if (requireSignatureBundle) requireConfinedFile(artifactsRoot, bundlePath, 'community_release_signature_bundle');
  return { manifest, bundlePath };
}

function runCosign(args, { cosignPath = 'cosign', runner = spawnSync } = {}) {
  const result = runner(cosignPath, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result?.error) fail('community_release_cosign_execution_failed', result.error.message);
  if (result?.status !== 0) fail('community_release_cosign_failed', String(result?.stderr ?? '').trim());
  return result;
}

export function signCommunityReleaseManifest({ manifestPath, artifactsRoot = path.dirname(manifestPath), env = process.env, cosignPath, runner } = {}) {
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) fail('community_release_github_oidc_required');
  const { bundlePath } = verifyCommunityReleaseArtifacts({ manifestPath, artifactsRoot, requireSignatureBundle: false });
  if (existsSync(bundlePath)) fail('community_release_signature_bundle_already_exists');
  runCosign(['sign-blob', '--yes', '--bundle', bundlePath, manifestPath], { cosignPath, runner });
  requireConfinedFile(artifactsRoot, bundlePath, 'community_release_signature_bundle_after_sign');
  return { status: 'community-release-manifest-signed', manifestPath, bundlePath };
}

export function verifyCommunityReleaseSignature({
  manifestPath,
  artifactsRoot = path.dirname(manifestPath),
  certificateIdentity,
  certificateOidcIssuer,
  cosignPath,
  runner,
} = {}) {
  if (typeof certificateIdentity !== 'string' || !certificateIdentity) fail('community_release_trusted_identity_required');
  if (typeof certificateOidcIssuer !== 'string' || !certificateOidcIssuer) fail('community_release_trusted_oidc_issuer_required');
  const { bundlePath } = verifyCommunityReleaseArtifacts({ manifestPath, artifactsRoot });
  runCosign([
    'verify-blob', manifestPath,
    '--bundle', bundlePath,
    '--certificate-identity', certificateIdentity,
    '--certificate-oidc-issuer', certificateOidcIssuer,
  ], { cosignPath, runner });
  return { status: 'community-release-manifest-verified', manifestPath, bundlePath };
}
