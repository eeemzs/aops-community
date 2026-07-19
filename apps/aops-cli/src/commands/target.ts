import { Command } from 'commander'

import {
  getActiveApiTarget,
  getApiTarget,
  listApiTargets,
  normalizeApiTargetName,
  removeApiTarget,
  setApiTarget,
  useApiTarget,
  validateApiTarget,
  type AopsApiTargetAuthProvider,
  type AopsApiTargetTlsPolicy,
} from '../utils/config.js'
import { createCliApiClientFromOptions, fetchCliPublicJson } from '../utils/api.js'
import {
  evaluateCommunityCompatibility,
  resolveCommunityCliIdentity,
} from '../lib/community-client-contract.js'

type TargetCommonOptions = {
  json?: boolean
  /** Internal parent-command composition seam; not registered as a CLI flag. */
  quiet?: boolean
  resultSink?: (value: unknown) => void
}
type TargetAddOptions = TargetCommonOptions & {
  name: string
  apiBaseUrl: string
  authProvider?: AopsApiTargetAuthProvider
  tlsPolicy?: AopsApiTargetTlsPolicy
  use?: boolean
  apply?: boolean
}
type TargetUseOptions = TargetCommonOptions & { apply?: boolean }
type TargetRemoveOptions = TargetCommonOptions & { apply?: boolean; confirm?: boolean }
type TargetDoctorOptions = TargetCommonOptions & { timeoutMs?: number }

function output(value: unknown, json = false): void {
  if (json) console.log(JSON.stringify(value, null, 2))
  else if (typeof value === 'string') console.log(value)
  else console.log(JSON.stringify(value, null, 2))
}

export async function runTargetAdd(options: TargetAddOptions): Promise<void> {
  const name = normalizeApiTargetName(options.name)
  const target = validateApiTarget(options)
  if (!options.apply) {
    const result = {
      status: 'preview',
      mutationFree: true,
      action: 'target-add',
      target: { name, ...target, active: options.use === true },
      next: 'Re-run with --apply to persist this target.',
    }
    options.resultSink?.(result)
    if (!options.quiet) output(result, options.json)
    return
  }
  const result = setApiTarget({ ...options, name, activate: options.use })
  const payload = { status: 'target-saved', target: result }
  options.resultSink?.(payload)
  if (!options.quiet) output(payload, options.json)
}

export async function runTargetUse(name: string, options: TargetUseOptions): Promise<void> {
  const normalized = normalizeApiTargetName(name)
  const target = getApiTarget(normalized)
  if (!target) throw new Error(`aops_target_not_found:${normalized}`)
  if (!options.apply) {
    output({
      status: 'preview',
      mutationFree: true,
      action: 'target-use',
      target: { ...target, active: true },
      next: 'Re-run with --apply to select this target.',
    }, options.json)
    return
  }
  output({ status: 'target-selected', target: useApiTarget(normalized) }, options.json)
}

export async function runTargetList(options: TargetCommonOptions): Promise<void> {
  const targets = listApiTargets()
  if (options.json) output({ status: 'ok', targets }, true)
  else if (targets.length === 0) output('No targets configured.')
  else for (const target of targets) {
    output(`${target.active ? '*' : ' '} ${target.name} ${target.apiBaseUrl} ${target.authProvider} credentials=${target.hasCredentials ? 'stored' : 'none'}`)
  }
}

export async function runTargetShow(name: string | undefined, options: TargetCommonOptions): Promise<void> {
  const target = name ? getApiTarget(name) : getActiveApiTarget()
  if (!target) throw new Error(name ? `aops_target_not_found:${name}` : 'aops_target_active_missing')
  output({ status: 'ok', target }, options.json)
}

export async function runTargetRemove(name: string, options: TargetRemoveOptions): Promise<void> {
  const normalized = normalizeApiTargetName(name)
  const target = getApiTarget(normalized)
  if (!target) throw new Error(`aops_target_not_found:${normalized}`)
  if (!options.apply) {
    output({
      status: 'preview',
      mutationFree: true,
      action: 'target-remove',
      target,
      credentialsWillBeRemoved: target.hasCredentials,
      next: 'Re-run with --apply --confirm to remove the target and its stored credentials.',
    }, options.json)
    return
  }
  if (!options.confirm) throw new Error('aops_target_remove_confirmation_required:use_--confirm')
  removeApiTarget(normalized)
  output({ status: 'target-removed', name: normalized }, options.json)
}

export async function inspectTargetDoctor(
  name: string | undefined,
  options: TargetDoctorOptions = {},
): Promise<Record<string, unknown>> {
  const target = name ? getApiTarget(name) : getActiveApiTarget()
  if (!target) throw new Error(name ? `aops_target_not_found:${name}` : 'aops_target_active_missing')
  const cli = resolveCommunityCliIdentity()
  try {
    const api = await createCliApiClientFromOptions({ targetName: target.name, timeoutMs: options.timeoutMs })
    const discovery = await fetchCliPublicJson<Record<string, any>>(api, '/api-info.json', {
      timeoutMs: options.timeoutMs,
    })
    const compatibility = evaluateCommunityCompatibility(discovery?.clientCompatibility, cli)
    return {
      status: compatibility.compatible ? compatibility.status : 'incompatible',
      mutationFree: true,
      target,
      endpointSource: api.endpointSource,
      serverIdentity: compatibility.server ?? null,
      compatibility,
    }
  } catch (error) {
    return {
      status: 'unavailable',
      mutationFree: true,
      target,
      serverIdentity: null,
      compatibility: {
        status: 'incompatible',
        compatible: false,
        reason: error instanceof Error ? error.message : String(error),
        cli,
      },
    }
  }
}

export async function runTargetDoctor(name: string | undefined, options: TargetDoctorOptions): Promise<void> {
  const result = await inspectTargetDoctor(name, options)
  output(result, options.json)
  if (result.status === 'incompatible' || result.status === 'unavailable') process.exitCode = 1
}

export function makeTargetCommand(): Command {
  const command = new Command('target').description('Manage named local or remote AOPS server targets')
  command.command('add')
    .requiredOption('--name <name>', 'Stable local target name')
    .requiredOption('--api-base-url <url>', 'Server base URL without credentials or a path')
    .option('--auth-provider <trusted-local|authv2-jwt-session>', 'Authentication policy')
    .option('--tls-policy <loopback-http|system-ca>', 'Transport trust policy')
    .option('--use', 'Select this target after it is saved')
    .option('--apply', 'Persist the target; default is a mutation-free preview')
    .option('--json', 'Output JSON')
    .action(runTargetAdd)
  command.command('use <name>')
    .option('--apply', 'Persist the active target; default is a mutation-free preview')
    .option('--json', 'Output JSON')
    .action(runTargetUse)
  command.command('list').option('--json', 'Output JSON').action(runTargetList)
  command.command('show [name]').option('--json', 'Output JSON').action(runTargetShow)
  command.command('remove <name>')
    .option('--apply', 'Remove the target; default is a mutation-free preview')
    .option('--confirm', 'Confirm removal of the target and its credentials')
    .option('--json', 'Output JSON')
    .action(runTargetRemove)
  command.command('doctor [name]')
    .option('--timeout-ms <ms>', 'Request timeout', (value) => Number.parseInt(value, 10))
    .option('--json', 'Output JSON')
    .action(runTargetDoctor)
  return command
}
