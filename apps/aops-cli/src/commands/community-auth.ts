import { Command } from 'commander'

import { runAuthImport } from './auth/import.js'
import { runAuthLogin, runAuthLogout } from './auth/login.js'

const SECRET_ARGV = new Set(['--password', '--access-token', '--refresh-token'])

export function guardCommunitySecretArgv(argv: readonly string[]): void {
  for (const token of argv.slice(2)) {
    const flag = token.split('=', 1)[0]?.toLowerCase()
    if (SECRET_ARGV.has(flag)) {
      throw new Error(`community_secret_argv_refused:${flag}:use_interactive_prompt_secure_store_or_environment`)
    }
  }
}

export function makeCommunityAuthCommand(): Command {
  const command = new Command('auth').description('Authenticate the CLI to a named authv2 server target')
  command.command('login')
    .description('Login interactively and store target-bound encrypted tokens')
    .option('--target <name>', 'Named target; default is the active target')
    .option('--api-base-url <url>', 'Server URL; must match --target when both are supplied')
    .option('--email <email>', 'User email; non-interactive alternative: AOPS_AUTH_EMAIL')
    .option('--timeout-ms <ms>', 'Request timeout', (value) => Number.parseInt(value, 10))
    .option('--yes', 'Non-interactive; use AOPS_AUTH_EMAIL and AOPS_AUTH_PASSWORD')
    .option('--json', 'Output JSON')
    .action(runAuthLogin)
  command.command('import')
    .description('Import target-bound tokens from environment variables')
    .option('--target <name>', 'Named target; default is the active target')
    .option('--api-base-url <url>', 'Server URL; must match --target when both are supplied')
    .option('--user-id <id>', 'Optional non-secret user id')
    .option('--from-env', 'Read AOPS_API_ACCESS_TOKEN and AOPS_API_REFRESH_TOKEN', true)
    .option('--yes', 'Non-interactive')
    .option('--json', 'Output JSON')
    .action(runAuthImport)
  command.command('logout')
    .description('Remove encrypted credentials for one target')
    .option('--target <name>', 'Named target; default is the active target')
    .option('--json', 'Output JSON')
    .action(runAuthLogout)
  return command
}
