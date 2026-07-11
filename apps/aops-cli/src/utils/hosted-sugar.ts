import { compactPayload, normalizeNonEmpty } from './command.js'

export function buildHostedSugarEnvelope(params: {
  command: string
  toolId?: string
  surface?: string
  resolvedContext: Record<string, unknown>
  input: Record<string, unknown>
  result: unknown
  artifacts?: Record<string, string>
}): Record<string, unknown> {
  return compactPayload({
    command: params.command,
    toolId: params.toolId,
    surface: params.surface,
    resolvedContext: params.resolvedContext,
    input: params.input,
    artifacts: params.artifacts,
    result: params.result,
  })
}

export function ensureGuardedWrite(
  options: { apply?: boolean; preview?: boolean },
  message = 'This command mutates hosted state.',
): void {
  if (options.apply === true || options.preview === true) return
  throw new Error(`${message} Retry with --apply or use --preview.`)
}

export function ensureDestructiveWrite(
  options: { apply?: boolean; confirm?: boolean; preview?: boolean },
  message = 'This command deletes hosted state.',
): void {
  if (options.preview === true) return
  if (options.apply === true && options.confirm === true) return
  throw new Error(`${message} Retry with --apply --confirm or use --preview.`)
}

export function missingScopeIdMessage(subject: string): string {
  return `${subject} requires scopeId. Use --scope-id or repo-bound project context that resolves to a scope.`
}

export function missingWorkspaceIdMessage(subject: string): string {
  return `${subject} requires projectId. Use repo-bound project context or pass --project-id explicitly.`
}

export function buildOperatorCookbook(params: {
  examples: string[]
  guide?: string
  notes?: string[]
}): string {
  const lines = ['Operator cookbook:']
  params.examples.forEach((example, index) => {
    lines.push(`  ${index + 1}. ${example}`)
  })
  if (params.guide) {
    lines.push('', 'Guide:', `  ${params.guide}`)
  }
  if (params.notes && params.notes.length > 0) {
    lines.push('', 'Notes:')
    params.notes.forEach((note) => lines.push(`  ${note}`))
  }
  return `\n${lines.join('\n')}\n`
}

export function resolveNextVersionNumber(
  rows: Array<Record<string, unknown>>,
  field = 'version',
): number {
  let maxVersion = 0
  for (const row of rows) {
    const candidate =
      typeof row[field] === 'number'
        ? row[field]
        : Number.parseInt(normalizeNonEmpty(row[field]) ?? '', 10)
    if (Number.isInteger(candidate) && candidate > maxVersion) {
      maxVersion = candidate
    }
  }
  return maxVersion + 1
}
