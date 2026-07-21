import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { activateCommunityPackageWorkingDirectory } from '../scripts/community-host.mjs'

const serverRoot = realpathSync(path.resolve(fileURLToPath(new URL('..', import.meta.url))))

test('npm host anchors relative runtime modules to the server package root', () => {
  const original = process.cwd()
  const unrelated = mkdtempSync(path.join(tmpdir(), 'aops-community-host-cwd-'))
  try {
    process.chdir(unrelated)
    assert.equal(activateCommunityPackageWorkingDirectory(), serverRoot)
    assert.equal(realpathSync(process.cwd()), serverRoot)
  } finally {
    process.chdir(original)
    rmSync(unrelated, { recursive: true, force: true })
  }
})
