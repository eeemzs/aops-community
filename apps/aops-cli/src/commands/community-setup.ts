import { Command } from 'commander'

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

export async function runCommunitySetupInit(options: SetupInitOptions = {}) {
  return runSetupInitOrchestrator(options, {
    setupServerEnv: runCommunitySetupServerEnv,
    officialCatalog: createSetupOfficialCatalogProviderV1(),
  })
}

function addSetupInitOptions(command: Command): Command {
  return command
    .option('--path <path>', 'Setup path: 1 | 2 | 3 | 4 (semantic ids are also accepted)')
    .option('--postgres-config <path>', 'Explicit PostgreSQL env file override for path 1')
    .option('--postgres-tls <policy>', 'Path 1 TLS policy: disable | require | verify-full')
    .option('--api-base-url <url>', 'Local or existing-server API base URL without credentials')
    .option('--instance <name>', 'Local Community instance name')
    .option('--data-root <path>', 'Local Community data root override')
    .option('--source-root <path>', 'Native Community source checkout override for paths 1 and 2')
    .option('--port <port>', 'Local server port', (value) => Number.parseInt(String(value), 10))
    .option('--target-name <name>', 'Persistent target name for path 4')
    .option('--target-auth-provider <provider>', 'Path 4 target auth: trusted-local | authv2-jwt-session')
    .option('--target-tls-policy <policy>', 'Path 4 target TLS: loopback-http | system-ca')
    .option('--agent-assets <action>', 'Global AOPS gateway action: status | install | repair | skip')
    .option('--agent-assets-release <path>', 'Verified release directory for --agent-assets install')
    .option('--no-catalog', 'Skip the default inert official server catalog import')
    .option('--catalog-release <path>', 'Explicit verified-release override (normally resolved from the Community install)')
    .option('--catalog-idempotency-key <key>', 'Explicit official catalog reconcile replay key')
    .option('--apply', 'Apply the selected path after readiness checks')
    .option('--resume', 'With --apply, resume the same idempotent setup orchestration')
    .option('--timeout-ms <ms>', 'Read-only host probe timeout', (value) => Number.parseInt(String(value), 10))
    .option('--yes', 'Non-interactive; report missing selections as actions')
    .option('--json', 'Output one typed readiness or apply-result envelope')
}

export function makeCommunitySetupCommand(): Command {
  const command = new Command('setup')
    .description('Inspect and bootstrap an AOPS Community installation')

  command.addCommand(makeOfficialCatalogSetupCommand())

  addSetupInitOptions(command.command('init')
    .description('Guide paths 1, 2, 3, or 4; read-only unless --apply is supplied'))
    .addHelpText('after', `
Examples:
  aops-cli setup init
  aops-cli setup init --path 1 --postgres-tls verify-full --json
  aops-cli setup init --path 3 --apply --yes
  aops-cli setup init --path 4 --api-base-url https://aops.example.com --json
  aops-cli setup init --path 2 --catalog-release <path> --apply --yes
  aops-cli setup init --path 2 --no-catalog --apply --yes

This command is distinct from repo-local \`aops-cli init\`.
Path 1 uses \`~/.aops/aops.server.env\` by default, or the directory selected by
\`AOPS_CLI_CONFIG_PATH\`. A relative \`AOPS_PG_SSL_ROOT_CERT\` is resolved beside
the selected env file. \`--postgres-config\` remains an explicit override.
Community agent assets use the TASK-136 \`aops-cli assets\` contract; the
development-only repo-mirror installer is not part of this command.
Fresh server setup imports only the inert signed official catalog by default.
The CLI first resolves the canonical signed release from the selected source or
installed Community runtime; \`--catalog-release\` is only an explicit override.
\`--no-catalog\` is the bare/minimal opt-out; it never removes existing rows or
changes the offline client core. Reconcile and rollback remain explicit under
\`aops-cli setup catalog\`.
`)
    .action(async (options: SetupInitOptions) => {
      await runCommunitySetupInit(options)
    })

  command.command('server-env')
    .description('Create or validate the global trusted-local PostgreSQL env for path 1')
    .option('--env-path <path>', 'Explicit env file override (default: ~/.aops/aops.server.env)')
    .option('--yes', 'Non-interactive; read AOPS_PG_URL from the environment or existing file')
    .option('--json', 'Output a secret-free JSON summary')
    .addHelpText('after', `
Examples:
  aops-cli setup server-env
  AOPS_PG_URL='<private-url>' aops-cli setup server-env --yes --json

Do not place PostgreSQL URLs or passwords in command arguments. Existing unknown
env keys are preserved, and updates are written atomically with owner-only access.
`)
    .action(async (options: CommunitySetupServerEnvOptions) => {
      await runCommunitySetupServerEnv(options)
    })

  return command
}
