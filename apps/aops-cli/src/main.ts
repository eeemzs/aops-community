#!/usr/bin/env node
import { Command } from 'commander'
import { banner, logError, logWarn } from '@aopslab/xf-cli-ui'
import { resolveCommunityCliIdentity } from './lib/community-client-contract.js'
import { promptSelect } from './utils/prompts.js'
import { makeInitCommand } from './commands/init.js'
import { makeCommunitySetupCommand, runCommunitySetupInit } from './commands/community-setup.js'
import { makeAssetsCommand } from './commands/assets.js'
import { makeStartCommand } from './commands/start.js'
import { makePlanCommand } from './commands/plan.js'
import { makeAgentsMdCommand } from './commands/agents-md.js'
import { makeAgentCommand } from './commands/agent.js'
import { makeSyncCommand } from './commands/repo-sync.js'
import { makeArchiveCommand } from './commands/archive.js'
import { makeViewCommand } from './commands/view.js'
import { makeHostCommand } from './commands/host.js'
import { makeApiCommand } from './commands/api.js'
import { guardCommunitySecretArgv, makeCommunityAuthCommand } from './commands/community-auth.js'
import { makeMemoryCommand } from './commands/memory.js'
import { makeCheckpointCommand } from './commands/checkpoint.js'
import { makeExperienceCommand } from './commands/experience.js'
import { makeDiscussCommand } from './commands/discuss.js'
import { makeChatCommand } from './commands/chat.js'
import { guardChatv3UnknownSubcommand, makeChatv3Command } from './commands/chatv3.js'
import { makeAgentProfileCommand } from './commands/agent-profile.js'
import { makePromptCommand } from './commands/prompt.js'
import { makeProjectCommand } from './commands/project.js'
import { makeMissionCommand } from './commands/mission.js'
import { makePlaybookCommand } from './commands/playbook.js'
import { makeResourceCommand } from './commands/resource.js'
import { makeArtifactCommand } from './commands/artifact.js'
import { makeActivityCommand } from './commands/activity.js'
import { makeSkillCommand } from './commands/skill.js'
import { makeDocCommand } from './commands/doc.js'
import { makePmCommand } from './commands/pm/index.js'
import { makeCommunityServerCommand } from './commands/community-server.js'
import { makeCommunityDoctorCommand } from './commands/community-doctor.js'
import { makeCommunityConsoleCommand } from './commands/community-console.js'
import { makeTargetCommand } from './commands/target.js'
import { makeVersionCommand } from './commands/version.js'

for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error?.code === 'EPIPE') {
      process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
    }
    throw error
  })
}

export function buildCommunityProgram(): Command {
  const program = new Command()
  program
    .name('aops-cli')
    .description('AOPS Community operator CLI for local-trusted, self-hosted workflows')
    .version(resolveCommunityCliIdentity().version, '-V, --cli-version', 'output the CLI version')

  program.addCommand(makeInitCommand()) // community-family:init
  program.addCommand(makeCommunitySetupCommand()) // community-family:setup
  program.addCommand(makeAssetsCommand()) // community-family:assets
  program.addCommand(makeStartCommand()) // community-family:start
  program.addCommand(makePlanCommand()) // community-family:plan
  program.addCommand(makeAgentsMdCommand()) // community-family:agents-md
  program.addCommand(makeAgentCommand()) // community-family:agent
  program.addCommand(makeSyncCommand()) // community-family:sync
  program.addCommand(makeArchiveCommand()) // community-family:archive
  program.addCommand(makeViewCommand()) // community-family:view
  program.addCommand(makeHostCommand()) // community-family:host
  program.addCommand(makeApiCommand()) // community-family:api
  program.addCommand(makeCommunityAuthCommand()) // community-family:auth
  program.addCommand(makeMemoryCommand()) // community-family:mem
  program.addCommand(makeCheckpointCommand()) // community-family:checkpoint
  program.addCommand(makeExperienceCommand()) // community-family:exp
  program.addCommand(makeDiscussCommand()) // community-family:discuss
  program.addCommand(makeChatCommand()) // community-family:chat
  program.addCommand(makeChatv3Command()) // community-family:chatv3
  program.addCommand(makeAgentProfileCommand()) // community-family:agent-profile
  program.addCommand(makePromptCommand()) // community-family:prompt
  program.addCommand(makeProjectCommand()) // community-family:project
  program.addCommand(makeMissionCommand()) // community-family:mission
  program.addCommand(makePlaybookCommand()) // community-family:playbook
  program.addCommand(makeResourceCommand()) // community-family:resource
  program.addCommand(makeArtifactCommand()) // community-family:artifact
  program.addCommand(makeActivityCommand()) // community-family:activity
  program.addCommand(makeSkillCommand()) // community-family:skill
  program.addCommand(makeDocCommand()) // community-family:doc
  program.addCommand(makePmCommand()) // community-family:pm
  program.addCommand(makeCommunityServerCommand()) // community-family:server
  program.addCommand(makeCommunityDoctorCommand()) // community-family:doctor
  program.addCommand(makeCommunityConsoleCommand()) // community-family:console
  program.addCommand(makeTargetCommand()) // community-family:target
  program.addCommand(makeVersionCommand()) // community-family:version
  program.addHelpText('after', `
AOPS Community is a single-user, self-hosted/local-trusted distribution.
Canonical writes go to the local AOPS server; .aops/** remains a read-only cache.

Quick checks:
  aops-cli host health
  aops-cli agent tools
  aops-cli view dashboard --style agent
`)
  return program
}

async function runCommunityMenu(program: Command): Promise<void> {
  const readiness = await runCommunitySetupInit({ yes: true, skipBanner: true })
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    logWarn('Interactive menu requires a TTY. Use `aops-cli --help` or run a command directly.')
    program.outputHelp()
    return
  }
  banner('AOPS Community CLI')
  while (true) {
    const action = await promptSelect({
      message: 'Select an action:',
      type: process.env.AOPS_CLI_MENU_STYLE?.toLowerCase() === 'list' ? 'list' : 'rawlist',
      choices: [
        { name: readiness.status === 'action-required' ? 'Continue setup (readiness actions remain)' : 'Setup: Check readiness', value: 'setup' },
        { name: 'Show command help', value: 'help' },
        { name: 'Exit', value: 'exit' },
      ],
    })
    if (action === 'exit') return
    if (action === 'help') { program.outputHelp(); continue }
    await runCommunitySetupInit({})
  }
}

async function main(): Promise<void> {
  const program = buildCommunityProgram()
  try {
    if (process.argv.length <= 2) {
      await runCommunityMenu(program)
      return
    }
    const argv = process.argv[2] === '--'
      ? [process.argv[0], process.argv[1], ...process.argv.slice(3)]
      : process.argv
    guardChatv3UnknownSubcommand(argv)
    guardCommunitySecretArgv(argv)
    await program.parseAsync(argv)
  } catch (error) {
    logError(String((error as any)?.message ?? error))
    process.exitCode = 1
  }
}

void main()
