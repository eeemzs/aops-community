import { invokeHostedToolWithApiState, unwrapHostedToolResult } from '../../utils/agent-gateway.js'
import { createCliApiClientFromOptions } from '../../utils/api.js'
import { AgentAssetsError } from './envelope.js'

const MATCH_FIELD = /^(?:name|shortDescription|description|tags|version|entryFile|skillStandard|meta\.[A-Za-z0-9_.-]+)$/
const EXACT_REF = /^skill-version:(.+)$/
const SHA256_HEX = /^[a-f0-9]{64}$/
const FORBIDDEN_BODY_KEYS = new Set([
  'content',
  'files',
  'filesystemPath',
  'materializedPath',
  'outputDir',
  'packagePath',
  'serverPath',
  'sourcePath',
])

type JsonRecord = Record<string, unknown>

export type HostedSkillDiscoveryCandidateV1 = Readonly<{
  name: string
  version: string
  versionId: string
  exactRef: string
  packageSha256: string
  contentSha256: string
  shortDescription?: string
  origin: 'hosted-cache'
  computedTrustClass: 'verified-hosted-package'
  score: number
  matchedBy: readonly string[]
  rationale: string
}>

export type HostedSkillDiscoveryResultV1 = Readonly<{
  query: string
  normalizedQuery: string
  candidates: readonly HostedSkillDiscoveryCandidateV1[]
}>

export type DiscoverHostedSkillsOptions = Readonly<{
  query: string
  limit: number
  apiBaseUrl?: string
  invoke?: (toolId: string, input: Readonly<Record<string, unknown>>) => Promise<unknown>
}>

function discoveryError(message: string, details?: Readonly<Record<string, unknown>>): AgentAssetsError {
  return new AgentAssetsError('schema_incompatible', message, {
    nextActions: [
      'Inspect `aops-cli agent schema --tool agentspace.skill.search --summary`; do not load skill bodies to compensate.',
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

function assertMetadataOnly(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_BODY_KEYS.has(key)) {
      throw new AgentAssetsError('untrusted_origin', `Hosted discovery returned forbidden body/path field: ${key}.`, {
        nextActions: ['Use only the raw metadata `agentspace.skill.search` Community projection.'],
      })
    }
    assertMetadataOnly(child)
  }
}

function boundedString(record: JsonRecord, key: string, maximum: number, required = true): string | undefined {
  const value = record[key]
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw discoveryError(`Hosted discovery candidate.${key} is invalid or exceeds its metadata budget.`)
  }
  return value
}

export function validateHostedSkillDiscovery(
  payload: unknown,
  options: Readonly<{ query: string; limit: number }>,
): HostedSkillDiscoveryResultV1 {
  assertMetadataOnly(payload)
  const candidate = unwrapData(payload)
  if (!isRecord(candidate)) throw discoveryError('Hosted skill search result must be an object.')
  const query = boundedString(candidate, 'query', 256)!
  const normalizedQuery = boundedString(candidate, 'normalizedQuery', 256)!
  if (!Array.isArray(candidate.candidates) || candidate.candidates.length > options.limit || candidate.candidates.length > 5) {
    throw discoveryError('Hosted skill search exceeded the requested candidate limit.', {
      requestedLimit: options.limit,
      candidateCount: Array.isArray(candidate.candidates) ? candidate.candidates.length : null,
    })
  }
  if (candidate.count !== candidate.candidates.length) {
    throw discoveryError('Hosted skill search count does not match its candidate array.')
  }

  const candidates = candidate.candidates.map((entry, index): HostedSkillDiscoveryCandidateV1 => {
    if (!isRecord(entry)) throw discoveryError(`Hosted skill search candidate ${index} must be an object.`)
    const versionId = boundedString(entry, 'versionId', 160)!
    const exactRef = boundedString(entry, 'exactRef', 180)!
    const match = EXACT_REF.exec(exactRef)
    if (!match || match[1] !== versionId) {
      throw discoveryError(`Hosted skill search candidate ${index} has inconsistent exact identity.`)
    }
    if (entry.origin !== 'hosted') throw discoveryError(`Hosted skill search candidate ${index} has an invalid origin.`)
    const packageSha256 = boundedString(entry, 'packageSha256', 64)!
    const contentSha256 = boundedString(entry, 'contentSha256', 64)!
    if (!SHA256_HEX.test(packageSha256) || !SHA256_HEX.test(contentSha256)) {
      throw discoveryError(`Hosted skill search candidate ${index} has invalid immutable digest metadata.`)
    }
    if (entry.computedTrustClass !== 'verified-hosted-package') {
      throw discoveryError(`Hosted skill search candidate ${index} has an invalid computed trust class.`)
    }
    if (!Number.isSafeInteger(entry.score) || (entry.score as number) < 1) {
      throw discoveryError(`Hosted skill search candidate ${index} has an invalid score.`)
    }
    if (
      !Array.isArray(entry.matchedBy)
      || entry.matchedBy.length < 1
      || entry.matchedBy.length > 5
      || entry.matchedBy.some((field) => typeof field !== 'string' || !MATCH_FIELD.test(field))
      || new Set(entry.matchedBy).size !== entry.matchedBy.length
    ) {
      throw discoveryError(`Hosted skill search candidate ${index} has invalid match metadata.`)
    }
    return Object.freeze({
      name: boundedString(entry, 'name', 80)!,
      version: boundedString(entry, 'version', 80)!,
      versionId,
      exactRef,
      packageSha256,
      contentSha256,
      ...(entry.shortDescription === undefined
        ? {}
        : { shortDescription: boundedString(entry, 'shortDescription', 96, false)! }),
      origin: 'hosted-cache' as const,
      computedTrustClass: 'verified-hosted-package' as const,
      score: entry.score as number,
      matchedBy: Object.freeze([...entry.matchedBy] as string[]),
      rationale: boundedString(entry, 'rationale', 160)!,
    })
  })

  return Object.freeze({ query, normalizedQuery, candidates: Object.freeze(candidates) })
}

export async function discoverHostedSkills(options: DiscoverHostedSkillsOptions): Promise<HostedSkillDiscoveryResultV1> {
  let payload: unknown
  try {
    const input = Object.freeze({ query: options.query, limit: options.limit })
    if (options.invoke) {
      payload = await options.invoke('agentspace.skill.search', input)
    } else {
      const apiState = await createCliApiClientFromOptions({ apiBaseUrl: options.apiBaseUrl })
      const response = await invokeHostedToolWithApiState(apiState, {
        apiBaseUrl: options.apiBaseUrl,
        toolId: 'agentspace.skill.search',
        input,
      })
      payload = unwrapHostedToolResult(response)
    }
  } catch (error) {
    if (error instanceof AgentAssetsError) throw error
    throw new AgentAssetsError('remote_unavailable', 'Hosted skill metadata search failed.', {
      nextActions: ['Retry when the selected AOPS server is reachable, or use `--offline` for the installed core only.'],
      cause: error,
    })
  }
  return validateHostedSkillDiscovery(payload, options)
}
