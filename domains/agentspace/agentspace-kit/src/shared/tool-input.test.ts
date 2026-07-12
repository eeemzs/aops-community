import { describe, expect, it } from 'vitest'

import {
  hasNonEmptyValue,
  isProjectContextArgName,
  normalizeNonEmpty,
  resolveProjectContextValue,
  resolveScopeContextValue,
  toMissingRequiredArgToken,
  toRecord,
} from './tool-input.js'

describe('tool-input shared helper', () => {
  it('toRecord returns empty record for non-object values', () => {
    expect(toRecord(undefined)).toEqual({})
    expect(toRecord(null)).toEqual({})
    expect(toRecord('text')).toEqual({})
    expect(toRecord([1, 2, 3])).toEqual({})
  })

  it('resolveProjectContextValue uses project alias precedence', () => {
    expect(resolveProjectContextValue({ projectId: 'project-1' })).toBe('project-1')
    expect(resolveProjectContextValue({ scopeId: 'project-2' })).toBe('project-2')
    expect(resolveProjectContextValue({ projectId: 'project-1', scopeId: 'project-2' })).toBe('project-1')
  })

  it('resolveScopeContextValue uses scope alias precedence', () => {
    expect(resolveScopeContextValue({ projectId: 'project-1' })).toBe('project-1')
    expect(resolveScopeContextValue({ scopeId: 'scope-2' })).toBe('scope-2')
    expect(resolveScopeContextValue({ projectId: 'project-1', scopeId: 'scope-2' })).toBe('scope-2')
  })

  it('normalizes required token for project-scoped args', () => {
    expect(isProjectContextArgName('projectId')).toBe(true)
    expect(isProjectContextArgName('data.projectId')).toBe(true)
    expect(isProjectContextArgName('scopeId')).toBe(true)
    expect(isProjectContextArgName('data.scopeId')).toBe(true)

    expect(toMissingRequiredArgToken('projectId')).toBe('project_context_required')
    expect(toMissingRequiredArgToken('data.projectId')).toBe('project_context_required')
    expect(toMissingRequiredArgToken('scopeId')).toBe('project_context_required')
    expect(toMissingRequiredArgToken('customArg')).toBe('missing_required_arg:customArg')
  })

  it('normalizes and checks non-empty values consistently', () => {
    expect(normalizeNonEmpty('  text  ')).toBe('text')
    expect(normalizeNonEmpty('   ')).toBeUndefined()
    expect(normalizeNonEmpty(42)).toBeUndefined()

    expect(hasNonEmptyValue('text')).toBe(true)
    expect(hasNonEmptyValue('   ')).toBe(false)
    expect(hasNonEmptyValue(['x'])).toBe(true)
    expect(hasNonEmptyValue([])).toBe(false)
    expect(hasNonEmptyValue({ a: 1 })).toBe(true)
    expect(hasNonEmptyValue({})).toBe(false)
  })
})
