import { Ajv, type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv'

import { normalizeAgentspaceOperationInputForCompatibility } from '../shared/codex-chat-input.js'
import {
  hasNonEmptyValue,
  resolveProjectContextValue,
  resolveScopeContextValue,
  toMissingRequiredArgToken,
  toRecord,
} from '../shared/tool-input.js'
import { listAgentspaceOperationSpecs } from './catalog.js'
import { getAgentspaceContractSchema, getAgentspaceOperationIoSchemaRefs } from './schemas.js'
import type { AgentspaceOperationInput, AgentspaceTypedOperationId } from './io-types.js'

type FlattenEnvelopeKey<TInput, TKey extends string> =
  TInput extends Record<TKey, infer TInner>
    ? TInner extends Record<string, unknown>
      ? Omit<TInput, TKey> & TInner
      : TInput
    : TInput

type FlattenToolingEnvelopeInput<TInput> = FlattenEnvelopeKey<
  FlattenEnvelopeKey<FlattenEnvelopeKey<TInput, 'data'>, 'patch'>,
  'input'
>

export type AgentspaceToolInput<TId extends AgentspaceTypedOperationId> =
  FlattenToolingEnvelopeInput<AgentspaceOperationInput<TId>>

type AgentspaceRequiredArg = ReadonlyArray<{ name: string; optional: boolean }>

const AGENTSPACE_CONTEXT_KEYS = new Set([
  'tenantId',
  'projectId',
  'scopeId',
  'scopeResolution',
  'locale',
  'fallbackLocale',
  '__hostContext',
])

const DEFAULT_PROJECT_READ_SCOPE_TAG = 'scope:default-project-read'
const PROJECT_CREATE_OPERATION_ID = 'project.create'
const EXPLICIT_GLOBAL_FILTER_KEYS = new Set([
  'all',
  'allProjects',
  'global',
  'tenantWide',
  'unscoped',
])

const AGENTSPACE_OPERATION_SPECS_BY_ID = new Map(
  listAgentspaceOperationSpecs({ refresh: true }).map((operation) => [
    operation.operationId as AgentspaceTypedOperationId,
    operation,
  ]),
)

const AGENTSPACE_OPERATION_ARGS_BY_ID = new Map<AgentspaceTypedOperationId, AgentspaceRequiredArg>(
  [...AGENTSPACE_OPERATION_SPECS_BY_ID.values()].map((operation) => [
    operation.operationId as AgentspaceTypedOperationId,
    operation.args,
  ]),
)

const inputSchemaValidatorAjv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
  allowUnionTypes: true,
})

const inputValidatorByOperationId = new Map<AgentspaceTypedOperationId, ValidateFunction>()
const projectContextRequirementByOperationId = new Map<
  AgentspaceTypedOperationId,
  { projectId: boolean; scopeId: boolean }
>()

function resolveProjectValue(input: Record<string, unknown>): string | undefined {
  return resolveProjectContextValue(input) ?? resolveProjectContextValue(toRecord(input.__hostContext))
}

function resolveScopeValue(input: Record<string, unknown>): string | undefined {
  return resolveScopeContextValue(input) ?? resolveScopeContextValue(toRecord(input.__hostContext))
}

function resolveScopeResolutionValue(input: Record<string, unknown>): 'explicit' | 'cascade' | undefined {
  const value = String(input.scopeResolution ?? toRecord(input.__hostContext).scopeResolution ?? '').trim()
  return value === 'explicit' || value === 'cascade' ? value : undefined
}

function resolvePrincipalUserId(input: Record<string, unknown>): string | undefined {
  const principal = toRecord(toRecord(input.__hostContext).principal)
  return hasNonEmptyValue(principal.userId)
    ? String(principal.userId).trim()
    : hasNonEmptyValue(principal.id)
      ? String(principal.id).trim()
      : undefined
}

function isScopeableDefaultProjectReadOperation(operationId: AgentspaceTypedOperationId): boolean {
  const operation = AGENTSPACE_OPERATION_SPECS_BY_ID.get(operationId)
  return operation?.tags?.includes(DEFAULT_PROJECT_READ_SCOPE_TAG) === true
}

function hasMeaningfulExplicitValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  return hasNonEmptyValue(value)
}

function hasExplicitGlobalFilterIntent(filter: Record<string, unknown>): boolean {
  for (const key of EXPLICIT_GLOBAL_FILTER_KEYS) {
    if (hasMeaningfulExplicitValue(filter[key])) return true
  }
  return false
}

