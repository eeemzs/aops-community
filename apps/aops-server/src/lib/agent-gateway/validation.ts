import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv'
import type { HostRequestContext } from '@aopslab/host-core'
import type { FederatedCatalogTool, Manifest } from '@aopslab/manifest'
import { z } from 'zod'

import { extractRouteParamAliases, isRecord, normalizeDomain } from './helpers'
import type { RouteInvokeInput } from './types'
import { hasProjectAliasValue } from '$lib/server/project-alias'

type DomainSchemaCache = {
  ajv: Ajv
  validators: Map<string, ValidateFunction>
}

type ToolArgContract = {
  requiredArgs: string[]
  optionalArgs: string[]
  disallowUnknownArgs: boolean
}

const schemaCacheByDomain = new Map<string, DomainSchemaCache>()
const TOOLING_CONTEXT_INPUT_KEYS = new Set([
  'projectId',
  'scopeId',
  'tenantId',
  'locale',
  'fallbackLocale',
])

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return value
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}

function toQueryObject(query: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of query.entries()) {
    out[key] = parseMaybeJson(value)
  }
  return out
}

export function toValidationPayload(
  parsedInput: RouteInvokeInput,
  tool?: FederatedCatalogTool,
  manifests: Manifest[] = []
): unknown {
  const queryPayload = toQueryObject(parsedInput.query)
  const pathPayload = { ...parsedInput.pathParams }
  if (tool) {
    const aliases = extractRouteParamAliases(tool, manifests)
    for (const [targetArg, pathKey] of aliases.entries()) {
      const pathValue = pathPayload[pathKey]
      if (pathValue === undefined) continue
      if (pathPayload[targetArg] === undefined) {
        pathPayload[targetArg] = pathValue
      }
      if (targetArg !== pathKey) {
        delete pathPayload[pathKey]
      }
    }
  }

  if (isRecord(parsedInput.body)) {
    return {
      ...queryPayload,
      ...parsedInput.body,
      ...pathPayload,
    }
  }

  const hasQueryOrPath = Object.keys(queryPayload).length > 0 || Object.keys(pathPayload).length > 0
  if (!hasQueryOrPath) {
    // A list/read op mapped to a GET route carries no body and may carry no
    // query/path args. Treat an absent/null body as an empty object so a
    // no-required-arg op validates against {} (and an arg-required op gets a
    // precise "missing required" error) instead of a misleading "must be object".
    return parsedInput.body === undefined || parsedInput.body === null ? {} : parsedInput.body
  }

  if (parsedInput.body === undefined || parsedInput.body === null) {
    return { ...queryPayload, ...pathPayload }
  }

  return {
    ...queryPayload,
    ...pathPayload,
    body: parsedInput.body,
  }
}

