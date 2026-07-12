import { createHash } from 'node:crypto';

import { codepointCompare } from './community-codepoint-compare.mjs';

export const COMMUNITY_IMAGE_CONTRACT_ID = 'aops-community-image-contract-v1';
export const COMMUNITY_IMAGE_REPOSITORY = 'ghcr.io/aopslab/aops-community';
export const COMMUNITY_PUBLIC_SOURCE_REPOSITORY = 'git+https://github.com/eeemzs/aops-community';
export const COMMUNITY_IMAGE_PLATFORMS = Object.freeze(['linux/amd64', 'linux/arm64']);
export const COMMUNITY_IMAGE_SOURCE_DATE_EPOCH = '0';
export const COMMUNITY_RELEASE_SCHEMA_PATH = 'deploy/community/release.schema.json';
export const COMMUNITY_DOCKER_BAKE_PATH = 'docker-bake.hcl';

const SHA256_PATTERN = '^sha256:[a-f0-9]{64}$';
const SEMVER_PATTERN = '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$';
const SAFE_ARTIFACT_REF_PATTERN = '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[A-Za-z0-9._/-]+$';
const sha256 = (content) => `sha256:${createHash('sha256').update(content).digest('hex')}`;

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => codepointCompare(left, right))
      .map(([key, nested]) => [key, stableObject(nested)]),
  );
}

export function createCommunityReleaseSchema() {
  const digest = { type: 'string', pattern: SHA256_PATTERN };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://aops.local/schemas/community-release-v1.json',
    title: 'AOPS Community release manifest',
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'releaseVersion', 'source', 'image', 'cli', 'compose', 'migrations', 'evidence'],
    properties: {
      schemaVersion: { const: 1 },
      releaseVersion: { type: 'string', pattern: SEMVER_PATTERN },
      source: {
        type: 'object',
        additionalProperties: false,
        required: ['repository', 'commit', 'treeRef', 'treeDigest'],
        properties: {
          repository: { const: COMMUNITY_PUBLIC_SOURCE_REPOSITORY },
          commit: { type: 'string', pattern: '^[a-f0-9]{40}$' },
          treeRef: { type: 'string', pattern: SAFE_ARTIFACT_REF_PATTERN },
          treeDigest: digest,
        },
      },
      image: {
        type: 'object',
        additionalProperties: false,
        required: ['repository', 'tag', 'indexDigest', 'platforms'],
        properties: {
          repository: { const: COMMUNITY_IMAGE_REPOSITORY },
          tag: { type: 'string', pattern: '^v\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$' },
          indexDigest: digest,
          platforms: {
            type: 'array',
            minItems: COMMUNITY_IMAGE_PLATFORMS.length,
            maxItems: COMMUNITY_IMAGE_PLATFORMS.length,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['platform', 'digest'],
              properties: {
                platform: { enum: [...COMMUNITY_IMAGE_PLATFORMS] },
                digest,
              },
            },
          },
        },
      },
      cli: {
        type: 'object',
        additionalProperties: false,
        required: ['packageName', 'version', 'artifactRef', 'artifactSha256'],
        properties: {
          packageName: { const: '@aops/aops-cli' },
          version: { type: 'string', pattern: SEMVER_PATTERN },
          artifactRef: { type: 'string', pattern: SAFE_ARTIFACT_REF_PATTERN },
          artifactSha256: digest,
        },
      },
      compose: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'sha256'],
        properties: {
          ref: { type: 'string', pattern: SAFE_ARTIFACT_REF_PATTERN },
          sha256: digest,
        },
      },
      migrations: {
        type: 'object',
        additionalProperties: false,
        required: ['setDigest', 'tags', 'files'],
        properties: {
          setDigest: digest,
          tags: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
          files: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['ref', 'sha256'],
              properties: {
                ref: { type: 'string', pattern: SAFE_ARTIFACT_REF_PATTERN },
                sha256: digest,
              },
            },
          },
        },
      },
      evidence: {
        type: 'object',
        additionalProperties: false,
        required: ['sbom', 'provenance', 'signature'],
        properties: {
          sbom: {
            type: 'object',
            additionalProperties: false,
            required: ['ref', 'sha256'],
            properties: {
              ref: { type: 'string', pattern: SAFE_ARTIFACT_REF_PATTERN },
              sha256: digest,
            },
          },
          provenance: {
            type: 'object',
            additionalProperties: false,
            required: ['ref', 'sha256'],
            properties: {
              ref: { type: 'string', pattern: SAFE_ARTIFACT_REF_PATTERN },
              sha256: digest,
            },
          },
          signature: {
            type: 'object',
            additionalProperties: false,
            required: ['bundleRef'],
            properties: {
              bundleRef: { type: 'string', pattern: SAFE_ARTIFACT_REF_PATTERN },
            },
          },
        },
      },
    },
  };
}

