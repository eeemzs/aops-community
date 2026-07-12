#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildAgentspaceDomainCapabilityManifest,
  buildAgentspaceHostRouteProjection,
  listAgentspaceOperationContracts,
} from '../dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, '..')

function isTruthy(value) {
  if (value === undefined) return true
  const normalized = String(value).trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(normalized)
}

function parseCliArgs(argv) {
  const args = {
    outDir: 'dist/manifests',
    domainVersion: undefined,
    manifestVersion: undefined,
    includeDocs: true,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--out-dir') {
      args.outDir = argv[index + 1] ?? args.outDir
      index += 1
      continue
    }
    if (token === '--domain-version') {
      args.domainVersion = argv[index + 1]
      index += 1
      continue
    }
    if (token === '--manifest-version') {
      args.manifestVersion = argv[index + 1]
      index += 1
      continue
    }
    if (token === '--include-docs') {
      args.includeDocs = isTruthy(argv[index + 1])
      if (argv[index + 1] && !argv[index + 1].startsWith('--')) index += 1
      continue
    }
  }

  return args
}

async function readPackageVersion() {
  const raw = await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')
  const parsed = JSON.parse(raw)
  return typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : '0.0.0'
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2))
  const packageVersion = await readPackageVersion()
  const outDir = path.resolve(packageRoot, cli.outDir)
  await fs.mkdir(outDir, { recursive: true })

  const dcmManifest = buildAgentspaceDomainCapabilityManifest({
    refresh: true,
    includeDocs: cli.includeDocs,
    domainVersion: cli.domainVersion ?? packageVersion,
    ...(cli.manifestVersion ? { manifestVersion: cli.manifestVersion } : {}),
  })
  const hostRoutes = buildAgentspaceHostRouteProjection({ refresh: true })
  const operationContracts = listAgentspaceOperationContracts({ refresh: true })

  const dcmPath = path.join(outDir, 'dcm.json')
  const routesPath = path.join(outDir, 'host-routes.json')
  const operationsPath = path.join(outDir, 'operations.json')

  await Promise.all([
    writeJson(dcmPath, dcmManifest),
    writeJson(routesPath, hostRoutes),
    writeJson(operationsPath, operationContracts),
  ])

  console.log('[agentspace-kit] manifest export completed')
  console.log(`- dcm: ${dcmPath}`)
  console.log(`- host-routes: ${routesPath}`)
  console.log(`- operations: ${operationsPath}`)
  console.log(`- operations-count: ${operationContracts.length}`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error('[agentspace-kit] manifest export failed')
  console.error(message)
  process.exitCode = 1
})