function normalizeArgName(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeContractArgName(value: unknown): string {
  return normalizeArgName(value)
}

function parseArgsFromOperationNotes(
  notes: string[] | undefined,
  marker: 'required args:' | 'optional args:'
): string[] {
  if (!Array.isArray(notes)) return []
  const normalizedMarker = marker.toLowerCase()
  const out: string[] = []
  for (const rawNote of notes) {
    const note = String(rawNote ?? '').trim()
    if (!note) continue
    const lowered = note.toLowerCase()
    if (!lowered.startsWith(normalizedMarker)) continue
    const rawArgs = note.slice(normalizedMarker.length).trim()
    if (!rawArgs) continue
    for (const argRaw of rawArgs.split(',')) {
      const normalized = normalizeContractArgName(argRaw)
      if (!normalized) continue
      out.push(normalized)
    }
  }
  return [...new Set(out)]
}

function toSchemaArgContract(schema: unknown): ToolArgContract | null {
  if (!isRecord(schema)) return null
  if (schema.type !== 'object') return null
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const propertyNames = Object.keys(properties)
    .map((name) => normalizeContractArgName(name))
    .filter(Boolean)
  const requiredArgs = Array.isArray(schema.required)
    ? [...new Set(schema.required.map((value) => normalizeContractArgName(value)).filter(Boolean))]
    : []
  const optionalArgs = propertyNames.filter((name) => !requiredArgs.includes(name))
  const disallowUnknownArgs = schema.additionalProperties === false
  if (propertyNames.length === 0 && requiredArgs.length === 0) return null
  return {
    requiredArgs,
    optionalArgs,
    disallowUnknownArgs,
  }
}

function resolveOperationInputSchema(manifest: Manifest, tool: FederatedCatalogTool): unknown {
  const schemaRef = normalizeArgName(tool.inputSchemaRef)
  if (!schemaRef) return null
  const schemas = isRecord(manifest.contracts?.schemas) ? manifest.contracts.schemas : {}
  if (!isRecord(schemas)) return null
  return schemas[schemaRef] ?? null
}

function resolveToolArgContract(tool: FederatedCatalogTool, manifests: Manifest[]): ToolArgContract | null {
  const manifest = findManifestForDomain(manifests, tool.domain)
  if (!manifest) return null

  const notes = manifest.docs?.operations?.[tool.operationId]?.notes
  const notesRequiredArgs = parseArgsFromOperationNotes(notes, 'required args:')
  const notesOptionalArgs = parseArgsFromOperationNotes(notes, 'optional args:')

  const schemaContract = toSchemaArgContract(resolveOperationInputSchema(manifest, tool))
  const requiredArgs = new Set<string>([...notesRequiredArgs, ...(schemaContract?.requiredArgs ?? [])])
  const optionalArgs = new Set<string>([...notesOptionalArgs, ...(schemaContract?.optionalArgs ?? [])])
  for (const required of requiredArgs) optionalArgs.delete(required)

  const required = [...requiredArgs]
  const optional = [...optionalArgs]
  const disallowUnknownArgs =
    notesRequiredArgs.length > 0 ||
    notesOptionalArgs.length > 0 ||
    Boolean(schemaContract?.disallowUnknownArgs)

  if (required.length === 0 && optional.length === 0 && !disallowUnknownArgs) {
    return null
  }
  return {
    requiredArgs: required,
    optionalArgs: optional,
    disallowUnknownArgs,
  }
}

function hasNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return true
}

function hasRequiredArg(
  payload: Record<string, unknown>,
  context: HostRequestContext | undefined,
  argName: string
): boolean {
  if (argName === 'scopeId') {
    return (
      hasNonEmptyValue(payload.scopeId) ||
      hasProjectAliasValue(payload, context?.projectId) ||
      hasNonEmptyValue(context?.scopeId)
    )
  }
  if (argName === 'projectId') {
    return hasProjectAliasValue(payload, context?.projectId)
  }
  return hasNonEmptyValue(payload[argName])
}

function toContractValidationPayload(
  parsedInput: RouteInvokeInput,
  tool: FederatedCatalogTool,
  manifests: Manifest[],
  context: HostRequestContext | undefined
): Record<string, unknown> | null {
  const payload = toValidationPayload(parsedInput, tool, manifests)
  if (!isRecord(payload)) return null
  const merged: Record<string, unknown> = { ...payload }

  if (!hasNonEmptyValue(merged.projectId) && hasNonEmptyValue(context?.projectId)) {
    merged.projectId = String(context?.projectId)
  }
  if (!hasNonEmptyValue(merged.scopeId)) {
    const resolvedScopeId = context?.scopeId ?? context?.projectId
    if (hasNonEmptyValue(resolvedScopeId)) {
      merged.scopeId = String(resolvedScopeId)
    }
  }
  if (!hasNonEmptyValue(merged.tenantId) && hasNonEmptyValue(context?.tenantId)) {
    merged.tenantId = String(context?.tenantId)
  }
  if (!hasNonEmptyValue(merged.locale) && hasNonEmptyValue(context?.locale)) {
    merged.locale = String(context?.locale)
  }
  if (!hasNonEmptyValue(merged.fallbackLocale) && hasNonEmptyValue(context?.fallbackLocale)) {
    merged.fallbackLocale = String(context?.fallbackLocale)
  }

  return merged
}

