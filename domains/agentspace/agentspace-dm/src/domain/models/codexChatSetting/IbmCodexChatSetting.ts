import z from 'zod'
import { EnsureAllKeys } from '@aopslab/xf-core'
import { DotNestedMlgKeys, EnsureExactMlgKeys, mlgFieldsOf } from '@aopslab/xf-bm'
import { codexChatSettingZodSchema, codexChatSettingZodSchemaInsert } from './zod.schema.js'

/* Zod-based types */
export type IbmCodexChatSetting = z.infer<typeof codexChatSettingZodSchema>
export type IbmCodexChatSettingInsert = z.infer<typeof codexChatSettingZodSchemaInsert>

export const ibmCodexChatSettingKeys = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'projectId',
  'userId',
  'binaryPath',
  'model',
  'modelProvider',
  'reasoningEffort',
  'profile',
  'serviceTier',
  'personality',
  'approvalsReviewer',
  'executionMode',
  'sandboxMode',
  'manualCwd',
  'autoStart',
  'persistExtendedHistory',
  'experimentalApi',
  'optOutNotificationMethods',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof IbmCodexChatSetting)[]

type _VerifyKeys = EnsureAllKeys<IbmCodexChatSetting, typeof ibmCodexChatSettingKeys>
const _verifyKeys: _VerifyKeys = true
void _verifyKeys

export type BmCodexChatSettingMlgKeys = DotNestedMlgKeys<IbmCodexChatSetting>

export const bmCodexChatSettingMlgFields = mlgFieldsOf<IbmCodexChatSetting>()()

// Compile-time check: ensure bm fields cover exact MLG paths
type _VerifyMlgFields = EnsureExactMlgKeys<IbmCodexChatSetting, typeof bmCodexChatSettingMlgFields>
const _verifyMlgFields: _VerifyMlgFields = true
void _verifyMlgFields
