import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDocmanDomainCapabilityManifest } from '../src/operations/dcm.js'

type DcmCommand = 'print' | 'emit' | 'check'

type ParsedArgs = {
  command: DcmCommand
  outFile: string
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')
const defaultOutFile = path.resolve(packageRoot, 'dist/dcm.json')

function normalizeOutFilePath(value: string): string {
  if (path.isAbsolute(value)) return value
  return path.resolve(packageRoot, value)
}

function parseArgs(argv: string[]): ParsedArgs {
  const [commandRaw, ...rest] = argv
  const command = (commandRaw ?? '').trim().toLowerCase()
  if (command !== 'print' && command !== 'emit' && command !== 'check') {
    throw new Error('invalid_command:expected_one_of(print|emit|check)')
  }

  let outFile = defaultOutFile
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (token !== '--out') continue

    const maybeValue = rest[index + 1]
    if (!maybeValue || maybeValue.startsWith('--')) {
      throw new Error('missing_out_value')
    }

    outFile = normalizeOutFilePath(maybeValue)
    index += 1
  }

  return { command, outFile }
}

async function readPackageVersion(): Promise<string> {
  const packageJsonPath = path.resolve(packageRoot, 'package.json')
  const raw = await fs.readFile(packageJsonPath, 'utf8')
  const parsed = JSON.parse(raw) as { version?: unknown }
  const version = typeof parsed.version === 'string' ? parsed.version.trim() : ''
  return version || '0.0.0'
}

function serializeManifest(manifest: unknown): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

async function buildManifestJson(): Promise<string> {
  const domainVersion = await readPackageVersion()
  const manifest = buildDocmanDomainCapabilityManifest({
    domainVersion,
    includeDocs: true,
    refresh: true,
  })
  return serializeManifest(manifest)
}

async function runPrint(): Promise<void> {
  const json = await buildManifestJson()
  process.stdout.write(json)
}

async function runEmit(outFile: string): Promise<void> {
  const json = await buildManifestJson()
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, json, 'utf8')
  process.stderr.write(`[dcm] emitted ${outFile}\n`)
}

async function runCheck(outFile: string): Promise<void> {
  const expectedJson = await buildManifestJson()

  let actualJson: string
  try {
    actualJson = await fs.readFile(outFile, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`dcm_missing:${outFile}`)
    }
    throw error
  }

  const actualNormalized = serializeManifest(JSON.parse(actualJson))
  if (actualNormalized !== expectedJson) {
    throw new Error(`dcm_outdated:${outFile}`)
  }

  process.stderr.write(`[dcm] up-to-date ${outFile}\n`)
}

async function main(): Promise<void> {
  const { command, outFile } = parseArgs(process.argv.slice(2))

  if (command === 'print') {
    await runPrint()
    return
  }

  if (command === 'emit') {
    await runEmit(outFile)
    return
  }

  await runCheck(outFile)
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[dcm] failed: ${message}\n`)
  process.exitCode = 1
})