function toContractValidationSchema(
  contract: ToolArgContract,
  operationId: string,
  context: HostRequestContext | undefined
) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const argName of contract.requiredArgs) shape[argName] = z.unknown().optional()
  for (const argName of contract.optionalArgs) shape[argName] = z.unknown().optional()
  for (const contextKey of TOOLING_CONTEXT_INPUT_KEYS) shape[contextKey] = z.unknown().optional()

  const base = contract.disallowUnknownArgs ? z.object(shape).strict() : z.object(shape).passthrough()
  return base.superRefine((payload, refineContext) => {
    for (const requiredArg of contract.requiredArgs) {
      if (hasRequiredArg(payload, context, requiredArg)) continue
      refineContext.addIssue({
        code: z.ZodIssueCode.custom,
        message: `missing_required_arg:${requiredArg};operation:${operationId}`,
        path: [requiredArg],
      })
    }
  })
}

function formatContractValidationError(
  tool: FederatedCatalogTool,
  error: z.ZodError<Record<string, unknown>>
): string {
  const firstIssue = error.issues[0]
  if (!firstIssue) return `validation_failed:${tool.operationId}`
  if (firstIssue.message.startsWith('missing_required_arg:')) return firstIssue.message
  if (firstIssue.code === 'unrecognized_keys') {
    const unknownArg =
      Array.isArray((firstIssue as z.ZodIssue & { keys?: string[] }).keys) &&
      (firstIssue as z.ZodIssue & { keys?: string[] }).keys
        ? (firstIssue as z.ZodIssue & { keys?: string[] }).keys?.[0]
        : undefined
    if (unknownArg) {
      return `unknown_input_arg:${unknownArg};operation:${tool.operationId}`
    }
  }
  return `validation_failed:${tool.operationId}`
}

export type ToolInvokeRequirementState = {
  authRequired: boolean
  principalPresent: boolean
  authSatisfied: boolean
  rolesRequired: string[]
  rolesSatisfied: boolean
  capabilitiesRequired: string[]
  capabilitiesSatisfied: boolean
  applyRequired: boolean
  applySatisfied: boolean
  confirmationRequired: boolean
  confirmationSatisfied: boolean
  scopeRequired: boolean
  scopeSatisfied: boolean
}

function resolveToolPolicyRecord(tool: FederatedCatalogTool): Record<string, unknown> | null {
  return isRecord(tool.policy) ? tool.policy : null
}

function resolveToolPolicySafety(tool: FederatedCatalogTool): Record<string, unknown> {
  const policy = resolveToolPolicyRecord(tool)
  return policy && isRecord(policy.safety) ? policy.safety : {}
}

function resolveToolPolicyContext(tool: FederatedCatalogTool): Record<string, unknown> {
  const policy = resolveToolPolicyRecord(tool)
  return policy && isRecord(policy.context) ? policy.context : {}
}

function resolveToolPolicyAuth(tool: FederatedCatalogTool): Record<string, unknown> {
  const policy = resolveToolPolicyRecord(tool)
  return policy && isRecord(policy.auth) ? policy.auth : {}
}

function toNormalizedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((entry) => normalizeArgName(entry).toLowerCase()).filter(Boolean))]
}

function resolvePrincipalRecord(context?: HostRequestContext): Record<string, unknown> | null {
  return context?.principal && isRecord(context.principal) ? context.principal : null
}

function hasAuthenticatedPrincipal(context?: HostRequestContext): boolean {
  const principal = resolvePrincipalRecord(context)
  if (!principal) return false
  const principalId = normalizeArgName(principal.id ?? principal.userId)
  return principalId.length > 0
}

function resolvePrincipalRoles(context?: HostRequestContext): Set<string> {
  return new Set(toNormalizedStringList(resolvePrincipalRecord(context)?.roles))
}

function resolvePrincipalCapabilities(context?: HostRequestContext): Set<string> {
  const principal = resolvePrincipalRecord(context)
  return new Set(toNormalizedStringList(principal?.permissions ?? principal?.capabilities))
}

function hasResolvedScopeContext(context: HostRequestContext | undefined): boolean {
  return (
    (typeof context?.scopeId === 'string' && context.scopeId.trim().length > 0) ||
    (typeof context?.projectId === 'string' && context.projectId.trim().length > 0)
  )
}

