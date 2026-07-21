import { AgentAssetsError } from './envelope.js'

const RUNTIME_DEFINITIONS = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
] as const

export type AgentAssetRuntimeId = (typeof RUNTIME_DEFINITIONS)[number]['id']

export const AGENT_ASSET_RUNTIME_REGISTRY = Object.freeze(
  RUNTIME_DEFINITIONS.map((runtime) => Object.freeze({ ...runtime })),
)

export const AGENT_ASSET_RUNTIME_IDS = Object.freeze(
  RUNTIME_DEFINITIONS.map((runtime) => runtime.id),
) as readonly AgentAssetRuntimeId[]

export type AgentAssetTargetInput = string | readonly string[] | undefined

export type AgentAssetTargetSelection = Readonly<{
  selector: 'all' | string
  runtimes: readonly AgentAssetRuntimeId[]
}>

function selectorError(message: string, input: AgentAssetTargetInput): never {
  throw new AgentAssetsError('schema_incompatible', message, {
    nextActions: [
      `Use --target all or select registered runtimes: ${AGENT_ASSET_RUNTIME_IDS.join(', ')}.`,
    ],
    details: {
      input: input ?? null,
      registeredRuntimes: AGENT_ASSET_RUNTIME_IDS,
      selectors: ['all', '<runtime>', '<runtime>,<runtime>', 'repeat --target'],
    },
  })
}

export function resolveAgentAssetTargetSelection(
  input: AgentAssetTargetInput,
): AgentAssetTargetSelection {
  const values = input === undefined
    ? []
    : Array.isArray(input) ? [...input] : [input]
  if (values.length === 0) {
    return Object.freeze({ selector: 'all' as const, runtimes: AGENT_ASSET_RUNTIME_IDS })
  }
  const tokens = values.flatMap((value) => String(value).split(',').map((token) => token.trim().toLowerCase()))
  if (tokens.some((token) => token.length === 0)) {
    selectorError('--target contains an empty runtime selector.', input)
  }
  if (tokens.includes('all')) {
    if (tokens.length !== 1) selectorError('--target all cannot be combined with another runtime selector.', input)
    return Object.freeze({ selector: 'all' as const, runtimes: AGENT_ASSET_RUNTIME_IDS })
  }
  const registered = new Set<string>(AGENT_ASSET_RUNTIME_IDS)
  const unknown = tokens.filter((token) => !registered.has(token))
  if (unknown.length > 0) {
    selectorError(`--target contains unregistered runtime selectors: ${[...new Set(unknown)].join(', ')}.`, input)
  }
  const selected = new Set(tokens as AgentAssetRuntimeId[])
  const runtimes = Object.freeze(AGENT_ASSET_RUNTIME_IDS.filter((runtime) => selected.has(runtime)))
  return Object.freeze({ selector: runtimes.join(','), runtimes })
}

export function collectAgentAssetTarget(value: string, previous?: readonly string[]): string[] {
  return [...(previous ?? []), value]
}

export function selectAgentAssetRuntimeHomes<T>(
  selection: AgentAssetTargetSelection,
  homes: Readonly<Record<AgentAssetRuntimeId, T>>,
): Readonly<Partial<Record<AgentAssetRuntimeId, T>>> {
  return Object.freeze(Object.fromEntries(
    selection.runtimes.map((runtime) => [runtime, homes[runtime]]),
  ) as Partial<Record<AgentAssetRuntimeId, T>>)
}
