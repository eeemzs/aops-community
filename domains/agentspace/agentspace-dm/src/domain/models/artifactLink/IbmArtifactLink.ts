import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { artifactLinkZodSchema, artifactLinkZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmArtifactLink = z.infer<typeof artifactLinkZodSchema>
export type IbmArtifactLinkInsert = z.infer<typeof artifactLinkZodSchemaInsert>

export const ibmArtifactLinkKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'artifactId',
  'refType',
  'refId',
  'createdBy'
] as const satisfies readonly (keyof IbmArtifactLink)[]

type _VerifyKeys = EnsureAllKeys<IbmArtifactLink, typeof ibmArtifactLinkKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmArtifactLinkMlgKeys = DotNestedMlgKeys<IbmArtifactLink>

export const bmArtifactLinkMlgFields = mlgFieldsOf<IbmArtifactLink>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmArtifactLink, typeof bmArtifactLinkMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
