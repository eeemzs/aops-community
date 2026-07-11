import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function requireLoopbackBaseUrl(value) {
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(host) || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('community_demo_loopback_api_base_required');
  }
  return parsed.origin;
}

const API_BASE_URL = requireLoopbackBaseUrl(process.env.COMMUNITY_API_BASE_URL ?? 'http://127.0.0.1:5901');
const DEMO_SLUG = 'aops-community-five-minute-demo';
const DEMO_TITLE = 'AOPS Community — Five-minute demo';
const STATE_TAG = 'aops-community-demo-state-v1';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function unwrap(payload) {
  const value = payload?.data?.data ?? payload?.response?.data ?? payload?.data ?? payload?.result;
  if (value === undefined) throw new Error('community_demo_invoke_shape_invalid');
  return value;
}

async function invoke(toolId, input, { confirm = false, ignoreMissing = false, scopeId = null } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (scopeId) {
    headers['x-project-id'] = scopeId;
    headers['x-scope-id'] = scopeId;
  }
  const response = await fetch(`${API_BASE_URL}/api/agent/tools/${encodeURIComponent(toolId)}/invoke`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input, preview: false, apply: true, confirm }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error(`community_demo_non_json:${toolId}:${response.status}`); }
  if (!response.ok || payload?.ok === false || payload?.data?.ok === false) {
    const code = payload?.error?.code ?? payload?.data?.error?.code ?? `http_${response.status}`;
    if (ignoreMissing && (response.status === 404 || /^(?:not[_-]?found|record[_-]?not[_-]?found)$/i.test(String(code)))) return null;
    throw new Error(`community_demo_invoke_failed:${toolId}:${code}`);
  }
  return unwrap(payload);
}

async function findDemoProject() {
  const projects = await invoke('agentspace.project.list-projects', { filter: { slug: DEMO_SLUG } });
  const matches = (Array.isArray(projects) ? projects : projects?.items ?? []).filter((entry) => entry?.slug === DEMO_SLUG);
  if (matches.length > 1) throw new Error('community_demo_duplicate_projects_refuse_unsafe_operation');
  return matches[0] ?? null;
}

async function readState(projectId) {
  const memories = await invoke('agentspace.memory-item.list-memory-items', { filter: { scopeId: projectId } });
  const items = Array.isArray(memories) ? memories : memories?.items ?? [];
  const memory = items.find((entry) => Array.isArray(entry?.tags) && entry.tags.includes(STATE_TAG));
  return memory ? { memory, state: memory?.meta?.communityDemoState ?? null } : null;
}

async function updateState(memoryId, state, content = 'AOPS Community demo seed is being prepared.') {
  await invoke('agentspace.memory-item.update-memory-item', {
    id: memoryId,
    patch: { content, meta: { communityDemoState: state } },
  });
}

async function status() {
  const project = await findDemoProject();
  if (!project) return { status: 'community-demo-empty', seeded: false, slug: DEMO_SLUG };
  const stored = await readState(project.id);
  return {
    status: stored?.state?.phase === 'ready' ? 'community-demo-ready' : 'community-demo-incomplete',
    seeded: stored?.state?.phase === 'ready',
    slug: DEMO_SLUG,
    projectId: project.id,
    phase: stored?.state?.phase ?? 'project-created-before-state',
    records: stored?.state ? Object.keys(stored.state).filter((key) => key.endsWith('Id')).sort() : [],
  };
}

async function reset() {
  const project = await findDemoProject();
  if (!project) return { status: 'community-demo-reset-clean', removed: false, slug: DEMO_SLUG };
  const stored = await readState(project.id);
  const state = stored?.state ?? {};
  const remove = async (toolId, input, options) => invoke(toolId, input, { ...options, ignoreMissing: true, scopeId: project.id });
  if (state.sprintId) await remove('projectman.sprint.delete', { id: state.sprintId });
  if (state.taskId) await remove('projectman.kanban-task.delete', { id: state.taskId });
  if (state.boardId) await remove('projectman.kanban-board.delete', { id: state.boardId });
  if (state.documentId) {
    await remove('docman.document.delete.safe', { id: state.documentId, confirmName: DEMO_TITLE }, { confirm: true });
  }
  if (state.documentGroupId) await remove('docman.document-group.delete', { id: state.documentGroupId });
  if (state.promptVersionId) await remove('agentspace.prompt-version.remove-prompt-version', { id: state.promptVersionId });
  if (state.promptId) await remove('agentspace.prompt.remove-prompt', { id: state.promptId });
  if (state.skillVersionId) await remove('agentspace.skill-version.remove-skill-version', { id: state.skillVersionId });
  if (state.skillId) await remove('agentspace.skill.remove-skill', { id: state.skillId });
  if (state.memoryId ?? stored?.memory?.id) {
    await remove('agentspace.memory-item.remove-memory-item', { id: state.memoryId ?? stored.memory.id });
  }
  await invoke('agentspace.project.remove-project', { id: project.id });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await findDemoProject())) return { status: 'community-demo-reset-clean', removed: true, slug: DEMO_SLUG };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('community_demo_reset_postcondition_failed');
}

