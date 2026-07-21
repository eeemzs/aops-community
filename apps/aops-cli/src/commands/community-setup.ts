import { Command } from 'commander'
import { banner, logInfo } from '@aopslab/xf-cli-ui'

import { makeOfficialCatalogSetupCommand } from './official-catalog.js'

import {
  runSetupInitOrchestrator,
  type SetupInitOptions,
} from '../lib/setup-init-orchestrator.js'
import {
  runCommunitySetupServerEnv,
  type CommunitySetupServerEnvOptions,
} from '../lib/community-setup-server-env.js'
import { createSetupOfficialCatalogProviderV1 } from '../lib/setup-official-catalog-bridge.js'
import { createSetupAgentAssetsProvider } from '../lib/setup-agent-assets-bridge.js'
import {
  buildAopsInstallAgentPrompt,
  loadAopsInstallSkill,
} from '../lib/setup-install-guide.js'
import { promptSelect } from '../utils/prompts.js'

export type CommunitySetupGuideOptions = Readonly<{
  json?: boolean
  path?: boolean
}>

export type CommunitySetupAiOptions = Readonly<{
  json?: boolean
}>

const COMMUNITY_SETUP_HOME = `AOPS Setup — choose how to begin
  Install interactively    aops setup init
  Set up with an AI agent  aops setup ai
  Inspect readiness        aops setup init --yes --json
  Agent install skill      aops setup guide
  Configure PostgreSQL     aops setup server-env
Help: aops setup --help
`

export function runCommunitySetupGuide(options: CommunitySetupGuideOptions = {}): void {
  if (options.json && options.path) throw new Error('setup_guide_selector_conflict:choose_--json_or_--path')
  const skill = loadAopsInstallSkill()
  if (options.path) {
    process.stdout.write(`${skill.path}\n`)
    return
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: 'setup.guide',
      ok: true,
      skill: {
        name: skill.name,
        path: skill.path,
        sha256: skill.sha256,
        content: skill.content,
      },
      nextCommand: 'aops setup init --yes --json',
      aiCommand: 'aops setup ai',
    }, null, 2)}\n`)
    return
  }
  process.stdout.write(skill.content.endsWith('\n') ? skill.content : `${skill.content}\n`)
}

export function runCommunitySetupAi(options: CommunitySetupAiOptions = {}): void {
  const skill = loadAopsInstallSkill()
  const prompt = buildAopsInstallAgentPrompt()
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: 'setup.ai',
      ok: true,
      prompt,
      skill: {
        name: skill.name,
        path: skill.path,
        sha256: skill.sha256,
      },
      nextCommand: 'aops setup init --yes --json',
    }, null, 2)}\n`)
    return
  }
  banner('AOPS Setup with AI')
  logInfo('Copy the prompt below to Codex, Claude, or another terminal AI agent.')
  logInfo('Enter database secrets only in AOPS masked prompts; never paste them into chat.')
  process.stdout.write(`\n--- copy from here ---\n${prompt}\n--- end prompt ---\n`)
}

export async function runCommunitySetupInit(options: SetupInitOptions = {}) {
  return runSetupInitOrchestrator(options, {
    setupServerEnv: runCommunitySetupServerEnv,
    agentAssets: createSetupAgentAssetsProvider(),
    officialCatalog: createSetupOfficialCatalogProviderV1(),
  })
}

export async function runCommunitySetupMenu(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(COMMUNITY_SETUP_HOME)
    return
  }

  banner('AOPS Setup')
  logInfo('Install here, or hand a safe setup prompt to any terminal AI agent.')
  logInfo('Enter database secrets only in masked AOPS prompts; never paste them into chat.')
  while (true) {
    const action = await promptSelect({
      message: 'How do you want to continue?',
      type: process.env.AOPS_CLI_MENU_STYLE?.toLowerCase() === 'rawlist' ? 'rawlist' : 'select',
      pageSize: 6,
      choices: [
        { name: 'Install AOPS interactively', value: 'install' },
        { name: 'Set up with an AI agent', value: 'ai' },
        { name: 'Inspect setup readiness', value: 'inspect' },
        { name: 'Configure PostgreSQL connection', value: 'server-env' },
        { name: 'Show packaged agent installation skill', value: 'guide' },
        { name: 'Exit', value: 'exit' },
      ],
    })
    if (action === 'exit') return
    if (action === 'ai') { runCommunitySetupAi(); continue }
    if (action === 'inspect') { await runCommunitySetupInit({ yes: true }); continue }
    if (action === 'server-env') { await runCommunitySetupServerEnv({}); continue }
    if (action === 'guide') { runCommunitySetupGuide(); continue }
    await runCommunitySetupInit({ skipBanner: true })
    return
  }
}

