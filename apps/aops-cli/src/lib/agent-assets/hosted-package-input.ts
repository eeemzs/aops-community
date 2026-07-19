import { readFileSync } from 'node:fs'
import path from 'node:path'

import { invokeHostedToolWithApiState, unwrapHostedToolResult } from '../../utils/agent-gateway.js'
import { createCliApiClientFromOptions } from '../../utils/api.js'
import { AgentAssetsError } from './envelope.js'
import { validatePortablePackageV1 } from './package-manifest.js'
import { canonicalJsonV1 } from './store-reader.js'
import type { PackageManifestV1, PackageTransferFileV1, PortableValidatedPackageV1 } from './types.js'

const FORBIDDEN_SERVER_PATH_KEYS = new Set([
  'filesystemPath',
  'materializedPath',
  'outputDir',
  'packagePath',
  'serverPath',
  'sourcePath',
])

type JsonRecord = Record<string, unknown>

export type HostedSkillPackageInputV1 = Readonly<{
  skillVersionId: string
  skillId: string
  skillName: string
  projectId: string
  scopeId: string
  manifest: PackageManifestV1
  transferFiles: readonly PackageTransferFileV1[]
  validation: PortableValidatedPackageV1
}>

export type PullHostedSkillPackageOptions = Readonly<{
  versionId: string
  expectedManifest: string
  apiBaseUrl?: string
  invoke?: (toolId: string, input: Readonly<Record<string, unknown>>) => Promise<unknown>
}>

function packageError(
  code: ConstructorParameters<typeof AgentAssetsError>[0],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AgentAssetsError {
  return new AgentAssetsError(code, message, {
    nextActions: [
      'Inspect the exact hosted contract with `aops-cli agent schema --tool agentspace.skill-version.export-skill-package --summary`.',
    ],
    ...(details === undefined ? {} : { details }),
  })
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unwrapData(value: unknown): unknown {
  let current = value
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, 'data')) break
    current = current.data
  }
  return current
}

function assertNoServerFilesystemPointers(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SERVER_PATH_KEYS.has(key) && typeof child === 'string' && child.trim()) {
      throw packageError('untrusted_origin', `Hosted client export leaked a server filesystem field: ${key}.`)
    }
    assertNoServerFilesystemPointers(child)
  }
}

function nonEmpty(record: JsonRecord, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw packageError('schema_incompatible', `${label}.${key} must be a non-empty string.`)
  }
  return value
}

function readExpectedManifest(reference: string, versionId: string): PackageManifestV1 | null {
  if (!reference.startsWith('@')) {
    if (reference !== `skill-version:${versionId}`) {
      throw packageError('expected_manifest_required', 'Expected manifest must be @file.json or the exact immutable skill-version ref.', {
        expected: `skill-version:${versionId}`,
      })
    }
    return null
  }
  const filePath = path.resolve(reference.slice(1))
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw packageError('expected_manifest_required', 'Expected manifest file could not be read.', {
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) {
    throw packageError('schema_incompatible', 'Expected manifest exceeds the 1 MiB input limit.')
  }
  try {
    return JSON.parse(raw) as PackageManifestV1
  } catch {
    throw packageError('schema_incompatible', 'Expected manifest is not valid JSON.')
  }
}

export function assertExpectedSkillPackageManifestV1(
  reference: string,
  versionId: string,
  manifest: PackageManifestV1,
): void {
  if (
    manifest.assetKind !== 'skill-package' ||
    manifest.versionId !== versionId ||
    manifest.provenance.reference !== `skill-version:${versionId}`
  ) {
    throw packageError('untrusted_origin', 'Package manifest does not identify the exact immutable skill version.')
  }
  const expectedManifest = readExpectedManifest(reference, versionId)
  if (expectedManifest !== null && canonicalJsonV1(expectedManifest) !== canonicalJsonV1(manifest)) {
    throw packageError('hash_mismatch', 'Immutable manifest differs from the caller-pinned expected manifest.')
  }
}

export function validateHostedSkillPackageExport(
  payload: unknown,
  options: Readonly<{ versionId: string; expectedManifest: string }>,
): HostedSkillPackageInputV1 {
  assertNoServerFilesystemPointers(payload)
  const candidate = unwrapData(payload)
  if (!isRecord(candidate)) throw packageError('schema_incompatible', 'Hosted export result must be an object.')
  const skillVersionId = nonEmpty(candidate, 'skillVersionId', 'HostedSkillPackageExport')
  if (skillVersionId !== options.versionId) {
    throw packageError('hash_mismatch', 'Hosted export returned a different immutable skill version.')
  }
  if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
    throw packageError('schema_incompatible', 'Hosted export did not include package files.')
  }
  const transferFiles = candidate.files.map((file, index): PackageTransferFileV1 => {
    if (!isRecord(file) || typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw packageError('schema_incompatible', `Hosted export file ${index} must contain path and UTF-8 content.`)
    }
    return { path: file.path, bytes: Buffer.from(file.content, 'utf8') }
  })
  const validation = validatePortablePackageV1(candidate.manifest, transferFiles)
  if (!validation.ok) {
    throw packageError('hash_mismatch', 'Hosted package bytes do not match immutable publish-time metadata.', {
      issues: validation.issues,
    })
  }
  const manifest = validation.value.normalizedManifest
  assertExpectedSkillPackageManifestV1(options.expectedManifest, skillVersionId, manifest)

  return {
    skillVersionId,
    skillId: nonEmpty(candidate, 'skillId', 'HostedSkillPackageExport'),
    skillName: nonEmpty(candidate, 'skillName', 'HostedSkillPackageExport'),
    projectId: nonEmpty(candidate, 'projectId', 'HostedSkillPackageExport'),
    scopeId: nonEmpty(candidate, 'scopeId', 'HostedSkillPackageExport'),
    manifest,
    transferFiles,
    validation: validation.value,
  }
}

export async function pullHostedSkillPackage(
  options: PullHostedSkillPackageOptions,
): Promise<HostedSkillPackageInputV1> {
  let payload: unknown
  try {
    if (options.invoke) {
      payload = await options.invoke('agentspace.skill-version.export-skill-package', { id: options.versionId })
    } else {
      const apiState = await createCliApiClientFromOptions({ apiBaseUrl: options.apiBaseUrl })
      const response = await invokeHostedToolWithApiState(apiState, {
        apiBaseUrl: options.apiBaseUrl,
        toolId: 'agentspace.skill-version.export-skill-package',
        input: { id: options.versionId },
      })
      payload = unwrapHostedToolResult(response)
    }
  } catch (error) {
    if (error instanceof AgentAssetsError) throw error
    throw packageError('remote_unavailable', 'Hosted skill package export failed.', {
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  return validateHostedSkillPackageExport(payload, options)
}
