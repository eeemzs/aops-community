import { rmSync } from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'

import {
  buildCommunityComposeInvocation,
  inspectCommunityInstall,
  readCommunityBackupReceipt,
  resolveCommunityInstallPaths,
  restoreCommunityBackup,
  rollbackCommunityInstall,
  setupCommunityInstall,
  stageCommunityRelease,
  updateCommunityInstall,
  verifyStagedCommunityRelease,
  verifyCommunityBackupRecord,
  writeCommunityBackupReceipt,
} from '../lib/community-lifecycle.js'
import { communityProcessRuntime, createCommunityDockerAdapter } from '../lib/community-docker-adapter.js'
import { verifyCommunityReleaseBundle } from '../lib/community-release-verifier.js'

export type CommunityServerOptions = {
  instance?: string
  dataRoot?: string
  releaseDir?: string
  port?: string | number
  certificateIdentity?: string
  certificateOidcIssuer?: string
  tail?: string | number
  backup?: string
  confirmDataRewind?: boolean
  confirmDataLoss?: boolean
  confirmInstance?: string
  json?: boolean
}

function pathsFrom(options: CommunityServerOptions) {
  return resolveCommunityInstallPaths({ instanceName: options.instance, dataRoot: options.dataRoot })
}

function writeResult(result: unknown, json = false): void {
  if (json) console.log(JSON.stringify(result, null, 2))
  else if (typeof result === 'string') process.stdout.write(result.endsWith('\n') ? result : `${result}\n`)
  else console.log(JSON.stringify(result, null, 2))
}

function releaseBundle(options: CommunityServerOptions) {
  return verifyCommunityReleaseBundle({
    releaseRoot: path.resolve(options.releaseDir ?? process.cwd()),
    certificateIdentity: options.certificateIdentity,
    certificateOidcIssuer: options.certificateOidcIssuer,
  })
}

function adapter() {
  return createCommunityDockerAdapter({
    verifyRelease: async (release) => verifyStagedCommunityRelease(release),
  })
}

function requireInstalled(options: CommunityServerOptions) {
  const inspection = inspectCommunityInstall({ instanceName: options.instance, dataRoot: options.dataRoot })
  if (inspection.status === 'not-installed') throw new Error('community_not_installed:run_aops-cli_server_setup')
  if (inspection.status === 'partial') throw new Error(`community_install_partial:${inspection.error ?? 'unknown'}:run_aops-cli_doctor`)
  return { paths: inspection.paths, state: inspection.state! }
}

export async function runCommunityServerSetup(options: CommunityServerOptions): Promise<void> {
  const existing = inspectCommunityInstall({ instanceName: options.instance, dataRoot: options.dataRoot })
  if (existing.status === 'partial') {
    throw new Error(`community_install_partial:${existing.error ?? 'unknown'}:run_aops-cli_doctor_or_server_reset`)
  }
  const verified = await releaseBundle(options)
  const port = Number(options.port ?? 5900)
  const setup = setupCommunityInstall({
    manifestContent: verified.manifestContent,
    composeContent: verified.composeContent,
    manifestVerified: true,
    instanceName: options.instance,
    dataRoot: options.dataRoot,
    port,
  })
  const lifecycle = adapter()
  await lifecycle.verifyRelease(setup.state.activeRelease)
  await lifecycle.pull({ paths: setup.paths, state: setup.state, release: setup.state.activeRelease })
  await lifecycle.start({
    paths: setup.paths,
    state: setup.state,
    release: setup.state.activeRelease,
    postgresVolumeName: setup.state.postgresVolumeName,
  })
  await lifecycle.health({ paths: setup.paths, state: setup.state })
  await lifecycle.dataSmoke({ paths: setup.paths, state: setup.state })
  writeResult({
    status: setup.status === 'created' ? 'community-server-installed-and-running' : 'community-server-running',
    instance: setup.state.instanceName,
    releaseVersion: setup.state.activeRelease.releaseVersion,
    imageRef: setup.state.activeRelease.imageRef,
    dataRoot: setup.paths.dataRoot,
    certificateIdentity: verified.certificateIdentity,
    verifiedArtifactCount: verified.verifiedArtifactCount,
  }, options.json)
}

export async function runCommunityServerStart(options: CommunityServerOptions): Promise<void> {
  const { paths, state } = requireInstalled(options)
  const lifecycle = adapter()
  await lifecycle.verifyRelease(state.activeRelease)
  await lifecycle.pull({ paths, state, release: state.activeRelease })
  await lifecycle.start({ paths, state, release: state.activeRelease, postgresVolumeName: state.postgresVolumeName })
  await lifecycle.health({ paths, state })
  await lifecycle.dataSmoke({ paths, state })
  writeResult({ status: 'community-server-running', instance: state.instanceName, imageRef: state.activeRelease.imageRef }, options.json)
}