export function renderCommunityDockerBake() {
  const platforms = COMMUNITY_IMAGE_PLATFORMS.map((platform) => `    ${JSON.stringify(platform)},`).join('\n');
  return `variable "IMAGE_NAME" {
  default = "${COMMUNITY_IMAGE_REPOSITORY}"
}

variable "IMAGE_TAG" {
  default = "dev"
}

variable "SOURCE_DATE_EPOCH" {
  default = "${COMMUNITY_IMAGE_SOURCE_DATE_EPOCH}"
}

target "community" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms = [
${platforms}
  ]
  tags = ["\${IMAGE_NAME}:\${IMAGE_TAG}"]
  args = {
    BUILDKIT_MULTI_PLATFORM = "1"
    SOURCE_DATE_EPOCH       = "\${SOURCE_DATE_EPOCH}"
  }
  # Keep attestations detached from this index: Buildx attestation manifests
  # carry invocation metadata and would make the top-level runtime digest vary.
  # release.json binds the separately signed SBOM and provenance references.
  attest = [
    "type=provenance,disabled=true",
    "type=sbom,disabled=true",
  ]
  output = [
    "type=oci,dest=dist/aops-community-\${IMAGE_TAG}.oci,tar=false,oci-mediatypes=true,rewrite-timestamp=true",
  ]
}
`;
}

function generatedFile(targetPath, content, action) {
  return {
    targetPath,
    action,
    provenance: 'generated',
    byteLength: Buffer.byteLength(content),
    sha256: sha256(content),
    content,
  };
}

export function createCommunityImageContractOverlay() {
  const releaseSchema = createCommunityReleaseSchema();
  const releaseSchemaContent = `${JSON.stringify(releaseSchema, null, 2)}\n`;
  const bakeContent = renderCommunityDockerBake();
  const files = [
    generatedFile(COMMUNITY_DOCKER_BAKE_PATH, bakeContent, 'generate-reproducible-multiarch-bake-contract'),
    generatedFile(COMMUNITY_RELEASE_SCHEMA_PATH, releaseSchemaContent, 'generate-release-manifest-schema'),
  ];
  const digestPayload = stableObject({
    id: COMMUNITY_IMAGE_CONTRACT_ID,
    imageRepository: COMMUNITY_IMAGE_REPOSITORY,
    platforms: COMMUNITY_IMAGE_PLATFORMS,
    sourceDateEpoch: COMMUNITY_IMAGE_SOURCE_DATE_EPOCH,
    evidenceMode: 'detached-signed-sbom-and-provenance',
    files: files.map(({ content: _content, ...metadata }) => metadata),
  });
  return {
    schemaVersion: 1,
    id: COMMUNITY_IMAGE_CONTRACT_ID,
    status: 'community-image-contract-ready',
    releaseSafe: false,
    candidateReady: false,
    imageRepository: COMMUNITY_IMAGE_REPOSITORY,
    platforms: [...COMMUNITY_IMAGE_PLATFORMS],
    sourceDateEpoch: COMMUNITY_IMAGE_SOURCE_DATE_EPOCH,
    evidenceMode: 'detached-signed-sbom-and-provenance',
    files,
    planDigest: sha256(JSON.stringify(digestPayload)),
    blockers: [
      'community-multiarch-double-build-digest-proof-pending',
      'community-registry-push-and-signature-pending',
      'community-license-decision-deferred',
    ],
  };
}
