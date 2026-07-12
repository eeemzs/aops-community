import path from 'node:path'

import {
  runAopsPgBootstrapOperation,
  type AopsPgBootstrapOperation,
  type AopsPgBootstrapTarget,
} from './pg-bootstrap.js'
import type { AopsPgBootstrapAdapter } from './manifest.js'

type ParsedArgs = {
  operation: AopsPgBootstrapOperation
  workspaceRoot: string
  repoUrl?: string
  target: AopsPgBootstrapTarget
  json: boolean
}

function printUsage(): void {
  console.error(
    [
      'Usage: aops-pg-bootstrap <push|generate|migrate> [options]',
      '',
      'Options:',
      '  --workspace-root <path>  AOPS workspace root (defaults to current directory)',
      '  --repo-url <url>         Optional PostgreSQL repo URL override',
      '  --target <aops|auth|both>  Target config set (default: aops)',
      '  --json                   Emit JSON result payload',
      '  --help                   Show this help text',
    ].join('\n'),
  )
}

function parseOperation(value: string): AopsPgBootstrapOperation | null {
  return value === 'push' || value === 'generate' || value === 'migrate' ? value : null
}

function parseTarget(value: string): AopsPgBootstrapTarget | null {
  return value === 'aops' || value === 'auth' || value === 'both' ? value : null
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`missing_value_for_${flag.replace(/^--/, '')}`)
  }
  return value
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const [operationArg, ...rest] = argv
  if (!operationArg || operationArg === '--help' || operationArg === '-h') {
    return null
  }

  const operation = parseOperation(operationArg)
  if (!operation) {
    throw new Error(`unsupported_operation:${operationArg}`)
  }

  let workspaceRoot = process.cwd()
  let repoUrl: string | undefined
  let target: AopsPgBootstrapTarget = 'aops'
  let json = false

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--workspace-root') {
      workspaceRoot = path.resolve(process.cwd(), requireValue(rest, index + 1, arg))
      index += 1
      continue
    }
    if (arg === '--repo-url') {
      repoUrl = requireValue(rest, index + 1, arg)
      index += 1
      continue
    }
    if (arg === '--target') {
      const nextTarget = parseTarget(requireValue(rest, index + 1, arg))
      if (!nextTarget) {
        throw new Error(`unsupported_target:${rest[index + 1] ?? ''}`)
      }
      target = nextTarget
      index += 1
      continue
    }
    if (arg === '--json') {
      json = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      return null
    }
    throw new Error(`unknown_arg:${arg}`)
  }

  return { operation, workspaceRoot, repoUrl, target, json }
}

export async function runAopsPgBootstrapCli(
  argv: string[],
  adapters: readonly AopsPgBootstrapAdapter[] = [],
  options: { includePrivateRepairs?: boolean } = {},
): Promise<void> {
  let parsed: ParsedArgs | null = null

  try {
    parsed = parseArgs(argv)
  } catch (error) {
    printUsage()
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
    return
  }

  if (!parsed) {
    printUsage()
    return
  }

  const logs: string[] = []

  try {
    const paths = await runAopsPgBootstrapOperation({
      operation: parsed.operation,
      workspaceRoot: parsed.workspaceRoot,
      repoUrl: parsed.repoUrl,
      target: parsed.target,
      adapters,
      includePrivateRepairs: options.includePrivateRepairs === true,
      logs,
    })

    if (parsed.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            operation: parsed.operation,
            target: parsed.target,
            workspaceRoot: parsed.workspaceRoot,
            repoUrlProvided: Boolean(parsed.repoUrl),
            paths,
            logs,
          },
          null,
          2,
        ),
      )
      return
    }

    for (const line of logs) {
      console.log(line)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (parsed.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            operation: parsed.operation,
            target: parsed.target,
            workspaceRoot: parsed.workspaceRoot,
            repoUrlProvided: Boolean(parsed.repoUrl),
            error: message,
            logs,
          },
          null,
          2,
        ),
      )
    } else {
      for (const line of logs) {
        console.log(line)
      }
      console.error(message)
    }
    process.exitCode = 1
  }
}
