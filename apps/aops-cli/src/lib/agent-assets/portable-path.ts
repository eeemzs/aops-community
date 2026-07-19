import { portableCaseFoldUnicode15_1 } from './unicode-case-folding-v15-1.generated.js'

export const MAX_PACKAGE_PATH_CODE_POINTS = 4096
export const MAX_PACKAGE_SEGMENT_UTF8_BYTES = 255

export type PortablePathIssueCode =
  | 'empty_path'
  | 'path_too_long'
  | 'absolute_path'
  | 'backslash'
  | 'empty_segment'
  | 'dot_segment'
  | 'control_character'
  | 'windows_invalid_character'
  | 'alternate_data_stream'
  | 'trailing_dot_or_space'
  | 'windows_device_alias'
  | 'segment_too_long'

export interface PortablePathIssue {
  readonly code: PortablePathIssueCode
  readonly segmentIndex?: number
}

export type PortablePathResult =
  | { readonly ok: true; readonly normalizedPath: string }
  | { readonly ok: false; readonly issues: readonly PortablePathIssue[] }

const WINDOWS_INVALID_SEGMENT_CHARACTERS = new Set(['<', '>', ':', '"', '\\', '|', '?', '*'])
const WINDOWS_DEVICE_ALIAS = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM[0-9¹²³]|LPT[0-9¹²³])(?:\..*)?$/

function asciiUpper(value: string): string {
  let result = ''
  for (const character of value) {
    const codePoint = character.codePointAt(0)!
    result += codePoint >= 0x61 && codePoint <= 0x7a
      ? String.fromCodePoint(codePoint - 0x20)
      : character
  }
  return result
}

function isControl(codePoint: number): boolean {
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
}

export function validatePortablePackagePath(value: string): PortablePathResult {
  const issues: PortablePathIssue[] = []
  if (value.length === 0) issues.push({ code: 'empty_path' })
  if ([...value].length > MAX_PACKAGE_PATH_CODE_POINTS) issues.push({ code: 'path_too_long' })
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) issues.push({ code: 'absolute_path' })
  if (value.includes('\\')) issues.push({ code: 'backslash' })

  const segments = value.split('/')
  for (const [segmentIndex, segment] of segments.entries()) {
    if (segment.length === 0) {
      issues.push({ code: 'empty_segment', segmentIndex })
      continue
    }
    if (segment === '.' || segment === '..') issues.push({ code: 'dot_segment', segmentIndex })
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      issues.push({ code: 'trailing_dot_or_space', segmentIndex })
    }
    if (Buffer.byteLength(segment.normalize('NFC'), 'utf8') > MAX_PACKAGE_SEGMENT_UTF8_BYTES) {
      issues.push({ code: 'segment_too_long', segmentIndex })
    }
    if (WINDOWS_DEVICE_ALIAS.test(asciiUpper(segment))) {
      issues.push({ code: 'windows_device_alias', segmentIndex })
    }

    for (const character of segment) {
      const codePoint = character.codePointAt(0)!
      if (isControl(codePoint)) issues.push({ code: 'control_character', segmentIndex })
      if (WINDOWS_INVALID_SEGMENT_CHARACTERS.has(character)) {
        issues.push({
          code: character === ':' ? 'alternate_data_stream' : 'windows_invalid_character',
          segmentIndex,
        })
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, normalizedPath: segments.map((segment) => segment.normalize('NFC')).join('/') }
}

/**
 * Frozen agent-assets-portable-case-key-v1. Input must already be a portable
 * package path; the function intentionally performs no OS or locale casing.
 */
export function portablePackageCaseKeyV1(value: string): string {
  return value
    .split('/')
    .map((segment) => portableCaseFoldUnicode15_1(segment.normalize('NFC')).normalize('NFC'))
    .join('/')
}
