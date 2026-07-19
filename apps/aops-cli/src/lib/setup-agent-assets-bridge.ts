export const SETUP_AGENT_ASSETS_CONTRACT = Object.freeze({
  task: 'TASK-136',
  surface: 'agent-assets-client-v1',
  statusCommand: 'aops-cli assets status --verify quick --json',
  installCommand: 'aops-cli assets install --from-release <path> --target both --apply --json',
  repairCommand: 'aops-cli assets repair --repair-bindings --apply --json',
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
    action: 'install' | 'repair'
    fromRelease?: string
    target: 'both'
  }>) => Promise<SetupAgentAssetsStatus>
}>

export type SetupAgentAssetsProviderDependencies = Readonly<{
  roots?: typeof resolveAgentAssetsRoots
  readStatus?: typeof readAgentAssetsStoreStatus
  inspectBindings?: typeof inspectRuntimeGatewayBindings
  verifyRelease?: typeof verifyAndLoadCommunityCoreReleaseInput
  applyCore?: typeof applyVerifiedCommunityCore
  repairBindings?: typeof repairAgentAssetRuntimeBindings
  resolveRelease?: typeof resolveSetupOfficialCatalogReleaseV1
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
  const resolveRelease = dependencies.resolveRelease ?? resolveSetupOfficialCatalogReleaseV1
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
    const states = [bindings.codex.state, bindings.claude.state]
    const recoveryReasons = store.recoveryReasons ?? []
    const storeDrift = recoveryReasons.length > 0
    const ready = store.state === 'ready' && !storeDrift && states.every((state) => state === 'ready')
    const conflict = states.some((state) => state === 'ownership-conflict' || state === 'unsafe-path')
    return Object.freeze({
      availability: 'available' as const,
      state: ready ? 'ready' as const : conflict ? 'conflict' as const : 'action-required' as const,
      summary: ready
        ? 'The verified AOPS core and both global runtime gateways are ready.'
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
          ? ['Inspect `aops-cli assets status --verify full --json`; unknown user files are never overwritten.']
          : store.state === 'ready' && storeDrift
            ? ['Inspect `aops-cli assets status --verify full --json` and reconcile only the reported managed recovery state.']
          : store.state === 'ready'
            ? ['Run `aops-cli assets repair --repair-bindings --apply --json`.']
            : ['Run `aops-cli assets install --from-release <path> --target both --apply --json`.']),
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
      if (options.action === 'install') {
        if (!options.fromRelease) throw new Error('setup_init_agent_assets_release_required_for_install')
        const release = await verifySetupAgentAssetsReleaseInput(verifyRelease, options.fromRelease)
        await applyCore({
          assetRoot: roots.assetRoot,
          release,
          requestedOperation: 'install',
          runtimeHomes: {
            codex: roots.runtimeHomes.codex.absolutePath,
            claude: roots.runtimeHomes.claude.absolutePath,
          },
        })
      } else {
        await repairBindings({
          assetRoot: roots.assetRoot,
          runtimeHomes: {
            codex: roots.runtimeHomes.codex.absolutePath,
            claude: roots.runtimeHomes.claude.absolutePath,
          },
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
        'Complete TASK-136 on the TASK-137 merge base, then run `aops-cli assets status --verify quick --json`.',
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
    target: 'both',
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
import { resolveSetupOfficialCatalogReleaseV1 } from './setup-official-catalog-bridge.js'
