import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { SkillVersionServiceError } from '../../errors/SkillVersionServiceError.js'
import { IbmResource, IbmSkill, IbmSkillVersion, IbmSkillVersionInsert } from '../../../domain/models/index.js'

export const CANONICAL_SKILL_PACKAGE_ENTRY_FILE = 'SKILL.md'
export const CANONICAL_SKILL_PACKAGE_STANDARD = 'aops-skill-package-v1'
export const CANONICAL_SKILL_PACKAGE_FORMAT = 'filesystem-skill-package'

export interface SkillPackageMetadata extends Record<string, unknown> {
  source?: string
  purpose?: string
}

export interface SkillPackageFileInput {
  path: string
  content: string
  kind?: string
  encoding?: string
  mimeType?: string
}

export interface SkillPackageBundleInput {
  files: SkillPackageFileInput[]
  entryFile?: string
  metadata?: SkillPackageMetadata
  sourcePath?: string
}

export interface SkillPackageDescriptor {
  entryFile: string
  standard: string
  format: string
  fileCount: number
  sourcePath?: string
  metadata?: SkillPackageMetadata
}

export interface ImportSkillPackageInput {
  projectId: string
  scopeType: 'project'
  scopeId?: string
  skillId?: string
  name?: string
  description?: string
  shortDescription?: string
  tags?: string[]
  status?: 'draft' | 'published' | 'archived'
  createdBy?: string
  updatedBy?: string
  publish?: boolean
  bundle: SkillPackageBundleInput
}

export interface ImportSkillPackageResult {
  skill: IbmSkill
  skillVersion: IbmSkillVersion
  resource?: IbmResource
}

export interface ExportSkillPackageResult {
  skillVersionId: string
  skillId: string
  skillName?: string
  projectId: string
  scopeId: string
  files: SkillPackageFileInput[]
  metadata: SkillPackageMetadata
  package: SkillPackageDescriptor
}

export interface MaterializeSkillPackageInput {
  outputDir: string
  overwrite?: boolean
}

export interface MaterializeSkillPackageResult {
  skillVersionId: string
  outputDir: string
  writtenFiles: Array<{
    path: string
    fullPath: string
    sizeBytes: number
  }>
}

export interface ISkillVersionServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSkillVersion>): Effect.Effect<IbmSkillVersion | null, SkillVersionServiceError>
  create(data: IbmSkillVersionInsert): Effect.Effect<IbmSkillVersion, SkillVersionServiceError>
  getSkillVersion(id: string, options?: DbQueryOptions<IbmSkillVersion>): Effect.Effect<IbmSkillVersion | null, SkillVersionServiceError>
  listSkillVersions(
    filter?: Partial<IbmSkillVersion>,
    options?: DbQueryOptions<IbmSkillVersion>
  ): Effect.Effect<IbmSkillVersion[], SkillVersionServiceError>
  updateSkillVersion(id: string, patch: Partial<IbmSkillVersion>): Effect.Effect<IbmSkillVersion, SkillVersionServiceError>
  removeSkillVersion(id: string): Effect.Effect<void, SkillVersionServiceError>
  publishSkillVersion(id: string, updatedBy?: string): Effect.Effect<IbmSkillVersion, SkillVersionServiceError>
  importSkillPackage(data: ImportSkillPackageInput): Effect.Effect<ImportSkillPackageResult, SkillVersionServiceError>
  exportSkillPackage(id: string): Effect.Effect<ExportSkillPackageResult, SkillVersionServiceError>
  materializeSkillPackage(
    id: string,
    data: MaterializeSkillPackageInput
  ): Effect.Effect<MaterializeSkillPackageResult, SkillVersionServiceError>
}

export interface ISkillVersionLookupPort {
  getById(id: string): Effect.Effect<IbmSkillVersion | null, SkillVersionServiceError>
}
