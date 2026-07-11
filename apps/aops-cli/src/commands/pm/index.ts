import { Command } from 'commander'

import { applyCommonOptions } from '../../utils/command.js'
import { buildOperatorCookbook } from '../../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../../utils/guide-paths.js'
import {
  collectRepeatedOption,
  runPmBoardArchive,
  runPmBoardCreate,
  runPmBoardCloseout,
  runPmBoardDelete,
  runPmBoardBootstrapGet,
  runPmBoardBootstrapSet,
  runPmBoardGet,
  runPmBoardKickoff,
  runPmBoardList,
  runPmBoardResume,
  runPmBoardUnarchive,
  runPmFeedbackCreate,
  runPmFeedbackDelete,
  runPmFeedbackGet,
  runPmFeedbackList,
  runPmFeedbackUpdate,
  runPmResumeBrief,
  runPmReviewRequestCreate,
  runPmReviewRequestDelete,
  runPmReviewRequestGet,
  runPmReviewRequestList,
  runPmReviewRequestResult,
  runPmReviewRequestUpdate,
  runPmUtaskCreate,
  runPmUtaskDelete,
  runPmUtaskSetStatus,
  runPmUtaskUpdate,
  runPmIssueCreate,
  runPmIssueDelete,
  runPmIssueGet,
  runPmIssueList,
  runPmIssueUpdate,
  runPmSprintCreate,
  runPmSprintDelete,
  runPmSprintGet,
  runPmSprintArchive,
  runPmSprintList,
  runPmSprintSetStatus,
  runPmSprintUnarchive,
  runPmSprintUpdatePlan,
  runPmStatusAudit,
  runPmStatusReconcile,
  runPmTaskCreate,
  runPmTaskDelete,
  runPmTaskGet,
  runPmTaskList,
  runPmTaskSetStatus,
  runPmHandoffResume,
  runPmHandoffWrite,
  type PmBoardArchiveOptions,
  type PmSprintCreateOptions,
  type PmBoardCloseoutOptions,
  type PmBoardCreateOptions,
  type PmBoardBootstrapGetOptions,
  type PmBoardBootstrapSetOptions,
  type PmBoardDeleteOptions,
  type PmBoardGetOptions,
  type PmBoardKickoffOptions,
  type PmBoardListOptions,
  type PmBoardResumeOptions,
  type PmHandoffResumeOptions,
  type PmHandoffWriteOptions,
  type PmFeedbackCreateOptions,
  type PmFeedbackListOptions,
  type PmFeedbackRefOptions,
  type PmFeedbackUpdateOptions,
  type PmIssueCreateOptions,
  type PmIssueListOptions,
  type PmIssueRefOptions,
  type PmIssueUpdateOptions,
  type PmResumeBriefOptions,
  type PmReviewRequestCreateOptions,
  type PmReviewRequestListOptions,
  type PmReviewRequestRefOptions,
  type PmReviewRequestResultOptions,
  type PmReviewRequestUpdateOptions,
  type PmSprintListOptions,
  type PmSprintArchiveOptions,
  type PmSprintRefOptions,
  type PmSprintSetStatusOptions,
  type PmSprintUpdatePlanOptions,
  type PmStatusAuditOptions,
  type PmStatusReconcileOptions,
  type PmTaskCreateOptions,
  type PmTaskListOptions,
  type PmTaskRefOptions,
  type PmTaskSetStatusOptions,
  type PmUtaskCreateOptions,
  type PmUtaskDeleteOptions,
  type PmUtaskSetStatusOptions,
  type PmUtaskUpdateOptions,
} from './projectman.js'

function applyPmContextOptions<T extends Command>(cmd: T): T {
  applyCommonOptions(cmd, { withProject: false })
  cmd.option('--scope-id <id>', 'Canonical owner scope override')
  cmd.option('--project-id <id>', 'Project id used to resolve the canonical owner scope')
  cmd.option('--project-name <name>', 'Project name override for repo-aware scope resolution')
  cmd.option('--project-slug <slug>', 'Project slug from repo project registry; hosted-only links write through the hosted gateway')
  cmd.option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
  cmd.option('--locale <locale>', 'Locale header (x-locale)')
  cmd.option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
  cmd.addHelpText(
    'after',
    `\nGuide:\n  ${GUIDE_PATHS.projectman}\n\nBroader Projectman overview:\n  aops-cli pm --help\n`,
  )
  return cmd
}

function applyWriteOptions<T extends Command>(cmd: T, params: { destructive?: boolean } = {}): T {
  cmd.option('--preview', 'Return a validated preflight summary without executing the tool')
  cmd.option('--apply', 'Explicitly allow guarded write operations')
  if (params.destructive) {
    cmd.option('--confirm', 'Explicitly confirm destructive operations')
  }
  cmd.option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
  return cmd
}

function applyMemoryCadenceOptions<T extends Command>(cmd: T): T {
  cmd.option('--write-memory', 'Write an opt-in local memory side-effect after the main Projectman operation succeeds')
  cmd.option('--memory-mode <mode>', 'Memory mode override: kickoff, resume, decision, blocker, closeout, rule')
  cmd.option('--memory-content <text>', 'Optional explicit memory content override')
  cmd.option('--memory-next-action <text>', 'Optional next action for the memory side-effect')
  cmd.option('--memory-validation-state <text>', 'Optional validation state for the memory side-effect')
  return cmd
}

