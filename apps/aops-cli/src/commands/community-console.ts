import { Command } from 'commander'

import { promptConfirm, promptSelect } from '../utils/prompts.js'
import { runCommunityDoctor } from './community-doctor.js'
import {
  runCommunityServerLogs,
  runCommunityServerSetup,
  runCommunityServerStart,
  runCommunityServerStatus,
  runCommunityServerStop,
  runCommunityServerUpdate,
  type CommunityServerDependencies,
  type CommunityServerOptions,
} from './community-server.js'

type CommunityConsoleOptions = Pick<CommunityServerOptions, 'instance' | 'dataRoot' | 'json'>

export type CommunityConsoleCommandIdentity = Readonly<Pick<CommunityServerDependencies, 'cliVersion'>>

type CommunityConsoleServerActionDependencies = CommunityConsoleCommandIdentity & Readonly<{
  runSetup?: typeof runCommunityServerSetup
  runUpdate?: typeof runCommunityServerUpdate
}>

export async function runCommunityConsoleServerAction(
  action: 'setup' | 'update',
  options: CommunityConsoleOptions,
  dependencies: CommunityConsoleServerActionDependencies = {},
): Promise<void> {
  const serverDependencies: CommunityServerDependencies = { cliVersion: dependencies.cliVersion }
  if (action === 'setup') {
    await (dependencies.runSetup ?? runCommunityServerSetup)({
      ...options,
      runtime: 'oci',
      apply: true,
    }, serverDependencies)
    return
  }
  await (dependencies.runUpdate ?? runCommunityServerUpdate)(options, serverDependencies)
}

export async function runCommunityConsole(
  options: CommunityConsoleOptions = {},
  identity: CommunityConsoleCommandIdentity = {},
): Promise<void> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true || options.json === true) {
    console.log(JSON.stringify({
      status: 'needs-input',
      mutationPerformed: false,
      reason: 'community_console_tty_required',
      next: [
        'aops-cli server status --json',
        'aops-cli doctor --json',
        'aops-cli server setup --runtime oci --apply',
      ],
    }, null, 2))
    process.exitCode = 2
    return
  }
  await runCommunityServerStatus(options)
  while (true) {
    const action = await promptSelect({
      message: 'AOPS Community:',
      choices: [
        { name: 'Status', value: 'status' },
        { name: 'Install / start from signed release', value: 'setup' },
        { name: 'Start installed server', value: 'start' },
        { name: 'Update from signed release', value: 'update' },
        { name: 'Recent logs', value: 'logs' },
        { name: 'Doctor (read-only)', value: 'doctor' },
        { name: 'Stop server', value: 'stop' },
        { name: 'Exit', value: 'exit' },
      ],
    })
    if (action === 'exit') return
    if (action === 'status') await runCommunityServerStatus(options)
    else if (action === 'start') await runCommunityServerStart(options)
    else if (action === 'stop') await runCommunityServerStop(options)
    else if (action === 'logs') await runCommunityServerLogs(options)
    else if (action === 'doctor') await runCommunityDoctor(options)
    else if (action === 'setup' || action === 'update') {
      const confirmed = await promptConfirm({
        message: action === 'setup'
          ? 'Fetch and verify this CLI version signed release, create installation state, pull its exact image digest, and start AOPS Community?'
          : 'Fetch and verify this CLI version signed release, create a verified backup, then update to its exact image digest?',
        default: false,
      })
      if (!confirmed) continue
      await runCommunityConsoleServerAction(action, options, identity)
    }
  }
}

export function makeCommunityConsoleCommand(identity: CommunityConsoleCommandIdentity = {}): Command {
  return new Command('console')
    .description('Status-first guided AOPS Community console; non-TTY returns needs-input without mutation')
    .option('--instance <name>', 'Installation instance name', 'default')
    .option('--data-root <path>', 'Absolute Community data root override')
    .option('--json', 'Return the non-interactive needs-input contract')
    .action((options: CommunityConsoleOptions) => runCommunityConsole(options, identity))
}
