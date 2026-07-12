import os from 'node:os'
import path from 'node:path'
import {
  HOST_REGISTRATION_KIND,
  HOST_REGISTRATION_VERSION,
  getHostRegistrationFilePath as getGenericHostRegistrationFilePath,
  listInstalledHostRegistrations as listGenericInstalledHostRegistrations,
  loadHostRegistrationFromCommand,
  loadHostRegistrationFromSpecifier,
  materializeHostRegistrationManifest,
  mergeHostRegistrationsIntoConfig,
  normalizeHostRegistrationManifest,
  readHostRegistrationFile,
  unregisterHostRegistration as unregisterGenericHostRegistration,
  writeHostRegistration as writeGenericHostRegistration,
  type HostAgentGatewayCatalogConfig,
  type HostAgentGatewayConfig,
  type HostAgentGatewayHeaderBinding,
  type HostAgentGatewayManifestProviderConfig,
  type HostAgentGatewayRemoteDomainSourceConfig,
  type HostConfigFragments,
  type HostPluginConfig,
  type HostPluginLoaderConfig,
  type HostRegistrationManifest,
  type HostRegistrationProvenance,
  type HostRegistrationRegistryOptions,
  type HostRuntimeConfig,
  type HostRuntimeEnvBinding,
  type InstalledHostRegistration,
  type LoadHostRegistrationOptions,
} from '@aopslab/host-registration'

export {
  HOST_REGISTRATION_KIND,
  HOST_REGISTRATION_VERSION,
  loadHostRegistrationFromCommand,
  loadHostRegistrationFromSpecifier,
  materializeHostRegistrationManifest,
  mergeHostRegistrationsIntoConfig,
  normalizeHostRegistrationManifest,
  readHostRegistrationFile,
}

export type {
  HostAgentGatewayCatalogConfig,
  HostAgentGatewayConfig,
  HostAgentGatewayHeaderBinding,
  HostAgentGatewayManifestProviderConfig,
  HostAgentGatewayRemoteDomainSourceConfig,
  HostConfigFragments,
  HostPluginConfig,
  HostPluginLoaderConfig,
  HostRegistrationManifest,
  HostRegistrationProvenance,
  HostRegistrationRegistryOptions,
  HostRuntimeConfig,
  HostRuntimeEnvBinding,
  InstalledHostRegistration,
  LoadHostRegistrationOptions,
}

export const HOST_REGISTRATIONS_DIRNAME = 'host-registrations'

export type RegisterHostRegistrationOptions = LoadHostRegistrationOptions & {
  registrationsDir?: string
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isWindowsAbsolutePath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/')
  if (/^[a-zA-Z]:\//.test(normalized)) return true
  if (normalized.startsWith('//')) return true
  return false
}

export function resolveAopsConfigDir(processEnv: Record<string, string | undefined> = process.env): string {
  const configPathRaw = processEnv.AOPS_CLI_CONFIG_PATH ?? processEnv.AGENT_OPS_CONFIG_PATH
  const configPath = normalizeString(configPathRaw)

  if (configPath) {
    if (process.platform !== 'win32' && isWindowsAbsolutePath(configPath)) {
      return path.join(os.homedir(), '.aops')
    }

    const resolved = path.resolve(configPath)
    if (resolved.toLowerCase().endsWith('.json')) {
      return path.dirname(resolved)
    }
    return resolved
  }

  return path.join(os.homedir(), '.aops')
}

export function getHostRegistrationsDir(options: RegisterHostRegistrationOptions = {}): string {
  const fromOption = normalizeString(options.registrationsDir)
  if (fromOption) return path.resolve(fromOption)

  const envValue = normalizeString(options.processEnv?.AOPS_HOST_REGISTRATIONS_DIR ?? process.env.AOPS_HOST_REGISTRATIONS_DIR)
  if (envValue) return path.resolve(envValue)

  return path.join(resolveAopsConfigDir(options.processEnv), HOST_REGISTRATIONS_DIRNAME)
}

function resolveRegistryOptions(
  options: RegisterHostRegistrationOptions = {},
): HostRegistrationRegistryOptions {
  return {
    cwd: options.cwd,
    processEnv: options.processEnv,
    registrationsDir: getHostRegistrationsDir(options),
  }
}

export function getHostRegistrationFilePath(
  domain: string,
  options: RegisterHostRegistrationOptions = {},
): string {
  return getGenericHostRegistrationFilePath(domain, resolveRegistryOptions(options))
}

export function writeHostRegistration(
  manifest: HostRegistrationManifest,
  options: RegisterHostRegistrationOptions = {},
): string {
  return writeGenericHostRegistration(manifest, resolveRegistryOptions(options))
}

export function listInstalledHostRegistrations(
  options: RegisterHostRegistrationOptions = {},
): InstalledHostRegistration[] {
  return listGenericInstalledHostRegistrations(resolveRegistryOptions(options))
}

export function unregisterHostRegistration(
  domain: string,
  options: RegisterHostRegistrationOptions = {},
): boolean {
  return unregisterGenericHostRegistration(domain, resolveRegistryOptions(options))
}