function hasExplicitScopeFilter(filter: Record<string, unknown>): boolean {
  return (
    hasMeaningfulExplicitValue(filter.scopeId) ||
    hasMeaningfulExplicitValue(filter.projectId) ||
    hasMeaningfulExplicitValue(filter.scopeResolution) ||
    hasExplicitGlobalFilterIntent(filter)
  )
}

function injectProjectScopeIntoDefaultReadFilter(
  operationId: AgentspaceTypedOperationId,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (!isScopeableDefaultProjectReadOperation(operationId)) return input

  const hasFilter = Object.prototype.hasOwnProperty.call(input, 'filter')
  if (hasFilter && (!input.filter || typeof input.filter !== 'object' || Array.isArray(input.filter))) {
    return input
  }

  const scopeId = resolveScopeValue(input)
  if (!scopeId) return input

  const filter = toRecord(input.filter)
  if (hasExplicitScopeFilter(filter)) return input

  return {
    ...input,
    filter: {
      ...filter,
      scopeId,
      scopeResolution: resolveScopeResolutionValue(input) ?? 'explicit',
    },
  }
}

function injectProjectCreateOwnerDefaults(
  operationId: AgentspaceTypedOperationId,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (operationId !== PROJECT_CREATE_OPERATION_ID) return input
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) return input

  const principalUserId = resolvePrincipalUserId(input)
  if (!principalUserId) return input

  const data = input.data as Record<string, unknown>
  const defaults = {
    ...(!hasNonEmptyValue(data.ownerId) ? { ownerId: principalUserId } : {}),
    ...(!hasNonEmptyValue(data.createdBy) ? { createdBy: principalUserId } : {}),
    ...(!hasNonEmptyValue(data.updatedBy) ? { updatedBy: principalUserId } : {}),
  }
  if (Object.keys(defaults).length === 0) return input

  return {
    ...input,
    data: {
      ...data,
      ...defaults,
    },
  }
}

function resolveRequiredProjectContextFieldsInDataArg(
  operationId: AgentspaceTypedOperationId,
): { projectId: boolean; scopeId: boolean } {
  const existing = projectContextRequirementByOperationId.get(operationId)
  if (existing) return existing

  const refs = getAgentspaceOperationIoSchemaRefs(operationId)
  const schema = getAgentspaceContractSchema(refs.inputRef)
  const root = toRecord(schema)
  const properties = toRecord(root.properties)
  const dataSchema = toRecord(properties.data)
  const required = Array.isArray(dataSchema.required) ? dataSchema.required : []
  const requirement = {
    projectId: required.some((field: unknown) => String(field ?? '').trim() === 'projectId'),
    scopeId: required.some((field: unknown) => String(field ?? '').trim() === 'scopeId'),
  }
  projectContextRequirementByOperationId.set(operationId, requirement)
  return requirement
}

function resolveEnvelopeArgName(args: AgentspaceRequiredArg): 'data' | 'patch' | 'input' | null {
  const argNames = new Set(args.map((arg) => arg.name))
  if (argNames.has('data')) return 'data'
  if (argNames.has('patch')) return 'patch'
  if (argNames.has('input')) return 'input'
  return null
}

function normalizeEnvelopeInput(
  input: Record<string, unknown>,
  args: AgentspaceRequiredArg,
): Record<string, unknown> {
  const envelopeArgName = resolveEnvelopeArgName(args)
  if (!envelopeArgName) return input
  if (Object.prototype.hasOwnProperty.call(input, envelopeArgName)) return input

  const allowedArgNames = new Set(args.map((arg) => arg.name))
  const passthroughKeys = new Set<string>()
  const envelopePayload: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (AGENTSPACE_CONTEXT_KEYS.has(key) || allowedArgNames.has(key)) {
      passthroughKeys.add(key)
      continue
    }
    envelopePayload[key] = value
  }

  if (Object.keys(envelopePayload).length === 0) return input

  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!passthroughKeys.has(key)) continue
    normalized[key] = value
  }
  normalized[envelopeArgName] = envelopePayload
  return normalized
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'invalid_input'
  const first = errors[0]
  const path = first.instancePath && first.instancePath.length > 0 ? first.instancePath : '/'
  const message = first.message ?? first.keyword
  return `${path} ${message}`.trim()
}

function resolveInputValidator(operationId: AgentspaceTypedOperationId): ValidateFunction | null {
  const existing = inputValidatorByOperationId.get(operationId)
  if (existing) return existing

  const refs = getAgentspaceOperationIoSchemaRefs(operationId)
  const schema = getAgentspaceContractSchema(refs.inputRef)
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null

  const validator = inputSchemaValidatorAjv.compile(schema as AnySchema)
  inputValidatorByOperationId.set(operationId, validator)
  return validator
}

