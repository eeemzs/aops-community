import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  formatSkillSearchResult,
  resolveSkillDiscoveryInput,
} from '../dist/commands/skill.js'

const cliPath = fileURLToPath(new URL('../dist/main.js', import.meta.url))

function runCli(args = []) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
}

test('skill help exposes bounded search and deterministic ask', () => {
  const rootHelp = runCli(['skill', '--help'])
  assert.equal(rootHelp.status, 0, rootHelp.stderr)
  assert.match(rootHelp.stdout, /^  search\s/m)
  assert.match(rootHelp.stdout, /^  ask\s/m)

  const askHelp = runCli(['skill', 'ask', '--help'])
  assert.equal(askHelp.status, 0, askHelp.stderr)
  assert.match(askHelp.stdout, /no LLM or body\s+loading/i)
  assert.match(askHelp.stdout, /--q <text>/)
  assert.match(askHelp.stdout, /--query <text>/)
  assert.match(askHelp.stdout, /Maximum candidates, 1 to 5/i)
})

test('discovery input keeps query as a first-class operation argument', () => {
  assert.deepEqual(resolveSkillDiscoveryInput({
    query: '  kanban sprint  ',
    limit: '3',
    scopeId: 'scope-1',
    scopeResolution: 'explicit',
  }), {
    query: 'kanban sprint',
    scopeId: 'scope-1',
    scopeResolution: 'explicit',
    limit: 3,
  })

  assert.throws(() => resolveSkillDiscoveryInput({ query: 'kanban', limit: 6 }), /between 1 and 5/)
  assert.throws(() => resolveSkillDiscoveryInput({ query: 'x'.repeat(257) }), /at most 256/)
})

test('search text is concise and includes exact refs plus ranking rationale', () => {
  const text = formatSkillSearchResult({
    query: 'kanban',
    count: 1,
    candidates: [{
      name: 'aops-cli-projectman',
      shortDescription: 'Project planning guide',
      exactRef: 'skill-version:version-1',
      rationale: 'Matched raw metadata: name, tags.',
    }],
  })

  assert.match(text, /aops-cli-projectman — Project planning guide/)
  assert.match(text, /ref: skill-version:version-1/)
  assert.match(text, /Matched raw metadata/)
})

test('empty search text retains the normalized operator query', () => {
  assert.equal(
    formatSkillSearchResult({ query: 'kanban sprint', count: 0, candidates: [] }),
    'No published hosted skill matched "kanban sprint".',
  )
})
