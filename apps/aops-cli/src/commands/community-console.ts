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
  type CommunityServerCommandIdentity,
  type CommunityServerOptions,
} from './community-server.js'

type CommunityConsoleOptions = Pick<CommunityServerOptions, 'instance' | 'dataRoot' | 'repo' | 'json'>

export async function runCommunityConsole(
  options: CommunityConsoleOptions = {},
  identity: CommunityServerCommandIdentity = {},
): Promise<void> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true || options.json === true) {
    console.log(JSON.stringify({
      status: 'needs-input',
      mutationPerformed: false,
      reason: 'community_console_tty_required',
      next: [
        'aops-cli server status --json',
        'aops-cli doctor --json',
        'cd <tagged-aops-community-clone> && aops-cli server setup',
        'aops-cli server setup --repo <tagged-clone-root>',
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
    else if (action === 'start') await runCommunityServerStart(options, identity)
    else if (action === 'stop') await runCommunityServerStop(options, identity)
    else if (action === 'logs') await runCommunityServerLogs(options)
    else if (action === 'doctor') await runCommunityDoctor(options)
    else {
      const confirmed = await promptConfirm({
        message: action === 'setup'
          ? 'Discover the tagged clone, verify its signed release, create installation state, pull images, and start AOPS Community?'
          : 'Discover the tagged clone, create a verified backup, then update to its signed release?',
        default: false,
      })
      if (!confirmed) continue
      if (action === 'setup') await runCommunityServerSetup(options, identity)
      else await runCommunityServerUpdate(options, identity)
    }
  }
}

export function makeCommunityConsoleCommand(identity: CommunityServerCommandIdentity = {}): Command {
  return new Command('console')
    .description('Status-first guided AOPS Community console; non-TTY returns needs-input without mutation')
    .option('--instance <name>', 'Installation instance name', 'default')
    .option('--data-root <path>', 'Absolute Community data root override')
    .option('--repo <path>', 'Tagged aops-community clone root; otherwise discover upward from cwd')
    .option('--json', 'Return the non-interactive needs-input contract')
    .action((options) => runCommunityConsole(options, identity))
}
