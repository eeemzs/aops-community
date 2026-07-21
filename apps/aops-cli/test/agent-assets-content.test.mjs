import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const coreRoot = fileURLToPath(new URL('../assets/agent-assets/core/', import.meta.url))
const gatewayPath = fileURLToPath(new URL('../assets/agent-assets/gateway/aops/SKILL.md', import.meta.url))
const installSkillPath = fileURLToPath(new URL('../assets/skills/aops-install/SKILL.md', import.meta.url))
const cliPath = fileURLToPath(new URL('../dist/main.js', import.meta.url))

const expectedFiles = [
  'SKILL.md',
  'references/agentspace/SKILL.md',
  'references/aops-cli-core/SKILL.md',
  'references/chatv3/SKILL.md',
  'references/collaborative-work/SKILL.md',
  'references/discuss/SKILL.md',
  'references/docman/SKILL.md',
  'references/hosted-chat/SKILL.md',
  'references/mission/SKILL.md',
  'references/projectman/SKILL.md',
  'references/sys/SKILL.md',
  'references/view/SKILL.md',
  'references/working-disciplines/SKILL.md',
  'user-guides/agent-assets.md',
  'user-guides/agentspace.md',
  'user-guides/aops-cli.md',
  'user-guides/aops-system.md',
  'user-guides/chatv3.md',
  'user-guides/docman.md',
  'user-guides/projectman.md',
  'user-guides/sys.md',
  'user-guides/working-disciplines.md',
].sort()

function listFiles(root, prefix = '') {
  const files = []
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix.replaceAll('\\', '/'), entry.name)
    if (entry.isDirectory()) files.push(...listFiles(root, relative))
    else if (entry.isFile()) files.push(relative)
  }
  return files.sort()
}

function read(relative) {
  return readFileSync(path.join(coreRoot, ...relative.split('/')), 'utf8')
}

function runHelp(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...command.split(' '), '--help'], {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (status) => resolve({ command, status, stdout, stderr }))
  })
}

test('packaged core has the reviewed mounted-domain and discipline closure', () => {
  assert.deepEqual(listFiles(coreRoot), expectedFiles)

  for (const relative of expectedFiles.filter((file) => file.endsWith('/SKILL.md') || file === 'SKILL.md')) {
    const body = read(relative)
    assert.match(body, /^---\r?\nname: [a-z0-9-]+\r?\ndescription: .+\r?\n---\r?\n/)
  }
})

test('root router references only files contained in the immutable package', () => {
  const root = read('SKILL.md')
  const refs = [...root.matchAll(/`(references\/[^`]+\/SKILL\.md)`/g)].map((match) => match[1])
  assert.equal(refs.length, 12)
  for (const ref of refs) assert.equal(statSync(path.join(coreRoot, ...ref.split('/'))).isFile(), true, ref)

  assert.match(root, /Working\s+disciplines are available after setup, but are never selected/i)
  assert.match(root, /`aops chat` is hosted coordination.*`aops chatv3`/s)
})

test('public core excludes private paths and unavailable command claims', () => {
  const all = expectedFiles.map((file) => `${file}\n${read(file)}`).join('\n')
  const blocked = [
    /[A-Z]:\\(?:Users|dev-js2)\\/i,
    /github\.com\/eeemzs\/aops(?:\.git|\b)(?!-community)/i,
    /apps\/aops(?:\/|\\)/i,
    /domains\/(?:agentspace|chatv3|docman|projectman|sys)(?:\/|\\)/i,
    /\bpnpm\b/i,
    /\baops (?:file|tasker|runner|loop)(?:\s|`)/i,
    /Chrome MCP|Turkish titles/i,
  ]
  for (const pattern of blocked) assert.doesNotMatch(all, pattern)
})

test('mounted domains have rich on-demand guides and schema-first references', () => {
  const guideExpectations = {
    'user-guides/agentspace.md': [/memory/i, /hosted chat/i, /aops mem/],
    'user-guides/chatv3.md': [/encryption/i, /invite/i, /aops chatv3/],
    'user-guides/docman.md': [/version/i, /search/i, /aops doc/],
    'user-guides/projectman.md': [/board/i, /sprint/i, /review/i],
    'user-guides/sys.md': [/counter/i, /event store/i, /rate limiter/i],
  }

  for (const [relative, patterns] of Object.entries(guideExpectations)) {
    const body = read(relative)
    assert.ok(Buffer.byteLength(body) >= 2_000, `${relative} is unexpectedly thin`)
    for (const pattern of patterns) assert.match(body, pattern, `${relative} lacks ${pattern}`)
  }

  for (const domain of ['agentspace', 'chatv3', 'docman', 'projectman', 'sys']) {
    const matching = expectedFiles.find((file) => file === `references/${domain}/SKILL.md`)
    assert.ok(matching, `missing ${domain} reference`)
    assert.match(read(matching), /aops (?:agent schema|.*--help)/s)
  }
})

test('high-frequency packaged examples use the current selector flags', () => {
  const projectman = read('references/projectman/SKILL.md')
  const hostedChat = read('references/hosted-chat/SKILL.md')

  assert.match(projectman, /aops pm board get --slug <board-slug> --json/)
  assert.match(projectman, /aops pm handoff resume --subject ktask --id <task-id> --json/)
  assert.doesNotMatch(projectman, /pm board get --board|pm handoff resume --task/)
  assert.match(hostedChat, /aops chat room get --id <id> --json/)
  assert.doesNotMatch(hostedChat, /chat room get --room-id/)
})

test('gateway and installation skill promote aops and the complete verified setup', () => {
  const gateway = readFileSync(gatewayPath, 'utf8')
  const installSkill = readFileSync(installSkillPath, 'utf8')

  assert.match(gateway, /aops assets resolve --gateway aops --json/)
  assert.doesNotMatch(gateway, /aops-cli assets/)
  assert.match(installSkill, /aops --version/)
  assert.match(installSkill, /rich on-demand mounted-domain user guides/i)
  assert.match(installSkill, /does not\s+select one/i)
  assert.match(installSkill, /aops assets install --target all --apply --json/)
})

test('every nested help command recommended by a packaged reference exists', async () => {
  const commands = new Set()
  for (const relative of expectedFiles.filter((file) => file.startsWith('references/'))) {
    for (const match of read(relative).matchAll(/^aops ([a-z0-9-]+(?: [a-z0-9-]+)*) --help\s*$/gmi)) {
      commands.add(match[1])
    }
  }

  assert.ok(commands.size >= 25)
  const queue = [...commands]
  for (let offset = 0; offset < queue.length; offset += 8) {
    const results = await Promise.all(queue.slice(offset, offset + 8).map(runHelp))
    for (const result of results) {
      assert.equal(result.status, 0, `${result.command}: ${result.stderr}`)
      assert.match(result.stdout, /^Usage: aops /m, result.command)
    }
  }
})
