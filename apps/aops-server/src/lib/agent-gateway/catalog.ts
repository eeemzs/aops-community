import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { buildFederatedToolCatalog, type Manifest, validateManifest } from '@aopslab/manifest'

import type {
  HostAgentGatewayConfig,
  HostAgentGatewayManifestProviderConfig,
  HostAgentGatewayRemoteDomainSourceConfig,
} from '$lib/host-config'

import {
  createTimeoutController,
  isRecord,
  normalizeApiBasePath,
  normalizeCatalogTool,
  normalizeDomain,
  normalizeBaseUrl,
  normalizeRouteSummaryEntry,
  parseFetchBody,
  resolveSourceHeaders,
  toFederatedSourceFromRemote,
  normalizeToolId,
} from './helpers'
import type {
  AgentGatewaySourceError,
  GatewayCatalogSnapshot,
  RouteSummaryEntry,
} from './types'

const runtimeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<Record<string, unknown>>
const nodeRequire = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
const MANIFEST_CHILD_MAX_BUFFER = 64 * 1024 * 1024
const MANIFEST_CHILD_JSON_MARKER = '__AOPS_MANIFEST_JSON__:'
let manifestImportVersion = 0

function withImportVersion(specifier: string): string {
  if (!specifier.startsWith('file://')) return specifier
  const url = new URL(specifier)
  url.searchParams.set('v', String(manifestImportVersion))
  return url.href
}

function resolveManifestModuleSpecifier(moduleName: string, configPath?: string): string {
  const trimmed = moduleName.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('file://')) return trimmed
  if (trimmed.startsWith('.')) {
    const baseDir = configPath ? path.dirname(configPath) : process.cwd()
    return pathToFileURL(path.resolve(baseDir, trimmed)).href
  }
  if (path.isAbsolute(trimmed)) {
    return pathToFileURL(trimmed).href
  }
  const resolvePaths = [process.cwd(), path.resolve(process.cwd(), 'apps/aops-server')]
  try {
    const resolved = nodeRequire.resolve(trimmed, { paths: resolvePaths })
    return pathToFileURL(resolved).href
  } catch {
    return trimmed
  }
}

function toManifestErrorCode(provider: HostAgentGatewayManifestProviderConfig, error: unknown): AgentGatewaySourceError {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown_error')
  return {
    sourceId: `manifest:${provider.id}`,
    error: message,
  }
}

async function loadManifestFromProvider(
  provider: HostAgentGatewayManifestProviderConfig,
  configPath?: string,
): Promise<Manifest> {
  const specifier = resolveManifestModuleSpecifier(provider.module, configPath)
  const manifestRaw =
    manifestImportVersion > 0 && specifier.startsWith('file://')
      ? await loadManifestFromFreshProcess(specifier, provider)
      : await loadManifestFromCurrentProcess(specifier, provider)

  const validation = validateManifest(manifestRaw)
  if (!validation.ok) {
    const firstSemantic = validation.issues[0]?.message
    const firstSchema = validation.zodIssues?.[0]?.message
    throw new Error(`manifest_validation_failed:${provider.id}:${firstSemantic ?? firstSchema ?? 'invalid_manifest'}`)
  }
  if (normalizeDomain(validation.manifest.domain.id) !== normalizeDomain(provider.domain)) {
    throw new Error(`manifest_domain_mismatch:${provider.id}:${validation.manifest.domain.id}:${provider.domain}`)
  }
  return validation.manifest
}

async function loadManifestFromCurrentProcess(
  specifier: string,
  provider: HostAgentGatewayManifestProviderConfig,
): Promise<unknown> {
  const mod = await runtimeImport(withImportVersion(specifier))
  const exportCandidate = mod[provider.exportName] ?? (provider.exportName === 'default' ? mod.default : undefined)
  if (exportCandidate === undefined) {
    throw new Error(`manifest_export_not_found:${provider.id}:${provider.exportName}`)
  }

  return typeof exportCandidate === 'function'
    ? await Promise.resolve(
      (exportCandidate as (options?: Record<string, unknown>) => unknown)(provider.options)
    )
    : exportCandidate
}