function addSetupInitOptions(command: Command): Command {
  return command
    .option('--path <path>', 'Setup path: 1 | 2 | 3 | 4 (semantic ids are also accepted)')
    .option('--postgres-config <path>', 'PostgreSQL env file override for path 1, or private output path for path 3')
    .option('--postgres-tls <policy>', 'PostgreSQL TLS policy: disable | require | verify-full')
    .option('--local-postgres-host <host>', 'Path 3 local PostgreSQL loopback host (default: 127.0.0.1)')
    .option('--local-postgres-port <port>', 'Path 3 local PostgreSQL port (default: 5432)', (value) => Number.parseInt(String(value), 10))
    .option('--local-postgres-admin-user <user>', 'Path 3 existing PostgreSQL administrator role')
    .option('--local-postgres-database <name>', 'Path 3 new AOPS database name')
    .option('--local-postgres-app-user <user>', 'Path 3 new dedicated AOPS application role')
    .option('--local-postgres-admin-no-password', 'Path 3 non-interactive local trust auth; never bypasses PostgreSQL authentication')
    .option('--api-base-url <url>', 'Local or existing-server API base URL without credentials')
    .option('--instance <name>', 'Local Community instance name')
    .option('--data-root <path>', 'Local Community data root override')
    .option('--source-root <path>', 'Optional native Community source checkout override; npm server package is the default')
    .option('--port <port>', 'Local server port', (value) => Number.parseInt(String(value), 10))
    .option('--target-name <name>', 'Persistent target name for path 4')
    .option('--target-auth-provider <provider>', 'Path 4 target auth: trusted-local | authv2-jwt-session')
    .option('--target-tls-policy <policy>', 'Path 4 target TLS: loopback-http | system-ca')
    .option('--agent-assets <action>', 'Global AOPS gateway action: status | install | repair | skip')
    .option('--agent-assets-release <path>', 'Advanced offline/maintainer override for --agent-assets install')
    .option('--no-catalog', 'Skip the default inert official server catalog import')
    .option('--catalog-release <path>', 'Explicit verified-release override (normally resolved from the Community install)')
    .option('--catalog-idempotency-key <key>', 'Explicit official catalog reconcile replay key')
    .option('--no-seed', 'Skip the default small starter project, kanban board, sprint plan, and user guide')
    .option('--apply', 'Apply the selected path in non-interactive or scripted use (interactive setup applies directly)')
    .option('--resume', 'Resume the same idempotent setup orchestration')
    .option('--timeout-ms <ms>', 'Read-only host probe timeout', (value) => Number.parseInt(String(value), 10))
    .option('--yes', 'Non-interactive; report missing selections as actions')
    .option('--json', 'Output one typed readiness or apply-result envelope')
}