function addTaskCommands(cmd: Command): void {
  const task = cmd.command('ktask').alias('task').description('Projectman kanban task commands')

  applyPmContextOptions(
    applyMemoryCadenceOptions(applyWriteOptions(
      task
        .command('create')
        .description('Create a Projectman kanban task')
        .requiredOption('--title <title>', 'Task title')
        .requiredOption('--board <value>', 'Board id, exact board name, or board slug')
        .requiredOption('--column <value>', 'Board-column placement id, exact column name, or column slug on the selected board')
        .option('--description <text>', 'Task description')
        .option('--position <index>', 'Optional position override', (value) => Number.parseInt(String(value), 10)),
      { destructive: false }),
    ).action(async (options: PmTaskCreateOptions) => {
      await runPmTaskCreate(options)
    }),
  )

  applyPmContextOptions(
    task
      .command('list')
      .description('List Projectman kanban tasks')
      .option('--board <value>', 'Board id, exact board name, or board slug')
      .option('--column <value>', 'Board-column placement id, exact column name, or column slug on the selected board')
      .option('--sprint <id>', 'Optional sprint id filter')
      .action(async (options: PmTaskListOptions) => {
        await runPmTaskList(options)
      }),
  )

  applyPmContextOptions(
    task
      .command('get')
      .description('Get a Projectman kanban task by selector')
      .requiredOption('--id <id>', 'Task selector: full id, 8+ id prefix, slug, or exact title')
      .action(async (options: PmTaskRefOptions) => {
        await runPmTaskGet(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      task
        .command('set-status')
        .description('Move a kanban task to the workflow column matching the requested status')
        .requiredOption('--id <id>', 'Task id')
        .requiredOption('--status <value>', 'Target workflow status or exact board column slug/name')
        .option('--position <index>', 'Optional target position inside the destination column', (value) => Number.parseInt(String(value), 10)),
      { destructive: false },
    ).addHelpText(
      'after',
      '\nNotes:\n' +
        '  Default workflow aliases: backlog, todo, doing, done.\n' +
        '  `completed` maps to `done`; `in_progress` maps to `doing`.\n' +
        '  Custom boards can also accept an exact board column name or slug.\n',
    ).action(async (options: PmTaskSetStatusOptions) => {
      await runPmTaskSetStatus(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      task
        .command('delete')
        .description('Delete a Projectman kanban task')
        .requiredOption('--id <id>', 'Task id'),
      { destructive: true },
    ).action(async (options: PmTaskRefOptions) => {
      await runPmTaskDelete(options)
    }),
  )
}

function addStatusCommands(cmd: Command): void {
  const status = cmd.command('status').description('Read-only Projectman status audit commands')

  applyPmContextOptions(
    status
      .command('audit')
      .description('Read-only audit for kanban task and sprint completion drift')
      .option('--board <value>', 'Optional board id, exact board name, or board slug filter')
      .option('--task <value>', 'Optional task selector: full id, 8+ id prefix, slug, or exact title')
      .option('--sprint <value>', 'Optional sprint selector: full id, 8+ id prefix, slug, or exact name')
      .action(async (options: PmStatusAuditOptions) => {
        await runPmStatusAudit(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      status
        .command('reconcile')
        .description('Preview or explicitly apply one guarded PM status reconciliation')
        .requiredOption('--task <value>', 'Task selector: full id, 8+ id prefix, slug, or exact title')
        .option('--board <value>', 'Optional board id, exact board name, or board slug used to scope task selection'),
      { destructive: false },
    ).addHelpText(
      'after',
      '\nNotes:\n' +
        '  Default is preview/dry-run; no mutation occurs unless --apply is provided.\n' +
        '  Reconcile is item-scoped: --task is required and board-wide/bulk mutation is not supported.\n' +
        '  Safe task->Done applies only when every linked sprint is completed and has no open microtasks.\n',
    ).action(async (options: PmStatusReconcileOptions) => {
      await runPmStatusReconcile(options)
    }),
  )
}

function addBoardCommands(cmd: Command): void {
  const board = cmd.command('board').description('Projectman kanban board commands')
  const bootstrap = board.command('bootstrap').description('Board-slug bootstrap registry commands')

  applyPmContextOptions(
    board
      .command('list')
      .description('List Projectman boards')
      .option('--name <name>', 'Optional exact board name filter')
      .option('--slug <slug>', 'Optional exact board slug filter')
      .option('--include-archived', 'Include boards with archivedAt set')
      .action(async (options: PmBoardListOptions) => {
        await runPmBoardList(options)
      }),
  )

  applyPmContextOptions(
    board
      .command('get')
      .description('Get a Projectman board by id, exact name, or slug')
      .option('--id <id>', 'Board id')
      .option('--name <name>', 'Exact board name')
      .option('--slug <slug>', 'Exact board slug')
      .action(async (options: PmBoardGetOptions) => {
        await runPmBoardGet(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      board
        .command('archive')
        .description('Soft-archive a Projectman board by setting archivedAt on the board record')
        .option('--id <id>', 'Board id or 8+ id prefix')
        .option('--name <name>', 'Exact board name')
        .option('--slug <slug>', 'Exact board slug'),
      { destructive: false },
    ).addHelpText(
      'after',
      '\nNotes:\n' +
        '  This is a reversible metadata mark: linked tasks/sprints are not changed.\n' +
        '  The board file stays in place; this command does not write under .aops/archive/**.\n',
    ).action(async (options: PmBoardArchiveOptions) => {
      await runPmBoardArchive(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      board
        .command('unarchive')
        .description('Restore a soft-archived Projectman board by clearing archivedAt')
        .option('--id <id>', 'Board id or 8+ id prefix')
        .option('--name <name>', 'Exact board name')
        .option('--slug <slug>', 'Exact board slug'),
      { destructive: false },
    ).addHelpText(
      'after',
      '\nNotes:\n' +
        '  This only clears the board archivedAt marker; linked tasks/sprints are not changed.\n' +
        '  The board file stays in place; this command does not write under .aops/archive/**.\n',
    ).action(async (options: PmBoardArchiveOptions) => {
      await runPmBoardUnarchive(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      bootstrap
        .command('set')
        .description('Create or update the board bootstrap registry')
        .requiredOption('--board <value>', 'Board id, exact board name, or board slug')
        .option('--title <text>', 'Optional bootstrap title/label')
        .option('--doc-id <id>', 'Canonical Docman document id')
        .option('--doc-version-id <id>', 'Canonical Docman document version id')
        .option('--prompt-id <id>', 'Canonical prompt id')
        .option('--prompt-version-id <id>', 'Canonical prompt version id')
        .option('--task-id <id>', 'Active umbrella kanban task id')
        .option('--sprint-id <id>', 'Active umbrella sprint id')
        .option('--reference <value>', 'Repeatable reference pointer stored in the bootstrap registry', collectRepeatedOption, [])
        .option('--notes <text>', 'Optional operator notes for this board bootstrap'),
      { destructive: false },
    ).action(async (options: PmBoardBootstrapSetOptions) => {
      await runPmBoardBootstrapSet(options)
    }),
  )

  applyPmContextOptions(
    bootstrap
      .command('get')
      .description('Read the canonical board bootstrap registry for a board slug/id/name')
      .requiredOption('--board <value>', 'Board id, exact board name, or board slug')
      .action(async (options: PmBoardBootstrapGetOptions) => {
        await runPmBoardBootstrapGet(options)
      }),
  )

  applyPmContextOptions(
    board
      .command('resume')
      .description('Resolve board bootstrap, active window, and resume context for a board slug/id/name')
      .requiredOption('--board <value>', 'Board id, exact board name, or board slug')
      .option('--depth <mode>', 'Resume depth: light or deep', 'light')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: PmBoardResumeOptions) => {
        await runPmBoardResume(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      board
        .command('kickoff')
        .description('Create or reuse the active task+sprint window for a board and refresh its bootstrap registry')
        .requiredOption('--board <value>', 'Board id, exact board name, or board slug')
        .requiredOption('--title <title>', 'Kanban task title')
        .requiredOption('--goal <text>', 'Sprint goal')
        .option('--column <value>', 'Target board column when a new task is created', 'Todo')
        .option('--description <text>', 'Optional kanban task description')
        .option('--sprint-name <text>', 'Optional sprint name override; defaults to the task title')
        .option('--reference <value>', 'Repeatable sprint reference', collectRepeatedOption, [])
        .option('--scope-item <value>', 'Repeatable sprint scope item', collectRepeatedOption, [])
        .option('--validation-item <value>', 'Repeatable sprint validation item', collectRepeatedOption, [])
        .option('--notes <text>', 'Optional sprint notes')
        .option('--memory-content <text>', 'Optional explicit kickoff/resume memory content override')
        .option('--memory-next-action <text>', 'Optional next action for the memory side-effect')
        .option('--memory-validation-state <text>', 'Optional validation state for the memory side-effect'),
      { destructive: false },
    ).action(async (options: PmBoardKickoffOptions) => {
      await runPmBoardKickoff(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      board
        .command('create')
        .description('Create a Projectman board bootstrap')
        .requiredOption('--name <name>', 'Board name')
        .option('--slug <slug>', 'Optional board slug override; defaults to a shortened slug from the board name')
        .option('--description <text>', 'Board description')
        .option('--column <name>', 'Repeatable board column name; when present it replaces the default bootstrap columns', collectRepeatedOption, [])
        .option('--append-column <name>', 'Repeatable extra column name added after the default Backlog, Todo, Doing, Done flow', collectRepeatedOption, []),
      { destructive: false },
    ).addHelpText(
      'after',
      '\nNotes:\n' +
        '  When neither --column nor --append-column is supplied, the board flow bootstraps Backlog, Todo, Doing, Done.\n' +
        '  --column replaces the default bootstrap columns; --append-column adds to them.\n' +
        '  When --slug is omitted, the CLI derives a lowercase hyphenated slug from the board name and shortens it when needed.\n' +
        '  Board and column local flows generate board-owned column slugs like ui-gelistirme-todo.\n',
    ).action(async (options: PmBoardCreateOptions) => {
      await runPmBoardCreate(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      board
        .command('closeout')
        .description('Operator-approved only: atomically close the active board window, write closeout memory, move task to Done, and clear bootstrap active refs')
        .requiredOption('--board <value>', 'Board id, exact board name, or board slug')
        .option('--task <id>', 'Explicit active task id for manual closeout when no kickoff registry exists')
        .option('--sprint <id>', 'Explicit active sprint id for manual closeout memory linkage when no kickoff registry exists')
        .option('--content <text>', 'Closeout memory content', 'Board closeout completed.')
        .option('--next-action <text>', 'Optional next action for the closeout memory')
        .option('--validation-state <text>', 'Optional validation state for the closeout memory')
        .option('--skip-memory', 'Skip writing the closeout memory item'),
      { destructive: false },
    ).action(async (options: PmBoardCloseoutOptions) => {
      await runPmBoardCloseout(options)
    }).addHelpText('after',
      '\nNotes:\n' +
      '  Operator-approved final closeout only; for ordinary stop points use `pm handoff write` or `mem write --mode resume`.\n' +
      '  If the board was not opened with `pm board kickoff`, closeout runs in manual fallback mode; pass --task/--sprint to bind explicit active refs.\n',
    ),
  )

  applyPmContextOptions(
    applyWriteOptions(
      board
        .command('delete')
        .description('Delete a Projectman board')
        .requiredOption('--id <id>', 'Board id'),
      { destructive: true },
    ).action(async (options: PmBoardDeleteOptions) => {
      await runPmBoardDelete(options)
      }),
  )

  board.addHelpText(
    'after',
    '\nBoard quick paths:\n' +
      '  `pm board bootstrap --help` shows the board bootstrap subcommands.\n' +
      '  `pm board bootstrap get --board ui --json` reads the canonical board bootstrap registry.\n' +
      '  `pm board resume --board ui --json` resolves the active board window and returns scoped resume context.\n' +
      '  `pm board kickoff --board ui --title "UI slice" --goal "Ship the next UI window" --apply --json` reuses or opens the active tracked window.\n' +
      '  `pm board closeout --board ui --content "Completed all tasks" --apply --json` operator-approved only; atomically closes the active board window.\n' +
      '\nBoard bootstrap notes:\n' +
      '  `pm board bootstrap set` writes the board bootstrap registry.\n' +
      '  `pm board resume` reads that registry, resolves the active task/sprint window, and returns a single resume packet.\n' +
      '  `pm board kickoff` reuses an open active window when available; otherwise it creates a new task+sprint pair and refreshes the registry.\n' +
      '  `pm board closeout` writes closeout memory, moves the active task to Done, and clears the bootstrap active refs in a single command; run it only after explicit operator approval.\n',
  )
}

function addUtaskCommands(cmd: Command): void {
  const utask = cmd.command('utask').description('Projectman sprint-bound microtask commands')

  applyPmContextOptions(
    applyMemoryCadenceOptions(applyWriteOptions(
      utask
        .command('create')
        .description('Create a sprint-bound utask')
        .requiredOption('--sprint <id>', 'Sprint id')
        .option('--phase <value>', 'Phase id or exact phase name', 'Main')
        .requiredOption('--title <title>', 'Utask title')
        .option('--status <value>', 'Initial utask status', 'todo')
        .option('--notes <text>', 'Optional utask notes')
        .option('--position <index>', 'Optional position override', (value) => Number.parseInt(String(value), 10)),
      { destructive: false }),
    ).action(async (options: PmUtaskCreateOptions) => {
      await runPmUtaskCreate(options)
    }),
  )

  applyPmContextOptions(
    applyMemoryCadenceOptions(applyWriteOptions(
      utask
        .command('update')
        .description('Patch a sprint-bound utask without replacing the full sprint plan')
        .requiredOption('--sprint <id>', 'Sprint id')
        .requiredOption('--id <id>', 'Utask id')
        .option('--title <title>', 'Updated utask title')
        .option('--status <value>', 'Updated utask status')
        .option('--notes <text>', 'Updated utask notes')
        .option('--position <index>', 'Optional position override', (value) => Number.parseInt(String(value), 10)),
      { destructive: false }),
    ).action(async (options: PmUtaskUpdateOptions) => {
      await runPmUtaskUpdate(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      utask
        .command('set-status')
        .description('Update only the lifecycle status of a sprint-bound utask')
        .requiredOption('--sprint <id>', 'Sprint id')
        .requiredOption('--id <id>', 'Utask id')
        .requiredOption('--status <value>', 'Updated utask status'),
      { destructive: false },
    ).action(async (options: PmUtaskSetStatusOptions) => {
      await runPmUtaskSetStatus(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      utask
        .command('delete')
        .description('Delete a sprint-bound utask')
        .requiredOption('--sprint <id>', 'Sprint id')
        .requiredOption('--id <id>', 'Utask id'),
      { destructive: true },
    ).action(async (options: PmUtaskDeleteOptions) => {
      await runPmUtaskDelete(options)
    }),
  )
}

function addSprintCommands(cmd: Command): void {
  const sprint = cmd.command('sprint').description('Projectman sprint commands')

  applyPmContextOptions(
    applyMemoryCadenceOptions(applyWriteOptions(
      sprint
        .command('create')
        .description('Create a Projectman sprint execution document')
        .requiredOption('--task <id>', 'Kanban task id')
        .requiredOption('--name <name>', 'Sprint name')
        .requiredOption('--goal <text>', 'Sprint goal')
        .option('--reference <value>', 'Repeatable reference item', collectRepeatedOption, [])
        .option('--scope-item <value>', 'Repeatable scope item', collectRepeatedOption, [])
        .option('--validation-item <value>', 'Repeatable validation item', collectRepeatedOption, [])
        .option('--notes <text>', 'Optional notes'),
      { destructive: false }),
    ).action(async (options: PmSprintCreateOptions) => {
      await runPmSprintCreate(options)
    }),
  )

  applyPmContextOptions(
    applyMemoryCadenceOptions(applyWriteOptions(
      sprint
        .command('update-plan')
        .description('Patch a sprint plan, including phases and microtasks')
        .requiredOption('--id <id>', 'Sprint id')
        .option('--name <name>', 'Updated sprint name')
        .option('--goal <text>', 'Updated sprint goal')
        .option('--reference <value>', 'Repeatable reference item patch', collectRepeatedOption, [])
        .option('--scope-item <value>', 'Repeatable scope item patch', collectRepeatedOption, [])
        .option('--validation-item <value>', 'Repeatable validation item patch', collectRepeatedOption, [])
        .option('--notes <text>', 'Updated sprint notes')
        .option('--phases-json <json-or-@file>', 'JSON array or @file.json array for the nested phase+microtask plan; quote @file values in PowerShell')
        .option('--expected-updated-at <timestamp>', 'Optional optimistic concurrency timestamp from a previous sprint snapshot'),
      { destructive: false }),
    ).action(async (options: PmSprintUpdatePlanOptions) => {
      await runPmSprintUpdatePlan(options)
    }),
  )

  applyPmContextOptions(
    sprint
      .command('list')
      .description('List Projectman sprint execution documents')
      .option('--task <id>', 'Optional kanban task id filter')
      .option('--name <name>', 'Optional sprint name filter')
      .option('--status <value>', 'Optional sprint status filter')
      .option('--limit <n>', 'Maximum records to return after filtering')
      .option('--summary', 'Return compact sprint rows instead of full sprint plans')
      .option('--include-archived', 'Include sprints with archivedAt set')
      .action(async (options: PmSprintListOptions) => {
        await runPmSprintList(options)
      }),
  )

  applyPmContextOptions(
    sprint
      .command('get')
      .description('Get a Projectman sprint execution document by selector')
      .requiredOption('--id <id>', 'Sprint selector: full id, 8+ id prefix, slug, or exact name/title')
      .action(async (options: PmSprintRefOptions) => {
        await runPmSprintGet(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      sprint
        .command('archive')
        .description('Soft-archive a Projectman sprint by setting archivedAt on the sprint record')
        .requiredOption('--id <id>', 'Sprint selector: full id, 8+ id prefix, slug, or exact name/title'),
      { destructive: false },
    ).addHelpText(
      'after',
      '\nNotes:\n' +
        '  This is a reversible metadata mark: linked tasks, phases, and microtasks are not changed.\n' +
        '  The sprint file stays in place; this command does not write under .aops/archive/**.\n',
    ).action(async (options: PmSprintArchiveOptions) => {
      await runPmSprintArchive(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      sprint
        .command('unarchive')
        .description('Restore a soft-archived Projectman sprint by clearing archivedAt')
        .requiredOption('--id <id>', 'Sprint selector: full id, 8+ id prefix, slug, or exact name/title'),
      { destructive: false },
    ).addHelpText(
      'after',
      '\nNotes:\n' +
        '  This only clears the sprint archivedAt marker; linked tasks, phases, and microtasks are not changed.\n' +
        '  The sprint file stays in place; this command does not write under .aops/archive/**.\n',
    ).action(async (options: PmSprintArchiveOptions) => {
      await runPmSprintUnarchive(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      sprint
        .command('set-status')
        .description('Set all microtask statuses in a sprint to the target status, deriving the sprint-level status')
        .requiredOption('--id <id>', 'Sprint id')
        .requiredOption('--status <value>', 'Target status: todo, doing, completed, done, cancelled, paused, blocked, postponed, in_review'),
      { destructive: false },
    ).action(async (options: PmSprintSetStatusOptions) => {
      await runPmSprintSetStatus(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      sprint
        .command('delete')
        .description('Delete a Projectman sprint execution document')
        .requiredOption('--id <id>', 'Sprint id'),
      { destructive: true },
    ).action(async (options: PmSprintRefOptions) => {
      await runPmSprintDelete(options)
    }),
  )
}

function addIssueCommands(cmd: Command): void {
  const issue = cmd.command('issue').description('Projectman issue commands')

  applyPmContextOptions(
    issue
      .command('list')
      .description('List Projectman issues')
      .option('--task <id>', 'Optional kanban task id filter')
      .option('--sprint <id>', 'Optional sprint id filter')
      .option('--utask <id>', 'Optional sprint microtask id filter')
      .option('--review-request <id>', 'Optional source review-request id filter')
      .option('--status <value>', 'Optional issue status filter')
      .option('--severity <value>', 'Optional issue severity filter')
      .option('--source <value>', 'Optional issue source filter')
      .option('--tag <value>', 'Repeatable issue tag filter', collectRepeatedOption, [])
      .action(async (options: PmIssueListOptions) => {
        await runPmIssueList(options)
      }),
  )

  applyPmContextOptions(
    issue
      .command('get')
      .description('Get a Projectman issue by id')
      .requiredOption('--id <id>', 'Issue id')
      .action(async (options: PmIssueRefOptions) => {
        await runPmIssueGet(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      issue
        .command('create')
        .description('Create a Projectman issue')
        .requiredOption('--title <title>', 'Issue title')
        .option('--description <text>', 'Issue description')
        .option('--status <value>', 'Initial issue status')
        .option('--severity <value>', 'Issue severity')
        .option('--source <value>', 'Issue source')
        .option('--task <id>', 'Linked kanban task id')
        .option('--sprint <id>', 'Linked sprint id')
        .option('--utask <id>', 'Linked sprint microtask id')
        .option('--review-request <id>', 'Linked Projectman review-request id; use with --source review for material findings')
        .option('--notes <text>', 'Optional issue notes')
        .option('--tag <value>', 'Repeatable issue tag', collectRepeatedOption, []),
      { destructive: false },
    ).action(async (options: PmIssueCreateOptions) => {
      await runPmIssueCreate(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      issue
        .command('update')
        .description('Patch a Projectman issue')
        .requiredOption('--id <id>', 'Issue id')
        .option('--title <title>', 'Updated issue title')
        .option('--description <text>', 'Updated issue description')
        .option('--status <value>', 'Updated issue status')
        .option('--severity <value>', 'Updated issue severity')
        .option('--source <value>', 'Updated issue source')
        .option('--task <id>', 'Updated kanban task id link')
        .option('--sprint <id>', 'Updated sprint id link')
        .option('--utask <id>', 'Updated sprint microtask id link')
        .option('--review-request <id>', 'Updated Projectman review-request id link')
        .option('--notes <text>', 'Updated issue notes')
        .option('--tag <value>', 'Repeatable issue tag patch', collectRepeatedOption, []),
      { destructive: false },
    ).action(async (options: PmIssueUpdateOptions) => {
      await runPmIssueUpdate(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      issue
        .command('delete')
        .description('Delete a Projectman issue')
        .requiredOption('--id <id>', 'Issue id'),
      { destructive: true },
    ).action(async (options: PmIssueRefOptions) => {
      await runPmIssueDelete(options)
    }),
  )
}

function addFeedbackCommands(cmd: Command): void {
  const feedback = cmd.command('feedback').description('Projectman feedback commands')

  applyPmContextOptions(
    feedback
      .command('list')
      .description('List Projectman feedback items')
      .option('--task <id>', 'Optional kanban task id filter')
      .option('--sprint <id>', 'Optional sprint id filter')
      .option('--utask <id>', 'Optional sprint microtask id filter')
      .option('--status <value>', 'Optional feedback status filter')
      .option('--type <value>', 'Optional feedback type filter')
      .option('--severity <value>', 'Optional feedback severity filter')
      .option('--source <value>', 'Optional feedback source filter')
      .option('--tag <value>', 'Repeatable feedback tag filter', collectRepeatedOption, [])
      .action(async (options: PmFeedbackListOptions) => {
        await runPmFeedbackList(options)
      }),
  )

  applyPmContextOptions(
    feedback
      .command('get')
      .description('Get a Projectman feedback item by id')
      .requiredOption('--id <id>', 'Feedback id')
      .action(async (options: PmFeedbackRefOptions) => {
        await runPmFeedbackGet(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      feedback
        .command('create')
        .description('Create a Projectman feedback item')
        .requiredOption('--title <title>', 'Feedback title')
        .option('--description <text>', 'Feedback description')
        .option('--status <value>', 'Initial feedback status')
        .option('--type <value>', 'Feedback type')
        .option('--severity <value>', 'Feedback severity')
        .option('--source <value>', 'Feedback source')
        .option('--task <id>', 'Linked kanban task id')
        .option('--sprint <id>', 'Linked sprint id')
        .option('--utask <id>', 'Linked sprint microtask id')
        .option('--suggestion <text>', 'Optional suggestion text')
        .option('--notes <text>', 'Optional feedback notes')
        .option('--tag <value>', 'Repeatable feedback tag', collectRepeatedOption, []),
      { destructive: false },
    ).action(async (options: PmFeedbackCreateOptions) => {
      await runPmFeedbackCreate(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      feedback
        .command('update')
        .description('Patch a Projectman feedback item')
        .requiredOption('--id <id>', 'Feedback id')
        .option('--title <title>', 'Updated feedback title')
        .option('--description <text>', 'Updated feedback description')
        .option('--status <value>', 'Updated feedback status')
        .option('--type <value>', 'Updated feedback type')
        .option('--severity <value>', 'Updated feedback severity')
        .option('--source <value>', 'Updated feedback source')
        .option('--task <id>', 'Updated kanban task id link')
        .option('--sprint <id>', 'Updated sprint id link')
        .option('--utask <id>', 'Updated sprint microtask id link')
        .option('--suggestion <text>', 'Updated suggestion text')
        .option('--notes <text>', 'Updated feedback notes')
        .option('--tag <value>', 'Repeatable feedback tag patch', collectRepeatedOption, []),
      { destructive: false },
    ).action(async (options: PmFeedbackUpdateOptions) => {
      await runPmFeedbackUpdate(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      feedback
        .command('delete')
        .description('Delete a Projectman feedback item')
        .requiredOption('--id <id>', 'Feedback id'),
      { destructive: true },
    ).action(async (options: PmFeedbackRefOptions) => {
      await runPmFeedbackDelete(options)
    }),
  )
}

function addReviewRequestCommands(cmd: Command): void {
  const rr = cmd.command('review-request')
    .alias('rr')
    .description('Projectman review request commands; canonical RR/RRR owner')

  rr.addHelpText('after',
    '\nNotes:\n' +
      '  RR is projectman.review-request. Results are append-only RRR entries on the same record.\n' +
      '  Re-review is a new child RR: use `pm review-request create --parent <rr-id>`.\n' +
      '  Material findings are explicit issues: `pm issue create --source review --review-request <rr-id> ...`.\n',
  )

  applyPmContextOptions(
    rr
      .command('list')
      .description('List Projectman review requests')
      .option('--task <id>', 'Optional kanban task id filter')
      .option('--sprint <id>', 'Optional sprint id filter')
      .option('--utask <id>', 'Optional sprint microtask id filter')
      .option('--status <value>', 'Optional review-request status filter')
      .option('--priority <value>', 'Optional review-request priority filter')
      .option('--source <value>', 'Optional review-request source filter')
      .option('--target-agent <id>', 'Optional reviewer agent filter')
      .option('--target-slot <slot>', 'Optional reviewer role slot filter')
      .option('--parent <id>', 'Optional parent review-request id filter')
      .option('--root <id>', 'Optional root review-request id filter')
      .option('--tag <value>', 'Repeatable review-request tag filter', collectRepeatedOption, [])
      .action(async (options: PmReviewRequestListOptions) => {
        await runPmReviewRequestList(options)
      }),
  )

  applyPmContextOptions(
    rr
      .command('get')
      .description('Get a Projectman review request by id')
      .requiredOption('--id <id>', 'Review-request id')
      .action(async (options: PmReviewRequestRefOptions) => {
        await runPmReviewRequestGet(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      rr
        .command('create')
        .description('Create a Projectman review request; --parent opens a child re-review gate')
        .requiredOption('--title <title>', 'Review-request title')
        .option('--description <text>', 'Review-request description')
        .option('--review-scope <text>', 'Canonical scope grammar: sprint:<id>, sprint-phase:<id>/<phase-label>, task:<id>, files:<glob> (also events:1-42 for event seq ranges)')
        .option('--instructions <text>', 'Reviewer instructions')
        .option('--reference <value>', 'Repeatable reference pointer', collectRepeatedOption, [])
        .option('--status <value>', 'Initial status: requested, in_review, responded, accepted, changes_requested, closed, cancelled')
        .option('--priority <value>', 'Priority: low, medium, high, critical (default medium)')
        .option('--source <value>', 'Source: agent, operator, collab, sync, import, manual')
        .option('--task <id>', 'Linked kanban task id')
        .option('--sprint <id>', 'Linked sprint id')
        .option('--utask <id>', 'Linked sprint microtask id')
        .option('--parent <id>', 'Parent review-request id for re-review')
        .option('--root <id>', 'Root review-request id override')
        .option('--requested-by <id>', 'Requesting agent/operator id')
        .option('--target-agent <id>', 'Target reviewer agent id')
        .option('--target-slot <slot>', 'Target reviewer role slot')
        .option('--tag <value>', 'Repeatable review-request tag', collectRepeatedOption, [])
        .option('--notify-room <room-id>', 'Best-effort: after the RR is created (--apply only), post a "REVIEW READY" wake into this hosted chat room. Requires --ping-from. Failure does not fail the command.')
        .option('--ping-from <agent-id>', 'Agent id the --notify-room wake message is posted as (required when --notify-room is set)'),
      { destructive: false },
    ).action(async (options: PmReviewRequestCreateOptions) => {
      await runPmReviewRequestCreate(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      rr
        .command('update')
        .description('Patch Projectman review-request metadata')
        .requiredOption('--id <id>', 'Review-request id')
        .option('--title <title>', 'Updated review-request title')
        .option('--description <text>', 'Updated review-request description')
        .option('--review-scope <text>', 'Updated review scope')
        .option('--instructions <text>', 'Updated reviewer instructions')
        .option('--reference <value>', 'Repeatable reference pointer patch', collectRepeatedOption, [])
        .option('--priority <value>', 'Updated priority')
        .option('--source <value>', 'Updated source')
        .option('--task <id>', 'Updated kanban task id link')
        .option('--sprint <id>', 'Updated sprint id link')
        .option('--utask <id>', 'Updated sprint microtask id link')
        .option('--requested-by <id>', 'Updated requester id')
        .option('--target-agent <id>', 'Updated target reviewer agent id')
        .option('--target-slot <slot>', 'Updated target reviewer role slot')
        .option('--tag <value>', 'Repeatable review-request tag patch', collectRepeatedOption, []),
      { destructive: false },
    ).action(async (options: PmReviewRequestUpdateOptions) => {
      await runPmReviewRequestUpdate(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      rr
        .command('result')
        .alias('add-result')
        .description('Append an immutable review result (RRR) to a Projectman review request')
        .requiredOption('--id <id>', 'Review-request id')
        .requiredOption('--reviewer <id>', 'Reviewer agent/operator id')
        .requiredOption('--outcome <value>', 'Outcome: approved, changes_requested, commented, blocked')
        .requiredOption('--summary <text>', 'Review result summary')
        .option('--positive <text>', 'Repeatable positive point', collectRepeatedOption, [])
        .option('--concern <text>', 'Repeatable concern', collectRepeatedOption, [])
        .option('--objection <text>', 'Repeatable objection', collectRepeatedOption, [])
        .option('--reference <value>', 'Repeatable reference pointer', collectRepeatedOption, [])
        .option('--issue <id>', 'Repeatable linked Projectman issue id', collectRepeatedOption, [])
        .option('--based-on-seq-range <json>', 'Seq-range basis as JSON object or @file.json, e.g. {"from":1,"to":42}'),
      { destructive: false },
    ).action(async (options: PmReviewRequestResultOptions) => {
      await runPmReviewRequestResult(options)
    }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      rr
        .command('delete')
        .description('Delete a Projectman review request')
        .requiredOption('--id <id>', 'Review-request id'),
      { destructive: true },
    ).action(async (options: PmReviewRequestRefOptions) => {
      await runPmReviewRequestDelete(options)
    }),
  )
}

function addHandoffCommands(cmd: Command): void {
  applyPmContextOptions(
    cmd
      .command('resume')
      .description('Composed paste-ready resume brief: active sprint windows, review queue for an agent, open issues/feedback, durable memory, optional hosted chat unread')
      .requiredOption('--for <agent-id>', 'Agent the brief is for')
      .option('--limit <count>', 'Max rows per section', (value) => Number.parseInt(String(value), 10))
      .option('--with-chat', 'Include hosted chat unread summary (single hosted call; degrades gracefully when the server is unavailable)')
      .action(async (options: PmResumeBriefOptions) => {
        await runPmResumeBrief(options)
      }),
  )

  const handoff = cmd.command('handoff').description('Projectman-aware memory resume and write commands')

  applyPmContextOptions(
    handoff
      .command('resume')
      .description('Build a subject-aware resume pack for a Projectman entity')
      .requiredOption('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject title/label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--query <text>', 'Optional explicit resume query override')
      .option('--goal <text>', 'Optional goal hint')
      .option('--depth <mode>', 'Resume depth: light or deep', 'light')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--strict-subject', 'Return only memory linked to the requested subject or explicit linked ids')
      .action(async (options: PmHandoffResumeOptions) => {
        await runPmHandoffResume(options)
      }),
  )

  applyPmContextOptions(
    applyWriteOptions(
      handoff
        .command('write')
        .description('Write subject-aware Projectman-linked memory for kickoff/resume/decision/blocker/closeout/rule')
        .requiredOption('--mode <mode>', 'Memory mode: kickoff, resume, decision, blocker, closeout, rule')
        .requiredOption('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
        .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
        .option('--label <text>', 'Optional subject title/label')
        .requiredOption('--content <text>', 'Memory content')
        .option('--horizon <value>', 'Optional horizon override: short, medium, long')
        .option('--importance <value>', 'Importance score (0-100)', (value) => Number.parseInt(String(value), 10))
        .option('--task-id <id>', 'Linked kanban task id')
        .option('--sprint-id <id>', 'Linked sprint id')
        .option('--phase-id <id>', 'Linked phase id')
        .option('--utask-id <id>', 'Linked utask id')
        .option('--issue-id <id>', 'Linked issue id')
        .option('--feedback-id <id>', 'Linked feedback id')
        .option('--next-action <text>', 'Recommended next action')
        .option('--next-read-ref <value>', 'Repeatable next read ref (string or JSON object)', collectRepeatedOption, [])
        .option('--source-ref <value>', 'Repeatable source ref (string or JSON object)', collectRepeatedOption, [])
        .option('--validation-state <text>', 'Validation state summary')
        .option('--pattern-name <text>', 'Reusable rule/pattern name')
        .option('--pattern-when <text>', 'When the rule applies')
        .option('--pattern-why <text>', 'Why the rule matters')
        .option('--pattern-evidence <text>', 'Pattern evidence or notes')
        .option('--tag <value>', 'Repeatable extra tag', collectRepeatedOption, []),
      { destructive: false },
    ).addHelpText(
      'after',
      '\nNotes:\n' +
        '  AI/automation default should stay on short memory while PM execution is in progress.\n' +
        '  Durable `note` and sticky `rule` are operator-controlled and should be written only on explicit human request.\n' +
        '  `pm handoff write` links memory to an existing PM subject, but it does not create that sprint/task/phase/issue record.\n',
    ).action(async (options: PmHandoffWriteOptions) => {
      await runPmHandoffWrite(options)
    }),
  )
}

export function makePmCommand(): Command {
  const cmd = new Command('pm').description('Projectman authoring commands (hosted server-first)')

  addBoardCommands(cmd)
  addTaskCommands(cmd)
  addSprintCommands(cmd)
  addUtaskCommands(cmd)
  addStatusCommands(cmd)
  addIssueCommands(cmd)
  addFeedbackCommands(cmd)
  addReviewRequestCommands(cmd)
  addHandoffCommands(cmd)

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli pm board create --project-id <project-id> --name "Engineering" --apply --json',
        'aops-cli pm board create --project-id <project-id> --name "Platform Delivery Coordination" --append-column "Review" --append-column "Blocked" --apply --json',
        'aops-cli pm board bootstrap set --project-id <project-id> --board engineering --doc-id <doc-id> --doc-version-id <docver-id> --prompt-id <prompt-id> --prompt-version-id <promptver-id> --task-id <task-id> --sprint-id <sprint-id> --apply --json',
        'aops-cli pm board resume --project-id <project-id> --board engineering --json',
        'aops-cli pm board kickoff --project-id <project-id> --board engineering --title "Sprint 3 polish" --goal "Register ve detail hizasini toparla" --apply --json',
        'aops-cli pm board list --project-id <project-id> --slug engineering --json',
        'aops-cli pm ktask list --project-id <project-id> --json',
        'aops-cli pm status audit --project-id <project-id> --board engineering --json',
        'aops-cli pm status reconcile --project-id <project-id> --task <task-id> --apply --json',
        'aops-cli pm sprint create --scope-id <scope-id> --task <task-id> --name "Sugar PoC" --goal "CLI facade" --reference /docs/aops.md --write-memory --apply --json',
        'aops-cli pm sprint update-plan --scope-id <scope-id> --id <sprint-id> --phases-json \'@/tmp/sprint-plan.json\' --apply --json',
        'aops-cli pm utask update --scope-id <scope-id> --sprint <sprint-id> --id <utask-id> --status doing --write-memory --memory-next-action "Bir sonraki validasyonu tamamla." --apply --json',
        'aops-cli pm issue create --project-id <project-id> --title "Sync push failure" --severity high --source agent --apply --json',
        'aops-cli pm review-request create --project-id <project-id> --title "Check my implementation" --target-agent claude --review-scope sprint:<sprint-id> --instructions "Focus on regressions and missing tests" --apply --json',
        'aops-cli pm review-request result --project-id <project-id> --id <rr-id> --reviewer claude --outcome changes_requested --summary "One blocker found" --issue <issue-id> --apply --json',
        'aops-cli pm issue create --project-id <project-id> --source review --review-request <rr-id> --title "Review finding" --apply --json',
        'aops-cli pm feedback list --project-id <project-id> --status new --json',
        'aops-cli pm handoff write --project-id <project-id> --mode kickoff --subject sprint --id <sprint-id> --content "Bugun burada basliyoruz." --apply --json',
        'aops-cli pm handoff resume --project-id <project-id> --subject sprint --id <sprint-id> --json',
      ],
      guide: GUIDE_PATHS.projectman,
      notes: [
        'pm board create uses the hosted board flow; --column replaces the default columns, --append-column extends them, and omitting both bootstraps Backlog, Todo, Doing, Done.',
        'pm board bootstrap set/get keep a board-slug registry in hosted metadata so agents can discover the canonical doc/prompt/task/sprint chain later.',
        'pm board resume composes board registry + active task/sprint + memory into one sugar response for agent handoff.',
        'pm board kickoff reuses the current active task/sprint window when it is still open; otherwise it creates a fresh tracked window and refreshes the board registry.',
        'Board-owned column slugs are generated as board-slug + column-slug, for example ui-gelistirme-todo.',
        'pm board list/get/delete expose hosted board records directly; board id, exact name, and slug selectors are supported by sugar.',
        'pm sprint update-plan accepts --phases-json as inline JSON or @file.json so rich nested sprint demos do not require raw agent invoke; PowerShell users should quote @file values, e.g. --phases-json \'@tmp/sprint-plan.json\'.',
        'Phase status is derived from nested microtask statuses; do not send phase.status inside --phases-json.',
        '--write-memory writes an opt-in memory side-effect only after the main PM mutation succeeds; AI defaults should stay short.',
        'pm handoff write stores PM-linked memory for kickoff/resume/decision/blocker/closeout/rule flows.',
        'Durable `note` ve sticky `rule` operator/human kontrolundedir; agent execution sirasinda default olarak yazilmaz.',
        'pm handoff resume reads from an existing tracked Projectman subject such as a real sprint, task, issue, or feedback.',
        'pm review-request is the canonical RR/RRR surface for review-request/result and re-review.',
        'pm handoff write stores memory, but it does not create the Projectman sprint/task/phase record itself.',
        'Phase is still a sprint-nested execution grouping surface, not a standalone pm CRUD family.',
      ],
    }),
  )

  return cmd
}
