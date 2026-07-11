import { Command } from 'commander'

import { applyCommonOptions } from '../utils/command.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import {
  collectRepeatedOption,
  runPmPlanCreate,
  runPmPlanGet,
  runPmPlanList,
  runPmPlanUpdate,
  type PmPlanCreateOptions,
  type PmPlanListOptions,
  type PmPlanRefOptions,
  type PmPlanUpdateOptions,
} from './pm/projectman.js'

function applyPlanContextOptions<T extends Command>(cmd: T): T {
  applyCommonOptions(cmd, { withProject: false })
  cmd.option('--scope-id <id>', 'Canonical owner scope override')
  cmd.option('--project-id <id>', 'Project id used to resolve the canonical owner scope')
  cmd.option('--project-name <name>', 'Project name override for repo-aware scope resolution')
  cmd.option('--project-slug <slug>', 'Project slug from repo project registry; hosted-only links write through the hosted gateway')
  cmd.option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
  cmd.option('--locale <locale>', 'Locale header (x-locale)')
  cmd.option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
  cmd.addHelpText('after', `\nGuide:\n  ${GUIDE_PATHS.projectman}\n`)
  return cmd
}

function applyWriteOptions<T extends Command>(cmd: T): T {
  cmd.option('--preview', 'Return a validated preflight summary without executing the tool')
  cmd.option('--apply', 'Explicitly allow guarded write operations')
  cmd.option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
  return cmd
}

function applyMemoryCadenceOptions<T extends Command>(cmd: T): T {
  cmd.option('--write-memory', 'Write an opt-in local memory side-effect after the main repo-first operation succeeds')
  cmd.option('--memory-mode <mode>', 'Memory mode override: kickoff, resume, decision, blocker, closeout, rule')
  cmd.option('--memory-content <text>', 'Optional explicit memory content override')
  cmd.option('--memory-next-action <text>', 'Optional next action for the memory side-effect')
  cmd.option('--memory-validation-state <text>', 'Optional validation state for the memory side-effect')
  return cmd
}

export function makePlanCommand(): Command {
  const cmd = new Command('plan')
    .description('Sprint-backed Projectman implementation plan commands')
    .addHelpText(
      'after',
      '\nNotes:\n' +
        '  implementation-plan is a facade over Projectman sprint documents; the plan id is the sprint id.\n' +
        '  This command does not create a second plan table or app-local plan store.\n' +
        '  For one-item checklist edits, use `aops-cli pm utask ...` until top-level plan microtask sugar is added.\n',
    )

  applyPlanContextOptions(
    applyMemoryCadenceOptions(applyWriteOptions(
      cmd
        .command('create')
        .description('Create a sprint-backed implementation plan for a kanban task')
        .requiredOption('--task <id>', 'Kanban task id')
        .requiredOption('--name <name>', 'Plan name')
        .requiredOption('--goal <text>', 'Plan goal')
        .option('--reference <value>', 'Repeatable reference item', collectRepeatedOption, [])
        .option('--scope-item <value>', 'Repeatable scope item', collectRepeatedOption, [])
        .option('--validation-item <value>', 'Repeatable validation item', collectRepeatedOption, [])
        .option('--notes <text>', 'Optional notes'),
    )).action(async (options: PmPlanCreateOptions) => {
      await runPmPlanCreate(options)
    }),
  )

  applyPlanContextOptions(
    cmd
      .command('list')
      .description('List sprint-backed implementation plans')
      .option('--task <id>', 'Optional kanban task id filter')
      .option('--name <name>', 'Optional plan name filter')
      .option('--status <value>', 'Optional plan status filter')
      .option('--limit <n>', 'Maximum records to return after filtering')
      .option('--summary', 'Return compact plan rows instead of full sprint plans')
      .option('--include-archived', 'Include plans whose backing sprint has archivedAt set')
      .action(async (options: PmPlanListOptions) => {
        await runPmPlanList(options)
      }),
  )

  applyPlanContextOptions(
    cmd
      .command('get')
      .description('Get a sprint-backed implementation plan by selector')
      .requiredOption('--id <id>', 'Plan selector: full id, 8+ id prefix, slug, or exact name/title')
      .action(async (options: PmPlanRefOptions) => {
        await runPmPlanGet(options)
      }),
  )

  applyPlanContextOptions(
    applyMemoryCadenceOptions(applyWriteOptions(
      cmd
        .command('update')
        .description('Patch a sprint-backed implementation plan, including phases and microtasks')
        .requiredOption('--id <id>', 'Plan id')
        .option('--name <name>', 'Updated plan name')
        .option('--goal <text>', 'Updated plan goal')
        .option('--reference <value>', 'Repeatable reference item patch', collectRepeatedOption, [])
        .option('--scope-item <value>', 'Repeatable scope item patch', collectRepeatedOption, [])
        .option('--validation-item <value>', 'Repeatable validation item patch', collectRepeatedOption, [])
        .option('--notes <text>', 'Updated plan notes')
        .option('--phases-json <json-or-@file>', 'JSON array or @file.json array for nested phase+microtask plan; quote @file values in PowerShell')
        .option('--expected-updated-at <timestamp>', 'Optional optimistic concurrency timestamp from a previous plan snapshot'),
    )).action(async (options: PmPlanUpdateOptions) => {
      await runPmPlanUpdate(options)
    }),
  )

  return cmd
}