export function makeCommunitySetupCommand(): Command {
  const command = new Command('setup')
    .description('Inspect and bootstrap an AOPS Community installation')
    .addHelpText('after', `
Agent bootstrap:
  aops setup ai             Print a copy-ready prompt for any terminal AI agent
  aops setup guide          Print the packaged agent-readable installation skill
  aops setup guide --json   Return the same guide in a structured envelope
`)
    .action(async () => runCommunitySetupMenu())

  command.addCommand(makeOfficialCatalogSetupCommand())

  command.command('ai')
    .description('Print a safe, copy-ready AOPS installation prompt for a terminal AI agent')
    .option('--json', 'Return the prompt and packaged skill identity as JSON')
    .addHelpText('after', `
This read-only handoff works with Codex, Claude, or another terminal agent. The
prompt directs the agent to the packaged install skill and keeps database
credentials in AOPS masked terminal prompts rather than chat or command argv.
`)
    .action((options: CommunitySetupAiOptions) => runCommunitySetupAi(options))

  command.command('guide')
    .description('Print the packaged agent-readable AOPS installation skill')
    .option('--path', 'Print only the packaged SKILL.md path')
    .option('--json', 'Return skill metadata and content as JSON')
    .addHelpText('after', `
This command is read-only and available immediately after npm installation.
It explains PostgreSQL ownership, setup paths, explicit Gateway activation,
server health verification, and Cockpit handoff. It performs no setup itself.
`)
    .action((options: CommunitySetupGuideOptions) => runCommunitySetupGuide(options))

  addSetupInitOptions(command.command('init')
    .description('Interactively install AOPS, or inspect/apply an explicit path for automation'))
    .addHelpText('after', `
Examples:
  aops setup ai
  aops setup init
  aops setup init --path 1 --postgres-tls require --json
  aops setup init --path 2 --apply --yes
  aops setup init --path 3 --apply
  aops setup init --path 2 --no-seed --apply --yes
  aops setup init --path 4 --api-base-url https://aops.example.com --json
  aops setup init --path 1 --no-catalog --apply --yes

This command is distinct from repo-local \`aops init\`.
Path 1 uses an existing PostgreSQL connection from \`~/.aops/aops.server.env\` by default, or the directory selected by
\`AOPS_CLI_CONFIG_PATH\`. A relative \`AOPS_PG_SSL_ROOT_CERT\` is resolved beside
the selected env file. \`--postgres-config\` remains an explicit override.
Path 2 uses the same npm server and standard port, while AOPS creates a
loopback-only PostgreSQL 17 container on a collision-free Docker-assigned port.
Its password is generated securely by default; the interactive wizard also
allows a masked, confirmed custom password without placing it in shell history.
All PostgreSQL paths plan, apply when needed, and verify database migrations
before the server is reported ready. Interactive terminals show animated
progress and apply directly after required private inputs are collected; there
is no redundant continue or starter-data confirmation. \`--json\` remains free
of spinner output. Path 1 defaults to TLS \`require\`; choose \`verify-full\` when
a trusted CA file is available, or explicitly choose \`disable\` when accepting
an unencrypted PostgreSQL connection.
Path 3 detects PostgreSQL on this computer, securely asks for an existing
administrator role/password, and creates a new dedicated AOPS role and database
before running the same migration verification. Administrator credentials are
never stored. For non-interactive path 3, provide the password through the
private \`AOPS_LOCAL_POSTGRES_ADMIN_PASSWORD\` environment variable; use
\`--local-postgres-admin-no-password\` only when local PostgreSQL trust auth is
already configured. When PostgreSQL is missing or stopped, readiness returns
platform-appropriate Windows, macOS, or Linux installation/start guidance.
The default setup installs the verified AOPS Gateway for every registered agent runtime
and creates a small starter project/board/sprint/user-guide dataset. Use
\`--agent-assets skip\` or \`--no-seed\` only when explicitly desired.
Community agent assets use the TASK-136 \`aops assets\` contract; the
development-only repo-mirror installer is not part of this command.
Source and npm setup import only the inert signed official catalog bundled with
the verified Community release by default.
  The optional application image reuses the exact npm CLI/server lifecycle
  inside a container; it remains a distribution surface rather than another
  interactive setup path.
The CLI first resolves the canonical signed release bundled with the official
npm package, selected source, or installed Community runtime;
\`--catalog-release\` is only an explicit override.
\`--no-catalog\` is the bare/minimal opt-out; it never removes existing rows or
changes the offline client core. Reconcile and rollback remain explicit under
\`aops setup catalog\`.
`)
    .action(async (commandOptions: SetupInitOptions & { catalog?: boolean }) => {
      const { catalog, ...options } = commandOptions
      await runCommunitySetupInit({ ...options, noCatalog: catalog === false })
    })

  command.command('server-env')
    .description('Create or validate the global trusted-local PostgreSQL env for the npm server')
    .option('--env-path <path>', 'Explicit env file override (default: ~/.aops/aops.server.env)')
    .option('--yes', 'Non-interactive; read AOPS_PG_URL from the environment or existing file')
    .option('--json', 'Output a secret-free JSON summary')
    .addHelpText('after', `
Examples:
  aops setup server-env
  AOPS_PG_URL='<private-url>' aops setup server-env --yes --json

Do not place PostgreSQL URLs or passwords in command arguments. Existing unknown
env keys are preserved, and updates are written atomically with owner-only access.
`)
    .action(async (options: CommunitySetupServerEnvOptions) => {
      await runCommunitySetupServerEnv(options)
    })

  return command
}
