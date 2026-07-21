import { Command } from 'commander'

import {
  inspectCommunityNativeInstall,
  inspectCommunityNativeRuntime,
} from '../lib/community-native-lifecycle.js'
import { openExternalUrl } from '../lib/external-url.js'
import { runCommunityServerStart } from './community-server.js'

export type CommunityCockpitOptions = {
  instance?: string
  dataRoot?: string
  open?: boolean
  json?: boolean
}

export type CommunityCockpitResult = Readonly<{
  status: 'cockpit-ready'
  instance: string
  origin: string
  serverAction: 'already-running' | 'started'
  opened: boolean
}>

export type CommunityCockpitDependencies = Readonly<{
  inspectInstall: typeof inspectCommunityNativeInstall
  inspectRuntime: typeof inspectCommunityNativeRuntime
  startServer: typeof runCommunityServerStart
  openUrl: typeof openExternalUrl
}>

const defaultDependencies: CommunityCockpitDependencies = {
  inspectInstall: inspectCommunityNativeInstall,
  inspectRuntime: inspectCommunityNativeRuntime,
  startServer: runCommunityServerStart,
  openUrl: openExternalUrl,
}

function selection(options: CommunityCockpitOptions): { instanceName?: string; dataRoot?: string } {
  return { instanceName: options.instance, dataRoot: options.dataRoot }
}

export async function resolveCommunityCockpit(
  options: CommunityCockpitOptions,
  dependencies: CommunityCockpitDependencies = defaultDependencies,
): Promise<CommunityCockpitResult> {
  const install = dependencies.inspectInstall(selection(options))
  const requestedInstance = options.instance ?? 'default'
  if (install.status === 'not-installed') {
    throw new Error(`AOPS server instance "${requestedInstance}" is not installed. Run "aops setup init" first.`)
  }
  if (install.status !== 'installed' || !install.state) {
    throw new Error(
      `AOPS server instance "${requestedInstance}" cannot open Cockpit: ${install.status}` +
      `${install.error ? ` (${install.error})` : ''}. Run "aops doctor".`,
    )
  }

  let runtime = await dependencies.inspectRuntime(selection(options))
  let serverAction: CommunityCockpitResult['serverAction'] = 'already-running'
  if (runtime.runtimeState === 'stopped') {
    await dependencies.startServer({
      instance: install.state.instanceName,
      dataRoot: install.paths.dataRoot,
      detach: true,
      silent: true,
    })
    serverAction = 'started'
    runtime = await dependencies.inspectRuntime({
      instanceName: install.state.instanceName,
      dataRoot: install.paths.dataRoot,
    })
  }

  if (runtime.runtimeState !== 'running' || runtime.health !== 'healthy') {
    throw new Error(
      `AOPS server instance "${install.state.instanceName}" is not ready for Cockpit: ` +
      `${runtime.runtimeState}${runtime.reason ? ` (${runtime.reason})` : ''}. ` +
      'Run "aops server status" and "aops server logs".',
    )
  }

  const origin = `http://127.0.0.1:${install.state.server.port}`
  const shouldOpen = options.open !== false
  if (shouldOpen) {
    try {
      await dependencies.openUrl(origin)
    } catch (error) {
      throw new Error(
        `AOPS Cockpit is ready at ${origin}, but the default browser could not be opened: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return {
    status: 'cockpit-ready',
    instance: install.state.instanceName,
    origin,
    serverAction,
    opened: shouldOpen,
  }
}

export async function runCommunityCockpit(options: CommunityCockpitOptions): Promise<void> {
  const result = await resolveCommunityCockpit(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  const lifecycle = result.serverAction === 'started' ? 'Server started. ' : ''
  const browser = result.opened ? 'Opened in the default browser.' : 'Browser opening was skipped.'
  process.stdout.write(`${lifecycle}AOPS Cockpit: ${result.origin}\n${browser}\n`)
}

export function makeCommunityCockpitCommand(): Command {
  return new Command('cockpit')
    .description('Open AOPS Cockpit; start a stopped installed server first')
    .option('--instance <name>', 'Installation instance name', 'default')
    .option('--data-root <path>', 'Absolute Community data root override')
    .option('--no-open', 'Prepare Cockpit and print its URL without opening a browser')
    .option('--json', 'Output JSON')
    .action(runCommunityCockpit)
}
