import type { Command } from 'commander'

export type CommonOptions = {
  apiBaseUrl?: string
  accessToken?: string
  refreshToken?: string
  timeoutMs?: number
  projectId?: string
  projectName?: string
  projectSlug?: string
  yes?: boolean
  json?: boolean
}

export function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function compactPayload(input: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined) return
    if (typeof value === 'string' && value.trim().length === 0) return
    if (Array.isArray(value) && value.length === 0) return
    payload[key] = value
  })
  return payload
}

export function printJsonResponse(params: { status: number; result: unknown; rawText: string }): void {
  console.log(
    JSON.stringify(
      {
        status: params.status,
        result: params.result ?? null,
        rawText: params.rawText,
      },
      null,
      2
    )
  )
}

export type ApplyCommonOptionsConfig = {
  withAuth?: boolean
  withProject?: boolean
  withYes?: boolean
  withJson?: boolean
}

function hasLongOption(cmd: Command, flags: string): boolean {
  const longFlag = flags
    .split(/[ ,|]+/)
    .map((token) => token.trim())
    .find((token) => token.startsWith('--'))

  if (!longFlag) return false
  return cmd.options.some((option) => option.long === longFlag)
}

function addOptionIfMissing(
  cmd: Command,
  flags: string,
  description: string,
  parser?: (value: string) => unknown
): Command {
  if (hasLongOption(cmd, flags)) return cmd

  if (parser) {
    cmd.option(flags, description, parser)
  } else {
    cmd.option(flags, description)
  }

  return cmd
}

export function applyCommonOptions(cmd: Command, config: ApplyCommonOptionsConfig = {}): Command {
  const { withAuth = true, withProject = false, withYes = true, withJson = true } = config

  addOptionIfMissing(cmd, '--api-base-url <url>', 'API base URL (default: AOPS_API_BASE_URL or http://localhost:5900)')

  // Secrets are resolved from the encrypted target store or process
  // environment. Public argv token flags are intentionally not registered.
  void withAuth

  addOptionIfMissing(cmd, '--timeout-ms <ms>', 'Request timeout in milliseconds', (v) =>
    Number.parseInt(String(v), 10)
  )

  if (withProject) {
    addOptionIfMissing(cmd, '--project-id <id>', 'Project id')
    addOptionIfMissing(cmd, '--project-name <name>', 'Project name')
    addOptionIfMissing(cmd, '--project-slug <slug>', 'Project slug (resolved server-side to a project id)')
  }

  if (withYes) {
    addOptionIfMissing(cmd, '--yes', 'Non-interactive (fail if required args are missing)')
  }

  if (withJson) {
    addOptionIfMissing(cmd, '--json', 'Output JSON only')
  }

  return cmd
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
