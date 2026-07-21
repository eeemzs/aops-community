export const SETUP_AGENT_ASSETS_CONTRACT = Object.freeze({
  task: 'TASK-136',
  surface: 'agent-assets-client-v1',
  statusCommand: 'aops assets status --verify quick --json',
  installCommand: 'aops assets install --target all --apply --json',
  repairCommand: 'aops assets repair --repair-bindings --apply --json',
  transitionRemovalCondition:
    'Satisfied by the native TASK-136 provider composed after TASK-137; never route through setup agent-assets.',
})

export const SETUP_AGENT_ASSETS_GATEWAYS = Object.freeze({
  codex: '<codex-home>/skills/aops/SKILL.md',
  claude: '<claude-home>/skills/aops/SKILL.md',
})

export type SetupAgentAssetsStatus = Readonly<{
  availability: 'available' | 'task-136-pending'
  state: 'ready' | 'action-required' | 'conflict'
  summary: string
  nextActions: readonly string[]
  data?: Readonly<Record<string, unknown>>
}>

export type SetupAgentAssetsProvider = Readonly<{
  /**
   * Adapter over the canonical read-only `assets.status` contract. Repo
   * `.aops/hosted` mirrors must never back this method.
   */
  status: () => Promise<SetupAgentAssetsStatus>
  resolveRelease?: (options: Readonly<{
    sourceRoot?: string
    instance?: string
    dataRoot?: string
  }>) => Promise<Readonly<{ fromRelease: string; source: string }>>
  apply?: (options: Readonly<{
    action: 'install' | 'update' | 'repair'
    fromRelease?: string
    target: AgentAssetTargetInput
  }>) => Promise<SetupAgentAssetsStatus>
}>

export type SetupAgentAssetsProviderDependencies = Readonly<{
  roots?: typeof resolveAgentAssetsRoots
  readStatus?: typeof readAgentAssetsStoreStatus
  inspectBindings?: typeof inspectRuntimeGatewayBindings
  verifyRelease?: typeof verifyAndLoadCommunityCoreReleaseInput
  applyCore?: typeof applyVerifiedCommunityCore
  repairBindings?: typeof repairAgentAssetRuntimeBindings
  inspectLegacyPointers?: typeof inspectLegacyAopsPointers
  migrateLegacyPointers?: typeof migrateLegacyAopsPointers
  resolveRelease?: typeof resolveSetupAgentAssetsReleaseV1
}>

export async function verifySetupAgentAssetsReleaseInput(
  verifyRelease: typeof verifyAndLoadCommunityCoreReleaseInput,
  releaseRoot: string,
) {
  return verifyRelease({ releaseRoot, verificationMode: 'offline' })
}

export function createSetupAgentAssetsProvider(
  dependencies: SetupAgentAssetsProviderDependencies = {},
): SetupAgentAssetsProvider {
  const resolveRoots = dependencies.roots ?? resolveAgentAssetsRoots
  const readStatus = dependencies.readStatus ?? readAgentAssetsStoreStatus
  const inspectBindings = dependencies.inspectBindings ?? inspectRuntimeGatewayBindings
  const verifyRelease = dependencies.verifyRelease ?? verifyAndLoadCommunityCoreReleaseInput
  const applyCore = dependencies.applyCore ?? applyVerifiedCommunityCore
  const repairBindings = dependencies.repairBindings ?? repairAgentAssetRuntimeBindings
  const inspectLegacyPointers = dependencies.inspectLegacyPointers ?? inspectLegacyAopsPointers
  const migrateLegacyPointers = dependencies.migrateLegacyPointers ?? migrateLegacyAopsPointers
  const resolveRelease = dependencies.resolveRelease ?? resolveSetupAgentAssetsReleaseV1
  const inspect = async (): Promise<SetupAgentAssetsStatus> => {
    const roots = resolveRoots({})
    const store = readStatus({ assetRoot: roots.assetRoot, verify: 'quick' })
    const bindings = inspectBindings({
      assetRoot: roots.assetRoot,
      runtimeHomes: {
        codex: roots.runtimeHomes.codex.absolutePath,
        claude: roots.runtimeHomes.claude.absolutePath,
      },
    })
    const states = AGENT_ASSET_RUNTIME_IDS.map((runtime) => bindings[runtime].state)
    const recoveryReasons = store.recoveryReasons ?? []
    const storeDrift = recoveryReasons.length > 0
    const ready = store.state === 'ready' && !storeDrift && states.every((state) => state === 'ready')
    const conflict = states.some((state) => state === 'ownership-conflict' || state === 'unsafe-path')
    return Object.freeze({
      availability: 'available' as const,
      state: ready ? 'ready' as const : conflict ? 'conflict' as const : 'action-required' as const,
      summary: ready
        ? 'The verified AOPS core and all registered runtime gateways are ready.'
        : conflict
          ? 'A global runtime gateway has an ownership or unsafe-path conflict.'
          : store.state === 'ready' && storeDrift
            ? 'The verified AOPS core remains usable, but authenticated staging or receipt drift requires inspection.'
          : store.state === 'ready'
            ? 'The verified AOPS core is ready, but one or more runtime bindings require repair.'
            : 'The verified global AOPS client core is not installed.',
      nextActions: Object.freeze(ready
        ? []
        : conflict
          ? ['Inspect `aops assets status --verify full --json`; unknown user files are never overwritten.']
          : store.state === 'ready' && storeDrift
            ? ['Inspect `aops assets status --verify full --json` and reconcile only the reported managed recovery state.']
          : store.state === 'ready'
            ? ['Run `aops assets repair --repair-bindings --apply --json`.']
            : ['Run `aops assets install --target all --apply --json`.']),
      data: Object.freeze({
        store,
        runtimeBindings: bindings,
        recommendedAction: store.state === 'ready'
          ? storeDrift ? 'inspect-recovery' : 'repair'
          : 'install',
      }),
    })
  }
  return Object.freeze({
    status: inspect,
    async resolveRelease(options) {
      return resolveRelease(options)
    },
    async apply(options) {
      const roots = resolveRoots({})
      const target = resolveAgentAssetTargetSelection(options.target)
      const runtimeHomes = selectAgentAssetRuntimeHomes(target, {
        codex: roots.runtimeHomes.codex.absolutePath,
        claude: roots.runtimeHomes.claude.absolutePath,
      })
      if (options.action === 'install' || options.action === 'update') {
        if (!options.fromRelease) throw new Error('setup_init_agent_assets_release_required_for_install')
        const release = await verifySetupAgentAssetsReleaseInput(verifyRelease, options.fromRelease)
        const classifications = inspectLegacyPointers({ assetRoot: roots.assetRoot, runtimeHomes })
        const conflicts = classifications.filter((item) => (
          item.state !== 'absent'
          && item.state !== 'managed-ready'
          && item.state !== 'recognized-legacy'
        ) || (item.state === 'recognized-legacy' && !item.eligible))
        if (conflicts.length > 0) {
          throw new Error(`setup_init_agent_assets_runtime_conflict:${conflicts.map((item) => `${item.runtime}:${item.state}`).join(',')}`)
        }
        const legacyRuntimes = new Set(classifications
          .filter((item) => item.state === 'recognized-legacy')
          .map((item) => item.runtime))
        const directRuntimeHomes = Object.freeze(Object.fromEntries(
          target.runtimes
            .filter((runtime) => !legacyRuntimes.has(runtime))
            .map((runtime) => [runtime, runtimeHomes[runtime]!]),
        ))
        await applyCore({
          assetRoot: roots.assetRoot,
          release,
          requestedOperation: options.action,
          runtimeHomes: directRuntimeHomes,
        })
        if (legacyRuntimes.size > 0) {
          await migrateLegacyPointers({
            assetRoot: roots.assetRoot,
            runtimeHomes: Object.freeze(Object.fromEntries(
              target.runtimes
                .filter((runtime) => legacyRuntimes.has(runtime))
                .map((runtime) => [runtime, runtimeHomes[runtime]!]),
            )),
          })
        }
      } else {
        await repairBindings({
          assetRoot: roots.assetRoot,
          runtimeHomes,
        })
      }
      return inspect()
    },
  })
}

