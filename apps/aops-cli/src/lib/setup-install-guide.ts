import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const MAX_INSTALL_SKILL_BYTES = 64 * 1024

export type AopsInstallSkill = Readonly<{
  name: 'aops-install'
  path: string
  sha256: string
  content: string
}>

export type AopsInstallSkillDependencies = Readonly<{
  candidates?: () => readonly string[]
}>

function defaultCandidates(): readonly string[] {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  return Object.freeze([
    path.resolve(moduleDirectory, '..', 'skills', 'aops-install', 'SKILL.md'),
    path.resolve(moduleDirectory, '..', '..', 'assets', 'skills', 'aops-install', 'SKILL.md'),
  ])
}

function readCandidate(candidate: string): AopsInstallSkill | undefined {
  try {
    const absolutePath = path.resolve(candidate)
    const stat = lstatSync(absolutePath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_INSTALL_SKILL_BYTES) {
      return undefined
    }
    const resolvedPath = realpathSync.native(absolutePath)
    const content = readFileSync(resolvedPath, 'utf8')
    if (!content.replaceAll('\r\n', '\n').startsWith('---\nname: aops-install\n') || content.includes('\0')) return undefined
    return Object.freeze({
      name: 'aops-install' as const,
      path: resolvedPath,
      sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
      content,
    })
  } catch {
    return undefined
  }
}

export function loadAopsInstallSkill(
  dependencies: AopsInstallSkillDependencies = {},
): AopsInstallSkill {
  for (const candidate of (dependencies.candidates ?? defaultCandidates)()) {
    const skill = readCandidate(candidate)
    if (skill) return skill
  }
  throw new Error('aops_install_skill_missing:reinstall_the_official_aops_cli_package')
}
