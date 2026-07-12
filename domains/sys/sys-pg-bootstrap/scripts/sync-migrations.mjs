#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.resolve(packageDir, '..', 'drizzle-out', 'sys')
const targetDir = path.join(packageDir, 'drizzle-out', 'sys')

if (!fs.existsSync(sourceDir)) {
  throw new Error(`sys_pg_bootstrap_source_migrations_missing:${sourceDir}`)
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(path.dirname(targetDir), { recursive: true })
fs.cpSync(sourceDir, targetDir, { recursive: true })
