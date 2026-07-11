import { Command } from 'commander'

import { promptConfirm, promptInput, promptSelect } from '../utils/prompts.js'
import { runCommunityDoctor } from './community-doctor.js'
import {
  runCommunityServerLogs,
  runCommunityServerSetup,
  runCommunityServerStart,
  runCommunityServerStatus,
  runCommunityServerStop,
  runCommunityServerUpdate,
  type CommunityServerOptions,
} from './community-server.js'

type CommunityConsoleOptions = Pick<CommunityServerOptions, 'instance' | 'dataRoot' | 'json'>

export async function runCommunityConsole(options: CommunityConsoleOptions = {}): Promise<void> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true || options.json === true) {
    console.log(JSON.stringify({
      status: 'needs-input',
      mutationPerformed: false,
      reason: 'community_console_tty_required',
      next: [
        'aops-cli server status --json',
        'aops-cli doctor --json',
        'aops-cli server setup --release-dir <path>',
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
    else {
      const releaseDir = (await promptInput({ message: 'Signed release directory:', default: process.cwd() })).trim()
      const confirmed = await promptConfirm({
        message: action === 'setup'
          ? 'Verify this signed release, create installation state, pull images, and start AOPS Community?'
          : 'Create a verified backup, then update to this signed release?',
        default: false,
      })
      if (!confirmed) continue
      if (action === 'setup') await runCommunityServerSetup({ ...options, releaseDir })
      else await runCommunityServerUpdate({ ...options, releaseDir })
    }
  }
}

export function makeCommunityConsoleCommand(): Command {
  return new Command('console')
    .description('Status-first guided AOPS Community console; non-TTY returns needs-input without mutation')
    .option('--instance <name>', 'Installation instance name', 'default')
    .option('--data-root <path>', 'Absolute Community data root override')
    .option('--json', 'Return the non-interactive needs-input contract')
    .action(runCommunityConsole)
}
