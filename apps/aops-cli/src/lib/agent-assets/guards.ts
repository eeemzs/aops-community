import { AgentAssetsError } from './envelope.js'

export type AgentAssetsMutationGuard = Readonly<{
  mode: 'preview' | 'apply'
  mutationFree: boolean
  action: string
  nextActions: readonly string[]
}>

export function resolveAgentAssetsMutationGuard(input: Readonly<{
  action: string
  apply?: boolean
  confirm?: boolean
  destructive?: boolean
}>): AgentAssetsMutationGuard {
  if (!input.apply) {
    const confirmFlag = input.destructive ? ' --confirm' : ''
    return Object.freeze({
      mode: 'preview',
      mutationFree: true,
      action: input.action,
      nextActions: Object.freeze([
        `Review this preview, then re-run with --apply${confirmFlag} to execute it.`,
      ]),
    })
  }
  if (input.destructive && !input.confirm) {
    throw new AgentAssetsError(
      'recovery_confirmation_required',
      `${input.action} requires both --apply and --confirm.`,
      { nextActions: [`Re-run ${input.action} with --apply --confirm after reviewing status and the preview.`] },
    )
  }
  return Object.freeze({
    mode: 'apply',
    mutationFree: false,
    action: input.action,
    nextActions: Object.freeze([]),
  })
}