async function loadManifestFromFreshProcess(
  specifier: string,
  provider: HostAgentGatewayManifestProviderConfig,
): Promise<unknown> {
  const script = `
const [specifier, exportName, optionsJson] = process.argv.slice(1)
const options = optionsJson ? JSON.parse(optionsJson) : undefined
const mod = await import(specifier)
const exportCandidate = mod[exportName] ?? (exportName === 'default' ? mod.default : undefined)
if (exportCandidate === undefined) {
  throw new Error(\`manifest_export_not_found:\${exportName}\`)
}
const manifest = typeof exportCandidate === 'function'
  ? await Promise.resolve(exportCandidate(options))
  : exportCandidate
process.stdout.write('\\n${MANIFEST_CHILD_JSON_MARKER}' + JSON.stringify(manifest))
`
  const optionsJson = provider.options === undefined ? '' : JSON.stringify(provider.options)
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', script, specifier, provider.exportName, optionsJson],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DOTENV_CONFIG_QUIET: 'true',
      },
      windowsHide: true,
      maxBuffer: MANIFEST_CHILD_MAX_BUFFER,
    },
  )

  try {
    const markerIndex = stdout.lastIndexOf(MANIFEST_CHILD_JSON_MARKER)
    const jsonText = markerIndex >= 0
      ? stdout.slice(markerIndex + MANIFEST_CHILD_JSON_MARKER.length).trim()
      : stdout.trim()
    return JSON.parse(jsonText)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown_error')
    throw new Error(`manifest_child_output_invalid:${provider.id}:${message}`)
  }
}

export function resetManifestModuleImportCache(): void {
  manifestImportVersion += 1
}

export async function fetchRemoteRoutes(
  source: HostAgentGatewayRemoteDomainSourceConfig,
): Promise<RouteSummaryEntry[]> {
  const baseUrl = normalizeBaseUrl(source.baseUrl)
  const apiBasePath = normalizeApiBasePath(source.apiBasePath)
  const url = `${baseUrl}${apiBasePath}/${source.domain}`
  const headers = resolveSourceHeaders(source)
  const { controller, cleanup } = createTimeoutController(source.timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    const body = await parseFetchBody(response)
    if (!response.ok) {
      throw new Error(`remote_route_fetch_failed:${response.status}:${url}`)
    }

    if (!isRecord(body) || !Array.isArray(body.routes)) {
      throw new Error(`remote_route_payload_invalid:${url}`)
    }

    return body.routes
      .map((route) => normalizeRouteSummaryEntry(route))
      .filter((route): route is RouteSummaryEntry => route !== null)
  } finally {
    cleanup()
  }
}

export async function buildGatewayCatalogSnapshot(params: {
  config: HostAgentGatewayConfig
  configPath?: string
}): Promise<GatewayCatalogSnapshot> {
  const { config } = params
  const errors: AgentGatewaySourceError[] = []
  const manifests: Manifest[] = []
  const domains = new Set<string>()

  if (config.catalog.enabled) {
    for (const provider of config.catalog.manifestProviders) {
      if (!provider.enabled) continue
      try {
        const manifest = await loadManifestFromProvider(provider, params.configPath)
        manifests.push(manifest)
        domains.add(normalizeDomain(manifest.domain.id))
      } catch (error) {
        errors.push(toManifestErrorCode(provider, error))
      }
    }
  }

  for (const source of config.sources) {
    if (!source.enabled) continue
    domains.add(normalizeDomain(source.domain))
  }

  const sources = config.sources
    .filter((source) => source.enabled)
    .map((source) => toFederatedSourceFromRemote(source))

  if (config.includeLocal) {
    for (const domain of domains) {
      sources.push({
        id: 'local',
        kind: 'local-route',
        domain,
        enabled: true,
        priority: 0,
      })
    }
  }

  const catalog = buildFederatedToolCatalog({
    manifests,
    sources,
  })
  const normalizedCatalog = {
    ...catalog,
    tools: catalog.tools.map((tool) => normalizeCatalogTool(tool)),
  }
  const toolsById = new Map<string, typeof normalizedCatalog.tools[number]>()
  for (const tool of normalizedCatalog.tools) {
    toolsById.set(normalizeToolId(tool.toolId), tool)
  }

  return {
    catalog: normalizedCatalog,
    manifests,
    errors,
    toolsById,
    loadedAt: new Date().toISOString(),
  }
}