export async function runCommunityServerStop(options: CommunityServerOptions): Promise<void> {
  const { paths, state } = requireInstalled(options)
  await adapter().stop({ paths, state })
  writeResult({ status: 'community-server-stopped', instance: state.instanceName }, options.json)
}

export async function runCommunityServerRestart(options: CommunityServerOptions): Promise<void> {
  const { paths, state } = requireInstalled(options)
  const lifecycle = adapter()
  const invocation = buildCommunityComposeInvocation({ paths, state, action: 'restart' })
  const result = await communityProcessRuntime.run(invocation)
  if (result.exitCode !== 0) throw new Error(`community_process_failed:restart:${result.exitCode}:${result.stderr.trim().slice(-1000)}`)
  await lifecycle.health({ paths, state })
  await lifecycle.dataSmoke({ paths, state })
  writeResult({ status: 'community-server-restarted', instance: state.instanceName }, options.json)
}

export async function runCommunityServerStatus(options: CommunityServerOptions): Promise<void> {
  const inspection = inspectCommunityInstall({ instanceName: options.instance, dataRoot: options.dataRoot })
  if (inspection.status !== 'installed') {
    writeResult({
      status: inspection.status,
      instanceRoot: inspection.paths.instanceRoot,
      error: inspection.error ?? null,
      presentFiles: inspection.presentFiles,
      missingFiles: inspection.missingFiles,
    }, options.json)
    return
  }
  const invocation = buildCommunityComposeInvocation({ paths: inspection.paths, state: inspection.state!, action: 'status' })
  const result = await communityProcessRuntime.run(invocation)
  if (options.json) {
    writeResult({
      status: result.exitCode === 0 ? 'installed' : 'docker-status-failed',
      instance: inspection.state!.instanceName,
      releaseVersion: inspection.state!.activeRelease.releaseVersion,
      imageRef: inspection.state!.activeRelease.imageRef,
      docker: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr },
    }, true)
  } else {
    writeResult(result.stdout || result.stderr || `AOPS Community ${inspection.state!.activeRelease.releaseVersion} is installed.`)
  }
  if (result.exitCode !== 0) process.exitCode = 1
}

export async function runCommunityServerLogs(options: CommunityServerOptions): Promise<void> {
  const { paths, state } = requireInstalled(options)
  const tail = Number(options.tail ?? 100)
  if (!Number.isSafeInteger(tail) || tail < 1 || tail > 10_000) throw new Error('community_logs_tail_invalid')
  const result = await communityProcessRuntime.run(buildCommunityComposeInvocation({ paths, state, action: 'logs', logsTail: tail }))
  if (options.json) writeResult({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }, true)
  else writeResult(`${result.stdout}${result.stderr}`)
  if (result.exitCode !== 0) process.exitCode = 1
}

export async function runCommunityServerUpdate(options: CommunityServerOptions): Promise<void> {
  const { paths } = requireInstalled(options)
  const verified = await releaseBundle(options)
  const targetRelease = stageCommunityRelease({
    paths,
    manifestContent: verified.manifestContent,
    composeContent: verified.composeContent,
    manifestVerified: true,
  })
  const record = await updateCommunityInstall({ paths, targetRelease, adapter: adapter() })
  writeResult({
    status: 'community-server-updated',
    updateId: record.id,
    releaseVersion: record.targetRelease.releaseVersion,
    imageRef: record.targetRelease.imageRef,
    backup: { path: record.backup.path, sha256: record.backup.sha256, byteLength: record.backup.byteLength },
  }, options.json)
}

export async function runCommunityServerRollback(options: CommunityServerOptions): Promise<void> {
  const { paths } = requireInstalled(options)
  const record = await rollbackCommunityInstall({
    paths,
    adapter: adapter(),
    confirmDataRewind: options.confirmDataRewind === true,
  })
  writeResult({
    status: 'community-server-rolled-back',
    updateId: record.id,
    releaseVersion: record.priorRelease.releaseVersion,
    replacementVolumeName: record.replacementVolumeName,
  }, options.json)
}

