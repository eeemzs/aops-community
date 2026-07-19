import path from 'node:path'

import { Command } from 'commander'

import { verifyAndLoadCommunityCatalogReleaseInputs } from '../lib/agent-assets/release-input.js'
import { createHostedOfficialCatalogAdapterV1 } from '../lib/official-catalog-gateway.js'
import {
  buildOfficialCatalogPackageImports,
  OFFICIAL_CATALOG_SCOPE_V1,
  OFFICIAL_CATALOG_TOOL_IDS_V1,
  OfficialCatalogError,
  reconcileOfficialCatalog,
  rollbackOfficialCatalog,
  type OfficialCatalogAdapterV1,
} from '../lib/official-catalog.js'

export const OFFICIAL_CATALOG_SETUP_SURFACE_V1 = 'official-catalog-setup-v1' as const

type CatalogCommonOptions = {
  apiBaseUrl?: string
  timeoutMs?: number
  accessToken?: string
  refreshToken?: string
  tenantId?: string
  locale?: string
  fallbackLocale?: string
  json?: boolean
}

export type OfficialCatalogStatusOptions = CatalogCommonOptions

export type OfficialCatalogReconcileOptions = CatalogCommonOptions & {
  fromRelease?: string
  idempotencyKey?: string
  preview?: boolean
  apply?: boolean
}

export type OfficialCatalogRollbackOptions = CatalogCommonOptions & {
  receipt?: string
  idempotencyKey?: string
  preview?: boolean
  apply?: boolean
  confirm?: boolean
}

export type OfficialCatalogCommandDependencies = Readonly<{
  adapter?: OfficialCatalogAdapterV1
  loadRelease?: typeof verifyAndLoadCommunityCatalogReleaseInputs
}>

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new OfficialCatalogError('catalog_release_invalid', `${flag} is required.`)
  return normalized
}

function releaseRoot(value: string | undefined): string {
  const normalized = required(value, '--from-release')
  if (/\0|\r|\n/.test(normalized) || /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    throw new OfficialCatalogError('catalog_release_invalid', '--from-release must be a local verified release directory.')
  }
  return path.resolve(normalized)
}

function mode(options: { preview?: boolean; apply?: boolean }): 'preview' | 'apply' {
  if (options.preview && options.apply) {
    throw new OfficialCatalogError('catalog_release_invalid', '--preview and --apply are mutually exclusive.')
  }
  return options.apply === true ? 'apply' : 'preview'
}

async function resolveAdapter(
  options: CatalogCommonOptions,
  dependencies: OfficialCatalogCommandDependencies,
): Promise<OfficialCatalogAdapterV1> {
  if (dependencies.adapter) return dependencies.adapter
  return createHostedOfficialCatalogAdapterV1(options)
}

function print(command: string, mutationFree: boolean, result: unknown): void {
  console.log(JSON.stringify({
    schemaVersion: 1,
    surface: OFFICIAL_CATALOG_SETUP_SURFACE_V1,
    command,
    mutationFree,
    scope: OFFICIAL_CATALOG_SCOPE_V1,
    result,
  }, null, 2))
}

export async function runOfficialCatalogStatus(
  options: OfficialCatalogStatusOptions = {},
  dependencies: OfficialCatalogCommandDependencies = {},
): Promise<unknown> {
  const adapter = await resolveAdapter(options, dependencies)
  const result = await adapter.inspect()
  print('setup.catalog.status', true, result)
  return result
}

export async function runOfficialCatalogReconcile(
  options: OfficialCatalogReconcileOptions = {},
  dependencies: OfficialCatalogCommandDependencies = {},
): Promise<unknown> {
  const selectedMode = mode(options)
  const loadRelease = dependencies.loadRelease ?? verifyAndLoadCommunityCatalogReleaseInputs
  const inputs = await loadRelease({
    releaseRoot: releaseRoot(options.fromRelease),
    verificationMode: 'offline',
  })
  const packages = buildOfficialCatalogPackageImports(inputs)
  const adapter = await resolveAdapter(options, dependencies)
  const result = await reconcileOfficialCatalog({
    adapter,
    packages,
    mode: selectedMode,
    idempotencyKey: options.idempotencyKey,
  })
  print('setup.catalog.reconcile', selectedMode === 'preview' || result.kind === 'aops-official-catalog-reconcile-plan-v1', result)
  return result
}

