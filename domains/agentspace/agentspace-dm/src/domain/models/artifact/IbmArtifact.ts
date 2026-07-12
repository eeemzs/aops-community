import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { artifactZodSchema, artifactZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmArtifact = z.infer<typeof artifactZodSchema>
export type IbmArtifactInsert = z.infer<typeof artifactZodSchemaInsert>

export const ibmArtifactKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'scopeId',
  'artifactType',
  'label',
  'storagePath',
  'mimeType',
  'sizeBytes',
  'hash',
  'meta',
] as const satisfies readonly (keyof IbmArtifact)[]

type _VerifyKeys = EnsureAllKeys<IbmArtifact, typeof ibmArtifactKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmArtifactMlgKeys = DotNestedMlgKeys<IbmArtifact>

export const bmArtifactMlgFields = mlgFieldsOf<IbmArtifact>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmArtifact, typeof bmArtifactMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
