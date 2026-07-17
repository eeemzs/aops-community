import { Command } from 'commander'

import { getActiveApiTarget } from '../utils/config.js'
import { inspectCommunityInstall } from '../lib/community-lifecycle.js'
import { resolveCommunityCliIdentity } from '../lib/community-client-contract.js'

type VersionOptions = { verbose?: boolean; json?: boolean; instance?: string; dataRoot?: string }

export async function runVersion(options: VersionOptions = {}): Promise<void> {
  const identity = resolveCommunityCliIdentity()
  if (!options.verbose) {
    if (options.json) console.log(JSON.stringify(identity, null, 2))
    else console.log(identity.version)
    return
  }
  const target = getActiveApiTarget()
  const install = inspectCommunityInstall({ instanceName: options.instance, dataRoot: options.dataRoot })
  const result = {
    cli: identity,
    selectedTarget: target ?? null,
    localInstance: install.status === 'installed'
      ? {
          status: install.status,
          instance: install.state!.instanceName,
          runtime: 'oci',
          releaseVersion: install.state!.activeRelease.releaseVersion,
        }
      : { status: install.status, instanceRoot: install.paths.instanceRoot },
    compatibility: target?.compatibility ?? null,
  }
  if (options.json) console.log(JSON.stringify(result, null, 2))
  else console.log(JSON.stringify(result, null, 2))
}

export function makeVersionCommand(): Command {
  return new Command('version')
    .description('Show immutable CLI identity and optional target/runtime context')
    .option('--verbose', 'Include selected target, local instance, and last observed compatibility')
    .option('--instance <name>', 'Local instance name used by --verbose', 'default')
    .option('--data-root <path>', 'Local instance data-root override')
    .option('--json', 'Output JSON')
    .action(runVersion)
}
