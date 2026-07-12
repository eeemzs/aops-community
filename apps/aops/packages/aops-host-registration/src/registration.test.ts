import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadHostRegistrationFromSpecifier } from './registration.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aops-host-registration-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (!root) continue
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('host registration loader', () => {
  it('materializes relative paths against the declared baseDir', async () => {
    const packageRoot = createTempRoot()
    const distDir = path.join(packageRoot, 'dist')
    fs.mkdirSync(distDir, { recursive: true })

    const modulePath = path.join(distDir, 'host-registration.mjs')
    fs.writeFileSync(
      modulePath,
      `export default {
        domain: 'sample',
        displayName: 'Sample',
        baseDir: '..',
        pluginLoader: {
          allowlist: ['./plugins/extra-plugin.mjs']
        },
        manifestProviders: [
          {
            id: 'sample-dcm',
            domain: 'sample',
            enabled: true,
            module: './dist/tooling.mjs',
            exportName: 'buildSampleDomainCapabilityManifest',
            options: {
              adapter: {
                workspaceRoot: './workspace',
                cliCommandCandidates: ['sample', './bin/sample'],
                toolingModuleCandidates: ['@scope/sample-tooling', './dist/tooling.mjs']
              }
            }
          }
        ],
        plugins: [
          {
            domain: 'sample',
            enabled: true,
            module: './dist/plugin.mjs',
            factory: 'createSamplePlugin',
            options: {
              adapter: {
                cliDistEntry: './dist/main.js',
                cliCwd: './workspace'
              }
            }
          }
        ]
      }`,
      'utf8',
    )

    const manifest = await loadHostRegistrationFromSpecifier(modulePath)

    expect(manifest.domain).toBe('sample')
    expect(manifest.baseDir).toBe(packageRoot)
    expect(manifest.manifestProviders?.[0]?.module).toBe(path.join(packageRoot, 'dist', 'tooling.mjs'))
    expect(manifest.manifestProviders?.[0]?.options).toEqual({
      adapter: {
        workspaceRoot: path.join(packageRoot, 'workspace'),
        cliCommandCandidates: ['sample', path.join(packageRoot, 'bin', 'sample')],
        toolingModuleCandidates: ['@scope/sample-tooling', path.join(packageRoot, 'dist', 'tooling.mjs')],
      },
    })
    expect(manifest.plugins?.[0]?.module).toBe(path.join(packageRoot, 'dist', 'plugin.mjs'))
    expect(manifest.plugins?.[0]?.options).toEqual({
      adapter: {
        cliDistEntry: path.join(packageRoot, 'dist', 'main.js'),
        cliCwd: path.join(packageRoot, 'workspace'),
      },
    })
    expect(manifest.pluginLoader?.allowlist).toEqual([
      path.join(packageRoot, 'plugins', 'extra-plugin.mjs'),
      path.join(packageRoot, 'dist', 'plugin.mjs'),
    ])
    expect(manifest.provenance?.sourceType).toBe('file')
  })
})
