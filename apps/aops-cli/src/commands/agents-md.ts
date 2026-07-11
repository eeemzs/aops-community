import path from 'node:path'
import { Command } from 'commander'
import { logInfo, logSuccess, logWarn } from '@aopslab/xf-cli-ui'

import {
  resetAgentsMdFile,
  updateAgentsMdFile,
  type AgentsMdResetOptions,
  type AgentsMdUpdateOptions,
} from '../utils/agents-md.js'

type AgentsMdCommandOptions = AgentsMdUpdateOptions & {
  json?: boolean
}

type AgentsMdResetCommandOptions = AgentsMdResetOptions & {
  json?: boolean
}

function serializableUpdateResult(result: Awaited<ReturnType<typeof updateAgentsMdFile>>): Record<string, unknown> {
  return {
    action: result.action,
    rootDir: result.rootDir,
    filePath: result.filePath,
    changed: result.changed,
    selectedTemplates: result.selectedTemplates.map((seed) => ({
      slug: seed.slug,
      title: seed.title,
      mirrorPath: seed.mirrorPath,
      promptRef: seed.promptRef,
    })),
    warnings: result.warnings,
    syncHosted: result.syncHosted,
    content: result.content,
  }
}

function serializableResetResult(result: Awaited<ReturnType<typeof resetAgentsMdFile>>): Record<string, unknown> {
  return {
    action: result.action,
    rootDir: result.rootDir,
    filePath: result.filePath,
    changed: result.changed,
    warnings: result.warnings,
    content: result.content,
  }
}

function printWarnings(warnings: string[]): void {
  warnings.forEach((warning) => logWarn(warning))
}

export async function runAgentsMdUpdate(options: AgentsMdCommandOptions = {}): Promise<void> {
  const result = await updateAgentsMdFile(options)

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          command: 'agents-md.update',
          result: serializableUpdateResult(result),
        },
        null,
        2
      )
    )
    return
  }

  printWarnings(result.warnings)
  if (options.preview) {
    logInfo(`Preview for ${path.relative(result.rootDir, result.filePath) || result.filePath}`)
    process.stdout.write(result.content ?? '')
    return
  }

  logSuccess(`${result.changed ? 'Updated' : 'Checked'} ${result.filePath}`)
  logInfo(`Templates: ${result.selectedTemplates.map((seed) => seed.slug).join(', ')}`)
  if (result.syncHosted) logInfo(`Refreshed hosted mirrors with: ${result.syncHosted.command}`)
}

export async function runAgentsMdPreview(options: AgentsMdCommandOptions = {}): Promise<void> {
  await runAgentsMdUpdate({ ...options, preview: true, apply: false, syncHosted: false })
}

export async function runAgentsMdReset(options: AgentsMdResetCommandOptions = {}): Promise<void> {
  const result = await resetAgentsMdFile(options)

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          command: 'agents-md.reset',
          result: serializableResetResult(result),
        },
        null,
        2
      )
    )
    return
  }

  printWarnings(result.warnings)
  if (options.preview) {
    logInfo(`Reset preview for ${path.relative(result.rootDir, result.filePath) || result.filePath}`)
    process.stdout.write(result.content ?? '')
    return
  }

  logSuccess(`${result.changed ? 'Removed managed block from' : 'No managed block found in'} ${result.filePath}`)
}

function addTemplateSelectionOptions(cmd: Command): Command {
  return cmd
    .option('--root <path>', 'Workspace root override (default: nearest package.json ancestor)')
    .option('--discuss', 'Also include the standalone discuss / decision-ritual template (aops-cli-discuss skill)')
    .option('--all', 'Include all bundled AOPS AGENTS.md prompt template snippets')
    .option('--no-default-task', 'Do not include the default starter template (aops-collaborative-startup)')
    .option('--embed-prompts', 'Embed prompt bodies from local hosted mirrors when available')
    .option('--json', 'Output JSON only')
}

export function makeAgentsMdCommand(): Command {
  const cmd = new Command('agents-md').description('Manage AOPS prompt-template bootstrap blocks in AGENTS.md')

  cmd.addCommand(
    addTemplateSelectionOptions(
      new Command('update')
        .description('Insert or replace the managed AOPS AGENTS.md prompt-template block')
        .option('--preview', 'Print the merged AGENTS.md content without writing')
        .option('--apply', 'Write the merged AGENTS.md content')
        .option('--sync-hosted', 'Refresh hosted prompt/skill mirrors before rendering')
    )
      .action(async (options: AgentsMdCommandOptions) => {
        await runAgentsMdUpdate(options)
      })
      .addHelpText(
        'after',
        `
Examples:
  aops-cli agents-md update --apply
  aops-cli agents-md update --discuss --apply
  aops-cli agents-md update --sync-hosted --apply
`
      )
  )

  cmd.addCommand(
    addTemplateSelectionOptions(new Command('preview').description('Print merged AGENTS.md content without writing'))
      .action(async (options: AgentsMdCommandOptions) => {
        await runAgentsMdPreview(options)
      })
      .addHelpText(
        'after',
        `
Examples:
  aops-cli agents-md preview
  aops-cli agents-md preview --discuss --json
`
      )
  )

  cmd.addCommand(
    new Command('reset')
      .description('Remove the managed AOPS AGENTS.md prompt-template block')
      .option('--root <path>', 'Workspace root override (default: nearest package.json ancestor)')
      .option('--preview', 'Print the resulting AGENTS.md content without writing')
      .option('--apply', 'Write the resulting AGENTS.md content')
      .option('--confirm', 'Confirm removal of the managed block')
      .option('--json', 'Output JSON only')
      .action(async (options: AgentsMdResetCommandOptions) => {
        await runAgentsMdReset(options)
      })
      .addHelpText(
        'after',
        `
Examples:
  aops-cli agents-md reset --preview
  aops-cli agents-md reset --apply --confirm
`
      )
  )

  return cmd
}
