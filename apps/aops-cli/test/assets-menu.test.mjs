import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createDefaultAgentAssetsCommandRunner } from '../dist/commands/assets.js'
import { createSetupAgentAssetsProvider } from '../dist/lib/setup-agent-assets-bridge.js'
import { resolveBundledAgentAssetsReleaseV1 } from '../dist/lib/setup-agent-assets-release.js'
import { resolveSetupOfficialCatalogReleaseV1 } from '../dist/lib/setup-official-catalog-bridge.js'
import { loadAopsInstallSkill } from '../dist/lib/setup-install-guide.js'
import { removeAopsGatewayPointers } from '../dist/lib/agent-assets/legacy-pointer-migration.js'
import { windowsQualificationSupportsRuntime } from '../dist/lib/agent-assets/native-fs.js'
import { resolveAgentAssetTargetSelection } from '../dist/lib/agent-assets/runtime-targets.js'
import {
  COMMUNITY_AGENT_ASSETS_CERTIFICATE_IDENTITY_URI,
  verifyCommunityAgentAssetsReleaseBundle,
} from '../dist/lib/community-release-verifier.js'

const cliPath = fileURLToPath(new URL('../dist/main.js', import.meta.url))

function runCli(args = []) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
}

const sha256 = (content) => createHash('sha256').update(content).digest('hex')