function validateInputBySchema(
  operationId: AgentspaceTypedOperationId,
  input: Record<string, unknown>,
): void {
  const validator = resolveInputValidator(operationId)
  if (!validator) return
  const valid = validator(input)
  if (valid) return
  const detail = formatSchemaErrors(validator.errors)
  throw new Error(`tool_input_schema_invalid:agentspace.${operationId}:${detail}`)
}

function injectProjectContextIntoDataArg(
  operationId: AgentspaceTypedOperationId,
  input: Record<string, unknown>,
  argName: string,
  rawValue: unknown,
): unknown {
  if (argName !== 'data') return rawValue

  const requirement = resolveRequiredProjectContextFieldsInDataArg(operationId)
  if (!requirement.projectId && !requirement.scopeId) return rawValue

  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    const missingField = requirement.projectId ? 'data.projectId' : 'data.scopeId'
    throw new Error(toMissingRequiredArgToken(missingField))
  }

  const data = rawValue as Record<string, unknown>
  const missingProjectId = requirement.projectId && !hasNonEmptyValue(data.projectId)
  const missingScopeId = requirement.scopeId && !hasNonEmptyValue(data.scopeId)
  if (!missingProjectId && !missingScopeId) return rawValue

  const projectContextValue = resolveProjectValue(input)
  if (!projectContextValue) {
    const missingField = missingProjectId ? 'data.projectId' : 'data.scopeId'
    throw new Error(toMissingRequiredArgToken(missingField))
  }

  return {
    ...data,
    ...(missingProjectId ? { projectId: projectContextValue } : {}),
    ...(missingScopeId ? { scopeId: projectContextValue } : {}),
  }
}

function hasRequiredOperationArg(input: Record<string, unknown>, argName: string): boolean {
  if (argName === 'projectId' || argName === 'scopeId') {
    return hasNonEmptyValue(resolveProjectValue(input))
  }
  return hasNonEmptyValue(input[argName])
}

function assignTypedValue<TInput>(
  target: Partial<TInput>,
  key: string,
  value: unknown,
): void {
  ;(target as Record<string, unknown>)[key] = value
}

export function getAgentspaceOperationArgs<TId extends AgentspaceTypedOperationId>(
  operationId: TId,
): AgentspaceRequiredArg {
  return AGENTSPACE_OPERATION_ARGS_BY_ID.get(operationId) ?? []
}

export function parseAgentspaceToolInput<TId extends AgentspaceTypedOperationId>(
  operationId: TId,
  input: AgentspaceToolInput<TId> | AgentspaceOperationInput<TId> | unknown,
): AgentspaceOperationInput<TId> {
  const args = AGENTSPACE_OPERATION_ARGS_BY_ID.get(operationId)
  if (!args) {
    throw new Error(`unknown_agentspace_operation:${operationId}`)
  }

  const normalizedEnvelopeInput = normalizeEnvelopeInput(toRecord(input), args)
  const normalizedInput = normalizeAgentspaceOperationInputForCompatibility(
    operationId,
    normalizedEnvelopeInput,
  )
  const scopedInput = injectProjectScopeIntoDefaultReadFilter(operationId, normalizedInput)
  const defaultedInput = injectProjectCreateOwnerDefaults(operationId, scopedInput)
  const allowedOperationArgs = new Set(args.map((arg) => arg.name))

  for (const key of Object.keys(defaultedInput)) {
    if (allowedOperationArgs.has(key)) continue
    if (AGENTSPACE_CONTEXT_KEYS.has(key)) continue
    throw new Error(`unknown_input_arg:${key}`)
  }

  const typed: Partial<AgentspaceOperationInput<TId>> = {}
  for (const arg of args) {
    const rawValue =
      arg.name === 'projectId' || arg.name === 'scopeId'
        ? resolveProjectValue(defaultedInput)
        : defaultedInput[arg.name]
    const normalizedRawValue = injectProjectContextIntoDataArg(
      operationId,
      defaultedInput,
      arg.name,
      rawValue,
    )
    if (!arg.optional && !hasRequiredOperationArg(defaultedInput, arg.name)) {
      throw new Error(toMissingRequiredArgToken(arg.name))
    }
    if (normalizedRawValue !== undefined) {
      assignTypedValue<AgentspaceOperationInput<TId>>(typed, arg.name, normalizedRawValue)
    }
  }

  validateInputBySchema(operationId, typed as Record<string, unknown>)
  return typed as AgentspaceOperationInput<TId>
}
