import { Command } from 'commander'
import { banner, logError, logInfo, logSuccess } from '@aopslab/xf-cli-ui'
import {
  appendQueryToPath,
  buildDomainApiPath,
  parseJsonInput,
} from '@aopslab/xf-cli-operator'

import {
  applyCommonOptions,
  normalizeNonEmpty,
  type CommonOptions,
} from '../utils/command.js'
import { buildAgentContextHeaders, requireApiState } from '../utils/agent-gateway.js'
import { promptInput } from '../utils/prompts.js'

type ApiCallOptions = CommonOptions & {
  domain?: string
  path?: string
  method?: string
  query?: string
  body?: string
  projectId?: string
  projectName?: string
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export async function runApiCall(options: ApiCallOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await requireApiState(options)
  if (!apiState) return

  let domain = normalizeNonEmpty(options.domain)
  if (!domain && interactive) {
    domain = normalizeNonEmpty(await promptInput({ message: 'Domain (e.g. docman):' }))
  }
  if (!domain) {
    logError('Missing domain. Provide --domain <id>.')
    process.exitCode = 1
    return
  }

  const method = (normalizeNonEmpty(options.method) ?? 'GET').toUpperCase()
  let body: unknown
  let query: unknown
  let headers: Record<string, string>

  try {
    body = parseJsonInput(options.body, 'body')
    query = parseJsonInput(options.query, 'query')
    headers = await buildAgentContextHeaders(options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(message)
    process.exitCode = 1
    return
  }

  const path = appendQueryToPath(buildDomainApiPath(domain, options.path), query)

  if (interactive) {
    banner('AOPS Domain API')
    logInfo(`API: ${apiState.baseUrl}`)
    logInfo(`${method} ${path}`)
  }

  try {
    const payload = await apiState.client.fetchJson<unknown>(path, {
      method,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      headers,
      timeoutMs: options.timeoutMs,
    })

    if (!options.json) logSuccess(`${method} ${path} -> ok`)
    console.log(JSON.stringify(payload, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Domain API call failed: ${message}`)
    process.exitCode = 1
  }
}

export function makeApiCommand(): Command {
  const cmd = new Command('api').description('Direct domain API escape hatch (/api/{domain}/...)')

  applyCommonOptions(
    cmd
      .command('call')
      .description('Call direct domain route via dynamic host router (escape hatch, not primary tool plane)')
      .option('--domain <id>', 'Domain id (e.g. docman)')
      .option('--path <route>', 'Route path under domain (e.g. documents/123)')
      .option('--method <method>', 'HTTP method (GET|POST|PUT|PATCH|DELETE)', 'GET')
      .option('--query <json>', 'Query params JSON or @file.json')
      .option('--body <json>', 'Body JSON or @file.json')
      .option('--project-id <id>', 'Project id header (x-project-id)')
      .option('--project-name <name>', 'Project name header (x-project-name)')
      .option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
      .option('--locale <locale>', 'Locale header (x-locale)')
      .option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
      .action(async (options: ApiCallOptions) => {
        await runApiCall(options)
      }),
    { withProject: false }
  )

  cmd.addHelpText(
    'after',
    `
Examples:
  aops-cli api call --domain docman --path documents --method GET --project-id <project-id>
  aops-cli api call --domain docman --path documents --method GET --scope-id <scope-id>
  aops-cli api call --domain projectman --path kanban/boards --method POST --body @./payload.json
`
  )

  return cmd
}