function writeAgentAssetsReleaseFixture(root) {
  const payloads = new Map([
    ['agent-assets/core/core/manifest.json', '{}\n'],
    ['agent-assets/gateway/aops/SKILL.md', '---\nname: aops\n---\n'],
    ['agent-assets/inventory.json', '{}\n'],
    ['agent-assets/projection.json', '{}\n'],
  ])
  const files = [...payloads.entries()].map(([ref, content]) => ({
    ref,
    sha256: sha256(content),
    byteLength: Buffer.byteLength(content),
  })).sort((left, right) => Buffer.compare(Buffer.from(left.ref), Buffer.from(right.ref)))
  const setHash = createHash('sha256')
  for (const file of files) setHash.update(`${file.ref}\0${file.sha256}\n`)
  for (const [ref, content] of payloads) {
    const file = path.join(root, ...ref.split('/'))
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  const manifest = {
    schemaVersion: 1,
    kind: 'aops-community-agent-assets-bundle-v1',
    releaseVersion: '0.1.4',
    source: {
      repository: 'git+https://github.com/eeemzs/aops-community',
      commit: '1'.repeat(40),
      root: 'apps/aops-cli/assets/agent-assets',
    },
    agentAssets: {
      schemaVersion: 1,
      kind: 'aops-community-agent-assets-release-v1',
      root: 'agent-assets',
      inventory: { ref: files[2].ref, sha256: files[2].sha256 },
      projection: { ref: files[3].ref, sha256: files[3].sha256 },
      gateway: { name: 'aops', ref: files[1].ref, sha256: files[1].sha256, byteLength: files[1].byteLength },
      core: {
        name: 'aops', version: '0.1.4', versionId: 'community-core-0.1.4',
        packageSha256: '2'.repeat(64), entryFile: 'SKILL.md', manifestRef: files[0].ref, optional: false,
      },
      catalog: { mode: 'optional-inert', defaultActivation: false, packages: [] },
      files,
      setSha256: setHash.digest('hex'),
    },
    evidence: { signature: { bundleRef: 'agent-assets-release.sigstore.json' } },
  }
  writeFileSync(path.join(root, 'agent-assets-release.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(path.join(root, 'agent-assets-release.sigstore.json'), '{}\n')
  return files[1].ref
}

function legacyPointer(candidate) {
  return `---
name: aops
description: "Generated AOPS pointer"
---

# aops (pointer)

This skill is a thin pointer to the single source of truth. The canonical content lives in the hosted skill mirror inside the active repo.

**Canonical file:** \`.aops/hosted/skills/aops.md\` (cwd-relative; hosted project slug: \`aops\`).

Known repo candidates from the last global sync:

1. \`${candidate}\` (hosted; project: aops)

## When triggered

1. First read \`.aops/hosted/skills/aops.md\` from the current working directory.
2. If found, follow that file verbatim. It may have changed since this pointer was authored; do not duplicate or paraphrase it here.
3. If the cwd-relative file is missing, read the first existing known repo candidate above that matches this skill.
4. If every candidate is missing or stale, refresh hosted mirrors from the relevant repo with \`aops-cli sync pull --apply --hosted-project-slug aops --json\`, then rerun the pointer sync.
5. If the active repo is not one of the known candidates and no source file exists, say the skill does not apply in this cwd and stop.
`
}

function makeLegacyRuntime(root, content) {
  const gateway = path.join(root, 'skills', 'aops', 'SKILL.md')
  mkdirSync(path.dirname(gateway), { recursive: true })
  writeFileSync(gateway, content, 'utf8')
  return gateway
}

test('parameterless assets invocation prints a compact lifecycle menu', () => {
  const result = runCli(['assets'])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /AOPS Agent Assets/)
  assert.match(result.stdout, /aops assets install/)
  assert.match(result.stdout, /aops assets update/)
  assert.match(result.stdout, /aops assets uninstall/)
  assert.doesNotMatch(result.stdout, /^Usage:/m)
})

test('assets help exposes the safe pointer uninstall command', () => {
  const result = runCli(['assets', '--help'])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^  uninstall\s/m)
  assert.match(result.stdout, /remove pointers/i)
  assert.match(result.stdout, /bundled with the official\s+npm CLI/i)
})

test('Windows native qualification follows capability identity rather than an OS build allowlist', () => {
  assert.equal(windowsQualificationSupportsRuntime({
    qualificationArchitecture: 'x64',
    qualificationCapabilityClass: 'windows-ntfs-crash-recoverable-v1',
    runtimeArchitecture: 'x64',
    runtimeCapabilityClass: 'windows-ntfs-crash-recoverable-v1',
    qualificationOsBuild: '10.0.26100',
    runtimeOsBuild: '10.0.26200',
  }), true)
  assert.equal(windowsQualificationSupportsRuntime({
    qualificationArchitecture: 'x64',
    qualificationCapabilityClass: 'windows-ntfs-crash-recoverable-v1',
    runtimeArchitecture: 'arm64',
    runtimeCapabilityClass: 'windows-ntfs-crash-recoverable-v1',
  }), false)
})

test('target selectors support registry-backed single, comma, repeated, and all forms', () => {
  assert.deepEqual(resolveAgentAssetTargetSelection(undefined), {
    selector: 'all',
    runtimes: ['codex', 'claude'],
  })
  assert.deepEqual(resolveAgentAssetTargetSelection('codex'), {
    selector: 'codex',
    runtimes: ['codex'],
  })
  assert.deepEqual(resolveAgentAssetTargetSelection('claude,codex'), {
    selector: 'codex,claude',
    runtimes: ['codex', 'claude'],
  })
  assert.deepEqual(resolveAgentAssetTargetSelection(['codex', 'claude']), {
    selector: 'codex,claude',
    runtimes: ['codex', 'claude'],
  })
  assert.throws(() => resolveAgentAssetTargetSelection('both'), /unregistered runtime selectors: both/)
  assert.throws(() => resolveAgentAssetTargetSelection('all,codex'), /all cannot be combined/)
})

test('assets command help documents extensible target selectors without both', () => {
  const result = runCli(['assets', 'install', '--help'])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /repeat or comma-separate values,\s+or use all/i)
  assert.doesNotMatch(result.stdout, /\bboth\b/i)
})