export function resolveToolInvokeRequirements(params: {
  tool: FederatedCatalogTool
  context?: HostRequestContext
  apply?: boolean
  confirm?: boolean
}): ToolInvokeRequirementState {
  const auth = resolveToolPolicyAuth(params.tool)
  const safety = resolveToolPolicySafety(params.tool)
  const contextPolicy = resolveToolPolicyContext(params.tool)
  const rolesRequired = toNormalizedStringList(auth.roles)
  const capabilitiesRequired = toNormalizedStringList(auth.capabilities)
  const principalPresent = hasAuthenticatedPrincipal(params.context)
  const principalRoles = resolvePrincipalRoles(params.context)
  const principalCapabilities = resolvePrincipalCapabilities(params.context)
  const rolesSatisfied =
    rolesRequired.length === 0 || rolesRequired.some((role) => principalRoles.has(role))
  const capabilitiesSatisfied =
    capabilitiesRequired.length === 0 ||
    principalCapabilities.has('*') ||
    capabilitiesRequired.some((capability) => principalCapabilities.has(capability))
  const authRequired = auth.required === true || rolesRequired.length > 0 || capabilitiesRequired.length > 0
  const accessGrantRequired = rolesRequired.length > 0 || capabilitiesRequired.length > 0
  const applyRequired = safety.applyRequired === true
  const confirmationRequired = safety.confirmationRequired === true
  const scopeRequired =
    contextPolicy.scopeRequired === true ||
    contextPolicy.projectRequired === true

  return {
    authRequired,
    principalPresent,
    authSatisfied:
      (!authRequired || principalPresent) &&
      (!accessGrantRequired || rolesSatisfied || capabilitiesSatisfied),
    rolesRequired,
    rolesSatisfied,
    capabilitiesRequired,
    capabilitiesSatisfied,
    applyRequired,
    applySatisfied: !applyRequired || params.apply === true,
    confirmationRequired,
    confirmationSatisfied: !confirmationRequired || params.confirm === true,
    scopeRequired,
    scopeSatisfied: !scopeRequired || hasResolvedScopeContext(params.context),
  }
}

export function validateToolInvokeSafety(params: {
  tool: FederatedCatalogTool
  apply?: boolean
  confirm?: boolean
}): { ok: true } | { ok: false; message: string } {
  const requirements = resolveToolInvokeRequirements({
    tool: params.tool,
    apply: params.apply,
    confirm: params.confirm,
  })

  if (!requirements.applySatisfied) {
    return {
      ok: false,
      message: `apply_required:${params.tool.toolId}`,
    }
  }

  if (!requirements.confirmationSatisfied) {
    return {
      ok: false,
      message: `confirmation_required:${params.tool.toolId}`,
    }
  }

  return { ok: true }
}

export function validateToolInvokeAuthorization(params: {
  tool: FederatedCatalogTool
  context?: HostRequestContext
}): { ok: true } | { ok: false; message: string } {
  const requirements = resolveToolInvokeRequirements({
    tool: params.tool,
    context: params.context,
  })
  if (requirements.authRequired && !requirements.principalPresent) {
    return {
      ok: false,
      message: 'unauthorized',
    }
  }
  if (!requirements.authSatisfied) {
    return {
      ok: false,
      message: 'forbidden',
    }
  }
  return { ok: true }
}

export function validateToolInvokeScope(params: {
  tool: FederatedCatalogTool
  context?: HostRequestContext
}): { ok: true } | { ok: false; message: string } {
  const requirements = resolveToolInvokeRequirements({
    tool: params.tool,
    context: params.context,
  })
  if (!requirements.scopeSatisfied) {
    return {
      ok: false,
      message: 'project_context_required',
    }
  }
  return { ok: true }
}