function normalizeProviderStatus(status: SetupAgentAssetsStatus): SetupAgentAssetsStatus {
  if (status.availability !== 'available') {
    throw new Error('setup_agent_assets_provider_contract_invalid')
  }
  return Object.freeze({
    ...status,
    nextActions: Object.freeze([...status.nextActions]),
    data: Object.freeze({
      ...status.data,
      surface: SETUP_AGENT_ASSETS_CONTRACT.surface,
      gatewayDestinations: SETUP_AGENT_ASSETS_GATEWAYS,
      legacyRepoMirrorInstallerUsed: false,
    }),
  })
}

export async function inspectSetupAgentAssets(
  provider?: SetupAgentAssetsProvider,
): Promise<SetupAgentAssetsStatus> {
  if (!provider) {
    return Object.freeze({
      availability: 'task-136-pending',
      state: 'action-required',
      summary: 'The canonical global AOPS agent-assets client is not available in this build yet.',
      nextActions: Object.freeze([
        'Complete TASK-136 on the TASK-137 merge base, then run `aops assets status --verify quick --json`.',
      ]),
      data: Object.freeze({
        task: SETUP_AGENT_ASSETS_CONTRACT.task,
        surface: SETUP_AGENT_ASSETS_CONTRACT.surface,
        gatewayDestinations: SETUP_AGENT_ASSETS_GATEWAYS,
        legacyRepoMirrorInstallerUsed: false,
        transitionRemovalCondition: SETUP_AGENT_ASSETS_CONTRACT.transitionRemovalCondition,
      }),
    })
  }

  return normalizeProviderStatus(await provider.status())
}

export async function applySetupAgentAssets(
  provider: SetupAgentAssetsProvider | undefined,
  options: Readonly<{
    action: 'install' | 'repair'
    fromRelease?: string
  }>,
): Promise<SetupAgentAssetsStatus> {
  if (!provider?.apply) {
    throw new Error('setup_init_agent_assets_contract_unavailable_task_136')
  }
  return normalizeProviderStatus(await provider.apply({
    ...options,
    target: 'all',
  }))
}
import { verifyAndLoadCommunityCoreReleaseInput } from './agent-assets/release-input.js'
import { resolveAgentAssetsRoots } from './agent-assets/roots.js'
import { inspectRuntimeGatewayBindings } from './agent-assets/runtime-binding-reader.js'
import { readAgentAssetsStoreStatus } from './agent-assets/store-reader.js'
import {
  applyVerifiedCommunityCore,
  repairAgentAssetRuntimeBindings,
} from './agent-assets/store-writer.js'
import {
  inspectLegacyAopsPointers,
  migrateLegacyAopsPointers,
} from './agent-assets/legacy-pointer-migration.js'
import { resolveSetupAgentAssetsReleaseV1 } from './setup-agent-assets-release.js'
import {
  AGENT_ASSET_RUNTIME_IDS,
  resolveAgentAssetTargetSelection,
  selectAgentAssetRuntimeHomes,
  type AgentAssetTargetInput,
} from './agent-assets/runtime-targets.js'