export async function runCommunityServerBackup(options: CommunityServerOptions): Promise<void> {
  const { paths, state } = requireInstalled(options)
  const record = await adapter().createBackup({ paths, state })
  await verifyCommunityBackupRecord(record)
  const receiptPath = writeCommunityBackupReceipt(paths, record)
  writeResult({
    status: 'community-backup-created',
    backup: { path: record.path, receiptPath, sha256: record.sha256, byteLength: record.byteLength },
    sourceRelease: record.sourceRelease.imageRef,
  }, options.json)
}

export async function runCommunityServerRestore(options: CommunityServerOptions): Promise<void> {
  const { paths } = requireInstalled(options)
  if (!options.backup) throw new Error('community_restore_backup_path_required')
  const backup = await readCommunityBackupReceipt(paths, path.resolve(options.backup))
  const result = await restoreCommunityBackup({
    paths,
    backup,
    adapter: adapter(),
    confirmDataRewind: options.confirmDataRewind === true,
  })
  writeResult({
    status: 'community-backup-restored',
    backup: { path: backup.path, sha256: backup.sha256, byteLength: backup.byteLength },
    replacementVolumeName: result.replacementVolumeName,
  }, options.json)
}

export async function runCommunityServerReset(options: CommunityServerOptions): Promise<void> {
  const instance = (options.instance ?? 'default').trim().toLowerCase()
  if (options.confirmDataLoss !== true || options.confirmInstance !== instance) {
    throw new Error('community_reset_confirmation_required:use_--confirm-data-loss_--confirm-instance')
  }
  const inspection = inspectCommunityInstall({ instanceName: instance, dataRoot: options.dataRoot })
  if (inspection.status === 'installed') {
    await adapter().stop({ paths: inspection.paths, state: inspection.state! })
  }
  const expectedRoot = pathsFrom({ ...options, instance }).instanceRoot
  if (path.resolve(expectedRoot) !== path.resolve(inspection.paths.instanceRoot)) throw new Error('community_reset_path_mismatch')
  rmSync(expectedRoot, { recursive: true, force: true })
  writeResult({ status: 'community-install-reset', instance, removedRoot: expectedRoot }, options.json)
}

function common(command: Command): Command {
  return command
    .option('--instance <name>', 'Installation instance name', 'default')
    .option('--data-root <path>', 'Absolute Community data root override')
    .option('--json', 'Output JSON')
}

function releaseOptions(command: Command): Command {
  return command
    .option('--release-dir <path>', 'Directory containing release.json and signed release artifacts', '.')
    .option('--certificate-identity <identity>', 'Trusted GitHub Actions certificate identity')
    .option('--certificate-oidc-issuer <url>', 'Trusted certificate OIDC issuer')
}

export function makeCommunityServerCommand(): Command {
  const command = new Command('server').description('Install and operate the pull-only AOPS Community server')
  common(releaseOptions(command.command('setup').description('Verify a release, install it, and start the server')))
    .option('--port <number>', 'Host port', '5900')
    .action(runCommunityServerSetup)
  common(command.command('start').alias('up').description('Pull the installed digest and start the server')).action(runCommunityServerStart)
  common(command.command('stop').alias('down').description('Stop the server without deleting data')).action(runCommunityServerStop)
  common(command.command('restart').description('Restart the installed server')).action(runCommunityServerRestart)
  common(command.command('status').description('Show install and container status')).action(runCommunityServerStatus)
  common(command.command('logs').description('Show recent server logs'))
    .option('--tail <number>', 'Number of log lines', '100')
    .action(runCommunityServerLogs)
  common(releaseOptions(command.command('update').description('Verify, back up, and update to a signed release')))
    .action(runCommunityServerUpdate)
  common(command.command('rollback').description('Restore the verified pre-update backup into a fresh data volume'))
    .option('--confirm-data-rewind', 'Confirm that data will be rewound to the pre-update backup')
    .action(runCommunityServerRollback)
  common(command.command('backup').description('Create and verify a custom-format PostgreSQL backup plus receipt'))
    .action(runCommunityServerBackup)
  common(command.command('restore').description('Restore a verified manual backup into a fresh data volume'))
    .requiredOption('--backup <path>', 'Backup dump path; its JSON receipt must exist beside it')
    .option('--confirm-data-rewind', 'Confirm that data will be rewound to the selected backup')
    .action(runCommunityServerRestore)
  common(command.command('reset').description('Remove local installation state; Docker named volumes are preserved'))
    .requiredOption('--confirm-instance <name>', 'Repeat the instance name')
    .option('--confirm-data-loss', 'Confirm removal of the installation state and its active data pointer')
    .action(runCommunityServerReset)
  return command
}