export async function runOfficialCatalogRollback(
  options: OfficialCatalogRollbackOptions = {},
  dependencies: OfficialCatalogCommandDependencies = {},
): Promise<unknown> {
  const selectedMode = mode(options)
  if (selectedMode === 'apply' && options.confirm !== true) {
    throw new OfficialCatalogError('catalog_release_invalid', 'Rollback requires --apply --confirm.')
  }
  const adapter = await resolveAdapter(options, dependencies)
  const result = await rollbackOfficialCatalog({
    adapter,
    receiptId: required(options.receipt, '--receipt'),
    mode: selectedMode,
    idempotencyKey: options.idempotencyKey,
  })
  print('setup.catalog.rollback', selectedMode === 'preview', result)
  return result
}

function addRemoteOptions(command: Command): Command {
  return command
    .option('--api-base-url <url>', 'Local or remote AOPS server URL')
    .option('--timeout-ms <ms>', 'Hosted operation timeout', (value) => Number.parseInt(String(value), 10))
    .option('--tenant-id <id>', 'Tenant routing header; catalog scope remains fixed')
    .option('--json', 'Output the stable official-catalog-setup-v1 envelope')
}

export function makeOfficialCatalogSetupCommand(
  dependencies: OfficialCatalogCommandDependencies = {},
): Command {
  const command = new Command('catalog')
    .description(
      `Inspect or reconcile the inert signed AOPS official server catalog in the fixed ${OFFICIAL_CATALOG_SCOPE_V1.slug} scope (server contract: ${OFFICIAL_CATALOG_TOOL_IDS_V1.reconcile})`,
    )

  addRemoteOptions(command.command('status')
    .description('Inspect only the reserved official catalog scope')
    .action(async (options: OfficialCatalogStatusOptions) => {
      await runOfficialCatalogStatus(options, dependencies)
    }))

  addRemoteOptions(command.command('reconcile')
    .description('Preview or apply an append-only reconcile from one verified Community release')
    .requiredOption('--from-release <path>', 'Local signed Community release directory')
    .option('--idempotency-key <key>', 'Explicit replay key; otherwise derived from release and reserved-scope revision')
    .option('--preview', 'Preview only (default)')
    .option('--apply', 'Append versions and update only the reserved current-version map')
    .action(async (options: OfficialCatalogReconcileOptions) => {
      await runOfficialCatalogReconcile(options, dependencies)
    }))

  addRemoteOptions(command.command('rollback')
    .description('Restore a prior reserved current-version map without deleting history')
    .requiredOption('--receipt <id>', 'Exact reconcile receipt to restore')
    .option('--idempotency-key <key>', 'Explicit rollback replay key')
    .option('--preview', 'Preview only (default)')
    .option('--apply', 'Apply the receipt-targeted current-version rollback')
    .option('--confirm', 'Confirm the rollback; required with --apply')
    .action(async (options: OfficialCatalogRollbackOptions) => {
      await runOfficialCatalogRollback(options, dependencies)
    }))

  command.addHelpText('after', `
The reserved scope is fixed to ${OFFICIAL_CATALOG_SCOPE_V1.slug}. It is routing
identity only: official trust comes from the verified Community release and the
package/release digests persisted in SkillVersion meta. Import is inert and does
not select a discipline, mutate a mission policy, or touch user/project scopes.

Agentspace owns the atomic composite operations and durable receipts. Inspect
their exact server contracts with:
  aops-cli agent schema --tool ${OFFICIAL_CATALOG_TOOL_IDS_V1.inspect} --summary
  aops-cli agent schema --tool ${OFFICIAL_CATALOG_TOOL_IDS_V1.reconcile} --summary
  aops-cli agent schema --tool ${OFFICIAL_CATALOG_TOOL_IDS_V1.rollback} --summary

Examples:
  aops-cli setup catalog status --json
  aops-cli setup catalog reconcile --from-release <path> --preview --json
  aops-cli setup catalog reconcile --from-release <path> --apply --json
  aops-cli setup catalog rollback --receipt <id> --preview --json
  aops-cli setup catalog rollback --receipt <id> --apply --confirm --json
`)

  return command
}