async function seed() {
  const existing = await status();
  if (existing.seeded) return { ...existing, status: 'community-demo-existing' };
  if (existing.status !== 'community-demo-empty') {
    throw new Error('community_demo_incomplete_run_detected_run_reset_first');
  }

  const project = await invoke('agentspace.project.create', {
    data: {
      name: DEMO_TITLE,
      slug: DEMO_SLUG,
      description: 'A local-trusted walkthrough of project, Docman, Projectman, reusable assets, and durable memory.',
      tags: ['community-demo', 'five-minute-scenario'],
      status: 'active',
      visibility: 'private',
      projectType: 'demo',
    },
  });
  const state = { schemaVersion: 1, phase: 'seeding', projectId: project.id };
  const memory = await invoke('agentspace.memory-item.create', {
    data: {
      scopeId: project.id,
      kind: 'decision',
      durability: 'durable',
      content: 'AOPS Community demo seed is being prepared.',
      tags: [STATE_TAG, 'community-demo', 'decision'],
      importance: 8,
      sourceType: 'community-demo',
      sourceId: DEMO_SLUG,
      meta: { communityDemoState: state },
    },
  });
  state.memoryId = memory.id;
  await updateState(memory.id, state);

  const group = await invoke('docman.document-group.create', {
    data: { scopeId: project.id, groupUid: 'community-demo', title: 'Community demo', description: 'Five-minute jury scenario' },
  }, { scopeId: project.id });
  state.documentGroupId = group.id;
  await updateState(memory.id, state);

  const document = await invoke('docman.document.create', {
    data: {
      scopeId: project.id,
      documentUid: 'community-demo-brief',
      groupId: group.id,
      groupUid: 'community-demo',
      slug: 'community-demo-brief',
      title: DEMO_TITLE,
      summary: 'A concise brief for the AOPS Community five-minute walkthrough.',
      status: 'published',
      visibility: 'internal',
      tags: ['community-demo', 'brief'],
    },
  }, { scopeId: project.id });
  state.documentId = document.id;
  await updateState(memory.id, state);

  const documentVersion = await invoke('docman.document-version.create', {
    data: { documentId: document.id, version: 1, status: 'published', title: DEMO_TITLE, isCurrent: true },
  }, { scopeId: project.id });
  state.documentVersionId = documentVersion.id;
  await updateState(memory.id, state);
  await invoke('docman.document-version.import-headings', {
    documentVersionId: documentVersion.id,
    scopeId: project.id,
    parsedGraph: {
      sourceHash: sha256('aops-community-five-minute-demo-v1'),
      sourcePath: 'deploy/community/demo.mjs',
      nodes: [{
        kind: 'section', title: 'Product brief', depth: 2, slug: 'product-brief', children: [{
          kind: 'page', title: 'Five-minute scenario', depth: 4, slug: 'five-minute-scenario',
          bodyMarkdown: 'Create a project, capture this brief, plan one delivery task, reuse a prompt and skill, then retain the decision as durable memory.',
        }],
      }],
    },
    options: {
      existingGraphPolicy: 'error',
      slugStrategy: 'kebab-from-title',
      bodyAssignment: 'leaf-page-content',
      headingToPagePolicy: 'h4-and-below',
      synthesizeOverviewPages: false,
    },
  }, { scopeId: project.id });

  const boardResult = await invoke('projectman.kanban-board.bootstrap', {
    projectId: project.id,
    scopeId: project.id,
    project: project.id,
    name: 'Community demo delivery',
    slug: 'community-demo-delivery',
    description: 'One-board delivery plan for the five-minute scenario.',
  }, { scopeId: project.id });
  const board = boardResult?.board ?? boardResult;
  const columns = boardResult?.columns ?? [];
  const todo = columns.find((entry) => String(entry?.column?.name ?? entry?.name ?? entry?.title ?? '').toLowerCase() === 'todo') ?? columns[1];
  const todoPlacementId = todo?.boardColumn?.id ?? todo?.id;
  if (!board?.id || !todoPlacementId) throw new Error('community_demo_board_bootstrap_shape_invalid');
  state.boardId = board.id;
  await updateState(memory.id, state);

  const task = await invoke('projectman.kanban-task.create', {
    projectId: project.id,
    scopeId: project.id,
    project: project.id,
    board: board.id,
    boardColumn: todoPlacementId,
    title: 'Ship the Community demo walkthrough',
    description: 'Verify the brief, implementation plan, reusable assets, memory, and local ChatV3 collaboration.',
  }, { scopeId: project.id });
  state.taskId = task.id;
  await updateState(memory.id, state);

  const sprint = await invoke('projectman.sprint.create', {
    projectId: project.id,
    scopeId: project.id,
    project: project.id,
    kanbanTask: task.id,
    name: 'Community demo implementation plan',
    goal: 'NE: deliver the five-minute local demo. NICIN: prove the Community workflow is usable. DONE-WHEN: every seeded surface is visible and reset is clean.',
    references: ['docman:community-demo-brief', 'community:chatv3-local-trusted'],
    scope: ['Project', 'Docman brief', 'Projectman task/plan', 'Prompt', 'Skill', 'Durable decision memory'],
    validationPlan: ['Run demo status', 'Inspect each Cockpit surface', 'Run ChatV3 smoke', 'Run demo reset and confirm empty state'],
    notes: 'Fileman and Runner are intentionally outside the Community capability profile.',
  }, { scopeId: project.id });
  state.sprintId = sprint.id;
  await updateState(memory.id, state);

  const prompt = await invoke('agentspace.prompt.create', {
    data: {
      scopeId: project.id,
      name: 'Community demo status brief',
      description: 'Turn the implementation plan into a short jury-facing status.',
      tags: ['community-demo', 'status-brief'],
      status: 'draft',
    },
  });
  state.promptId = prompt.id;
  await updateState(memory.id, state);
  const promptVersion = await invoke('agentspace.prompt-version.create', {
    data: {
      projectId: project.id,
      promptId: prompt.id,
      version: 1,
      status: 'draft',
      content: 'Summarize the plan in three bullets: outcome, evidence, and next action. Keep the local-trusted boundary explicit.',
      variables: { audience: 'jury' },
    },
  });
  state.promptVersionId = promptVersion.id;
  await updateState(memory.id, state);
  await invoke('agentspace.prompt-version.publish-prompt-version', { id: promptVersion.id });

  const skill = await invoke('agentspace.skill.create', {
    data: {
      scopeId: project.id,
      name: 'community-demo-check',
      description: 'Verify the seeded Community walkthrough without expanding product scope.',
      shortDescription: 'Check the Community demo.',
      tags: ['community-demo', 'verification'],
    },
  });
  state.skillId = skill.id;
  await updateState(memory.id, state);
  const skillVersion = await invoke('agentspace.skill-version.create', {
    data: {
      projectId: project.id,
      skillId: skill.id,
      version: 1,
      status: 'draft',
      entryFile: 'SKILL.md',
      skillStandard: 'agentskills.io',
      content: '---\nname: community-demo-check\ndescription: Verify the AOPS Community five-minute demo.\n---\nCheck project, brief, plan, prompt, skill, durable memory, and local ChatV3 evidence. Do not claim Fileman, Runner, hosted cloud, or public-release readiness.',
    },
  });
  state.skillVersionId = skillVersion.id;
  await updateState(memory.id, state);
  await invoke('agentspace.skill-version.publish-skill-version', { id: skillVersion.id });
  state.phase = 'ready';
  await updateState(
    memory.id,
    state,
    'Decision: the Community demo stays local-trusted and demonstrates Project, Docman, Projectman, reusable prompt/skill assets, durable memory, and self-hosted ChatV3. Fileman, Runner, hosted cloud, and public publishing remain explicitly out of scope.',
  );
  return { status: 'community-demo-seeded', seeded: true, slug: DEMO_SLUG, projectId: project.id, records: Object.keys(state).filter((key) => key.endsWith('Id')).sort() };
}

export async function runCommunityDemo(command = 'status') {
  if (command === 'status') return status();
  if (command === 'seed') return seed();
  if (command === 'reset') return reset();
  if (command === 'reseed') { await reset(); return seed(); }
  throw new Error(`community_demo_unknown_command:${command}`);
}

if (typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCommunityDemo(process.argv[2] ?? 'status')
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => { process.stderr.write(`[community-demo] ${error.message}\n`); process.exitCode = 1; });
}