export function validateToolInputByContract(params: {
  tool: FederatedCatalogTool
  manifests: Manifest[]
  parsedInput: RouteInvokeInput
  context?: HostRequestContext
}): { ok: true } | { ok: false; message: string } {
  const contract = resolveToolArgContract(params.tool, params.manifests)
  if (!contract) return { ok: true }

  const payload = toContractValidationPayload(params.parsedInput, params.tool, params.manifests, params.context)
  if (!payload) {
    if (contract.requiredArgs.length === 0) return { ok: true }
    const firstRequired = contract.requiredArgs[0] ?? 'input'
    if (firstRequired === 'scopeId' || firstRequired === 'projectId') {
      return { ok: false, message: 'project_required' }
    }
    return {
      ok: false,
      message: `missing_required_arg:${firstRequired};operation:${params.tool.operationId}`,
    }
  }

  if (
    (contract.requiredArgs.includes('scopeId') || contract.requiredArgs.includes('projectId')) &&
    !contract.requiredArgs.every((argName) =>
      argName === 'scopeId' || argName === 'projectId' ? hasRequiredArg(payload, params.context, argName) : true
    )
  ) {
    return { ok: false, message: 'project_required' }
  }

  const parsed = toContractValidationSchema(contract, params.tool.operationId, params.context).safeParse(payload)
  if (parsed.success) return { ok: true }
  return {
    ok: false,
    message: formatContractValidationError(params.tool, parsed.error),
  }
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'invalid_input'
  const first = errors[0]
  const path = first.instancePath && first.instancePath.length > 0 ? first.instancePath : '/'
  const message = first.message ?? first.keyword
  return `${path} ${message}`.trim()
}

function findManifestForDomain(manifests: Manifest[], domain: string): Manifest | null {
  return manifests.find((manifest) => normalizeDomain(manifest.domain.id) === normalizeDomain(domain)) ?? null
}

function buildDomainSchemaCache(domain: string, manifest: Manifest): DomainSchemaCache {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    coerceTypes: false,
    allowUnionTypes: true,
  })

  const schemas = isRecord(manifest.contracts?.schemas) ? manifest.contracts?.schemas : {}
  for (const [schemaRef, schema] of Object.entries(schemas ?? {})) {
    if (!schemaRef.trim()) continue
    if (!isRecord(schema)) continue
    ajv.addSchema(schema as AnySchema, `${domain}:${schemaRef.trim()}`)
  }

  const cache: DomainSchemaCache = {
    ajv,
    validators: new Map(),
  }
  schemaCacheByDomain.set(domain, cache)
  return cache
}

function getDomainSchemaCache(domain: string, manifests: Manifest[]): DomainSchemaCache | null {
  const normalizedDomain = normalizeDomain(domain)
  if (!normalizedDomain) return null
  const existing = schemaCacheByDomain.get(normalizedDomain)
  if (existing) return existing
  const manifest = findManifestForDomain(manifests, normalizedDomain)
  if (!manifest) return null
  return buildDomainSchemaCache(normalizedDomain, manifest)
}

export function resetToolSchemaValidationCache(domain?: string): void {
  const normalizedDomain = normalizeDomain(domain ?? '')
  if (normalizedDomain) {
    schemaCacheByDomain.delete(normalizedDomain)
    return
  }
  schemaCacheByDomain.clear()
}

function resolveInputValidator(
  tool: FederatedCatalogTool,
  manifests: Manifest[],
): { validate: ValidateFunction; schemaId: string } | null {
  const schemaRef = typeof tool.inputSchemaRef === 'string' ? tool.inputSchemaRef.trim() : ''
  if (!schemaRef) return null
  const domain = normalizeDomain(tool.domain)
  const cache = getDomainSchemaCache(domain, manifests)
  if (!cache) return null
  const schemaId = `${domain}:${schemaRef}`
  const existing = cache.validators.get(schemaId)
  if (existing) return { validate: existing, schemaId }

  const validate = cache.ajv.getSchema(schemaId)
  if (!validate) return null
  cache.validators.set(schemaId, validate)
  return { validate, schemaId }
}

export function validateToolInputBySchema(params: {
  tool: FederatedCatalogTool
  manifests: Manifest[]
  parsedInput: RouteInvokeInput
}): { ok: true } | { ok: false; message: string } {
  const validator = resolveInputValidator(params.tool, params.manifests)
  if (!validator) return { ok: true }

  const payload = toValidationPayload(params.parsedInput, params.tool, params.manifests)
  const valid = validator.validate(payload)
  if (valid) return { ok: true }

  const detail = formatSchemaErrors(validator.validate.errors)
  return {
    ok: false,
    message: `tool_input_schema_invalid:${params.tool.toolId}:${detail}`,
  }
}