test('repeated CLI targets resolve in one registered-runtime selection and both fails', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-assets-targets-'))
  try {
    const common = [
      '--data-root', path.join(root, 'data'),
      '--codex-home', path.join(root, 'codex'),
      '--claude-home', path.join(root, 'claude'),
      '--preview',
      '--json',
    ]
    const repeated = runCli(['assets', 'uninstall', '--target', 'codex', '--target', 'claude', ...common])
    assert.equal(repeated.status, 0, repeated.stderr)
    const repeatedDocument = JSON.parse(repeated.stdout)
    assert.equal(repeatedDocument.result.target, 'codex,claude')
    assert.deepEqual(repeatedDocument.result.targets, ['codex', 'claude'])

    const removedSelector = runCli(['assets', 'uninstall', '--target', 'both', ...common])
    assert.equal(removedSelector.status, 1)
    const failure = JSON.parse(removedSelector.stdout)
    assert.equal(failure.error.code, 'schema_incompatible')
    assert.match(failure.error.message, /unregistered runtime selectors: both/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('setup guide exposes the packaged agent-readable installation skill', () => {
  const skill = loadAopsInstallSkill()
  assert.equal(skill.name, 'aops-install')
  assert.match(skill.content, /aops setup init --path 1/)
  assert.match(skill.content, /aops assets install --target all/)

  const markdown = runCli(['setup', 'guide'])
  assert.equal(markdown.status, 0, markdown.stderr)
  assert.match(markdown.stdout, /^---\r?\nname: aops-install/m)

  const json = runCli(['setup', 'guide', '--json'])
  assert.equal(json.status, 0, json.stderr)
  const document = JSON.parse(json.stdout)
  assert.equal(document.ok, true)
  assert.equal(document.skill.name, 'aops-install')
  assert.equal(document.nextCommand, 'aops setup init --yes --json')
})

test('bundled npm release discovery needs no operator-supplied path', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-assets-bundled-'))
  try {
    mkdirSync(path.join(root, 'agent-assets'))
    for (const name of ['agent-assets-release.json', 'agent-assets-release.sigstore.json']) {
      writeFileSync(path.join(root, name), '{}\n', 'utf8')
    }
    const resolved = resolveBundledAgentAssetsReleaseV1({ bundledCandidates: () => [root] })

    assert.equal(resolved.source, 'bundled-npm')
    assert.equal(resolved.fromRelease, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('official catalog discovery uses the same bundled signed npm release', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-catalog-bundled-'))
  try {
    for (const name of ['agent-assets-release.json', 'agent-assets-release.sigstore.json']) {
      writeFileSync(path.join(root, name), '{}\n', 'utf8')
    }
    const resolved = await resolveSetupOfficialCatalogReleaseV1({}, {
      bundledCandidates: () => [root],
    })

    assert.equal(resolved.source, 'bundled-npm')
    assert.equal(resolved.fromRelease, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('agent assets use their independent aops-dist signature identity and reject tampering', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-assets-release-'))
  try {
    const gatewayRef = writeAgentAssetsReleaseFixture(root)
    let verifierOptions
    const verified = await verifyCommunityAgentAssetsReleaseBundle({
      releaseRoot: root,
      verificationMode: 'offline',
      signatureVerifier: async (_bundle, _payload, options) => { verifierOptions = options },
    })
    assert.equal(verified.certificateIdentity, COMMUNITY_AGENT_ASSETS_CERTIFICATE_IDENTITY_URI)
    assert.equal(verifierOptions.certificateIdentityURI, COMMUNITY_AGENT_ASSETS_CERTIFICATE_IDENTITY_URI)
    assert.equal(verified.verifiedArtifactCount, 6)

    writeFileSync(path.join(root, ...gatewayRef.split('/')), 'tampered\n')
    await assert.rejects(
      verifyCommunityAgentAssetsReleaseBundle({
        releaseRoot: root,
        verificationMode: 'offline',
        signatureVerifier: async () => undefined,
      }),
      /community_release_agent_assets_digest_mismatch/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('first install stages the core before migrating recognized legacy pointers', async () => {
  const calls = []
  const roots = {
    assetRoot: 'C:\\aops-test\\agent-assets',
    runtimeHomes: {
      codex: { absolutePath: 'C:\\aops-test\\codex' },
      claude: { absolutePath: 'C:\\aops-test\\claude' },
    },
  }
  const provider = createSetupAgentAssetsProvider({
    roots: () => roots,
    readStatus: () => ({ state: 'ready', recoveryReasons: [] }),
    inspectBindings: () => ({ codex: { state: 'ready' }, claude: { state: 'ready' } }),
    verifyRelease: async () => ({ packageRef: { version: '1' } }),
    inspectLegacyPointers: ({ runtimeHomes }) => Object.keys(runtimeHomes).map((runtime) => ({
      runtime,
      state: 'recognized-legacy',
      eligible: true,
    })),
    applyCore: async (options) => { calls.push(['core', options]) },
    migrateLegacyPointers: async (options) => { calls.push(['migrate', options]) },
  })

  const result = await provider.apply({
    action: 'install',
    fromRelease: 'C:\\signed-release',
    target: 'all',
  })

  assert.equal(result.state, 'ready')
  assert.deepEqual(calls[0][1].runtimeHomes, {})
  assert.deepEqual(calls[1][1].runtimeHomes, {
    codex: roots.runtimeHomes.codex.absolutePath,
    claude: roots.runtimeHomes.claude.absolutePath,
  })
})

test('explicit assets install also stages the core before legacy migration', async () => {
  const calls = []
  const roots = {
    assetRoot: 'C:\\aops-test\\agent-assets',
    dataRoot: { source: 'override' },
    runtimeHomes: {
      codex: { absolutePath: 'C:\\aops-test\\codex', source: 'override' },
      claude: { absolutePath: 'C:\\aops-test\\claude', source: 'override' },
    },
  }
  const runner = createDefaultAgentAssetsCommandRunner({
    verifyCommunityRelease: async () => ({
      releaseSetSha256: 'release-set',
      packageRef: { name: '@aopslab/aops-client-core', version: '1.0.0', versionId: 'version-1' },
      manifest: { entryFile: 'index.js', files: [] },
      validation: { nativeAliasValidation: { ok: true } },
    }),
    resolveRelease: async () => ({ fromRelease: 'C:\\bundled-agent-assets', source: 'bundled-npm' }),
    inspectLegacyPointers: ({ runtimeHomes }) => Object.keys(runtimeHomes).map((runtime) => ({
      runtime,
      state: 'recognized-legacy',
      eligible: true,
      reasons: [],
    })),
    applyCommunityCore: async (options) => {
      calls.push(['core', options])
      return {
        idempotent: false,
        packageInstalled: true,
        authority: {
          storeId: 'store',
          authorityRevision: 1,
          lastIssuedFenceEpoch: 1,
          publicationCapability: {},
          capabilityEvidenceSha256: 'capability',
        },
        active: { generation: 1 },
        receipt: { receiptId: 'receipt' },
        bindings: {},
      }
    },
    migrateLegacyPointers: async (options) => {
      calls.push(['migrate', options])
      return { migrated: ['codex', 'claude'] }
    },
    inspectRuntimeBindings: () => ({ codex: { state: 'ready' }, claude: { state: 'ready' } }),
  })

  const result = await runner.run({
    command: 'assets.install',
    options: { target: ['codex', 'claude'] },
    roots,
    guard: { mode: 'apply' },
  })

  assert.deepEqual(calls[0][1].runtimeHomes, {})
  assert.deepEqual(calls[1][1].runtimeHomes, {
    codex: roots.runtimeHomes.codex.absolutePath,
    claude: roots.runtimeHomes.claude.absolutePath,
  })
  assert.deepEqual(result.result.legacyPointersMigrated, ['codex', 'claude'])
  assert.equal(result.result.releaseSource, 'bundled-npm')
})

test('uninstall removes only an exact recognized legacy pointer', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-assets-remove-'))
  try {
    const runtimeHome = path.join(root, 'codex')
    const candidate = path.join(root, 'repo', '.aops', 'hosted', 'skills', 'aops.md')
    const gateway = makeLegacyRuntime(runtimeHome, legacyPointer(candidate))

    const removed = removeAopsGatewayPointers({
      assetRoot: path.join(root, 'store'),
      runtimeHomes: { codex: runtimeHome },
    })

    assert.deepEqual(removed.removed, ['codex'])
    assert.equal(existsSync(gateway), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('uninstall refuses and preserves an unknown user-owned skill', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-assets-preserve-'))
  try {
    const runtimeHome = path.join(root, 'codex')
    const gateway = makeLegacyRuntime(runtimeHome, '# My own skill\n')

    assert.throws(() => removeAopsGatewayPointers({
      assetRoot: path.join(root, 'store'),
      runtimeHomes: { codex: runtimeHome },
    }), /unknown, unsafe, or unowned/)
    assert.equal(existsSync(gateway), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
