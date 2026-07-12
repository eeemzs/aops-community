import {
  parseDocmanAssetReference,
  resolveDocmanPageSourceFormat,
} from '@aopslab/domain-core-docman'

export const DOCMAN_COMPOSE_SOURCE_FORMATS = ['md', 'mdx'] as const

export type DocmanComposeSourceFormat = (typeof DOCMAN_COMPOSE_SOURCE_FORMATS)[number]

export type ParsedDocmanAssetReferenceToken = {
  token: string
  ref: string
  version: number | null
}

export type DocmanComposeSourceContentParts = {
  modulePreamble?: string
  body: string
}

const DOCMAN_ASSET_REFERENCE_TOKEN_RE = /(asset:\/\/[A-Za-z0-9][A-Za-z0-9._:-]*(?:@[0-9]+)?)/g
const MDX_MODULE_LINE_RE = /^\s*(?:import|export)\b/

type MarkdownRange = {
  start: number
  end: number
}

export function isDocmanComposeSourceFormat(value: unknown): value is DocmanComposeSourceFormat {
  return value === 'md' || value === 'mdx'
}

export function resolveDocmanComposeSourceFormat(value: unknown): DocmanComposeSourceFormat | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  const sourceFormat = resolveDocmanPageSourceFormat(normalized)
  if (normalized !== sourceFormat) return null
  return isDocmanComposeSourceFormat(sourceFormat) ? sourceFormat : null
}

export function reduceDocmanComposeFormats(
  values: Iterable<unknown>,
): { format: DocmanComposeSourceFormat; formats: DocmanComposeSourceFormat[] } {
  const seen = new Set<DocmanComposeSourceFormat>()
  for (const value of values) {
    const format = resolveDocmanComposeSourceFormat(value)
    if (format) seen.add(format)
  }

  const formats = [...seen].sort((left, right) => left.localeCompare(right)) as DocmanComposeSourceFormat[]
  return {
    format: formats.includes('mdx') ? 'mdx' : 'md',
    formats: formats.length > 0 ? formats : ['md'],
  }
}

export function listDocmanAssetReferenceTokens(content: string): ParsedDocmanAssetReferenceToken[] {
  const text = String(content ?? '')
  if (!text) return []

  const byToken = new Map<string, ParsedDocmanAssetReferenceToken>()
  forEachDocmanAssetReferenceTokenOutsideMarkdownCode(text, (token) => {
    if (!token || byToken.has(token)) return
    const parsed = parseDocmanAssetReferenceToken(token)
    if (!parsed) return
    byToken.set(token, parsed)
  })

  return [...byToken.values()]
}

export function replaceDocmanAssetReferenceTokens(
  content: string,
  resolver: (token: ParsedDocmanAssetReferenceToken) => string,
): string {
  const text = String(content ?? '')
  if (!text) return text

  return mapDocmanAssetReferenceTokensOutsideMarkdownCode(text, (token) => {
    const parsed = parseDocmanAssetReferenceToken(token)
    if (!parsed) return token
    return resolver(parsed)
  })
}

export function normalizeDocmanComposeSourceContent(
  format: DocmanComposeSourceFormat,
  content: string,
): string {
  const text = String(content ?? '')
  if (format !== 'mdx' || !text) return text

  return text
}

export function splitDocmanComposeSourceContent(
  format: DocmanComposeSourceFormat,
  content: string,
): DocmanComposeSourceContentParts {
  const text = String(content ?? '')
  if (format !== 'mdx' || !text) {
    return { body: text }
  }

  const lines = text.split(/\r?\n/)
  let index = 0
  const moduleLines: string[] = []

  while (index < lines.length) {
    const current = String(lines[index] ?? '')
    if (!current.trim()) {
      if (moduleLines.length > 0 && moduleLines[moduleLines.length - 1] !== '') {
        moduleLines.push('')
      }
      index += 1
      continue
    }
    if (!MDX_MODULE_LINE_RE.test(current)) {
      break
    }

    const statementStart = index
    index += 1
    while (index < lines.length) {
      const statementLine = String(lines[index - 1] ?? '').trim()
      if (!statementLine || statementLine.endsWith(';')) break
      const nextLine = String(lines[index] ?? '')
      index += 1
      if (!nextLine.trim()) break
      if (String(nextLine).trim().endsWith(';')) break
    }

    moduleLines.push(...lines.slice(statementStart, index))

    while (index < lines.length && !String(lines[index] ?? '').trim()) {
      if (moduleLines[moduleLines.length - 1] !== '') {
        moduleLines.push('')
      }
      index += 1
    }
  }

  const modulePreamble = moduleLines.join('\n').trim()
  return {
    modulePreamble: modulePreamble || undefined,
    body: lines.slice(index).join('\n').trimStart(),
  }
}

function parseDocmanAssetReferenceToken(token: string): ParsedDocmanAssetReferenceToken | null {
  const normalized = String(token ?? '').trim()
  const parsed = parseDocmanAssetReference(normalized)
  if (!parsed) return null
  return {
    token: normalized,
    ref: parsed.assetUid,
    version: Number.isInteger(parsed.version) && Number(parsed.version) > 0 ? Number(parsed.version) : null,
  }
}

function forEachDocmanAssetReferenceTokenOutsideMarkdownCode(
  text: string,
  visitor: (token: string) => void,
): void {
  for (const segment of listDocmanTextSegmentsOutsideMarkdownCode(text)) {
    const matches = segment.matchAll(DOCMAN_ASSET_REFERENCE_TOKEN_RE)
    for (const match of matches) {
      const token = String(match[1] ?? '').trim()
      if (token) visitor(token)
    }
  }
}

function mapDocmanAssetReferenceTokensOutsideMarkdownCode(
  text: string,
  mapper: (token: string) => string,
): string {
  const ranges = listMarkdownCodeRanges(text)
  if (ranges.length === 0) {
    return text.replace(DOCMAN_ASSET_REFERENCE_TOKEN_RE, (token) => mapper(token))
  }

  let cursor = 0
  let next = ''
  for (const range of ranges) {
    if (cursor < range.start) {
      next += text.slice(cursor, range.start).replace(DOCMAN_ASSET_REFERENCE_TOKEN_RE, (token) => mapper(token))
    }
    next += text.slice(range.start, range.end)
    cursor = range.end
  }
  if (cursor < text.length) {
    next += text.slice(cursor).replace(DOCMAN_ASSET_REFERENCE_TOKEN_RE, (token) => mapper(token))
  }
  return next
}

function listDocmanTextSegmentsOutsideMarkdownCode(text: string): string[] {
  const ranges = listMarkdownCodeRanges(text)
  if (ranges.length === 0) return [text]

  const segments: string[] = []
  let cursor = 0
  for (const range of ranges) {
    if (cursor < range.start) {
      segments.push(text.slice(cursor, range.start))
    }
    cursor = range.end
  }
  if (cursor < text.length) {
    segments.push(text.slice(cursor))
  }
  return segments
}

function listMarkdownCodeRanges(text: string): MarkdownRange[] {
  if (!text) return []

  const ranges: MarkdownRange[] = []
  const length = text.length

  let index = 0
  let fencedStart = -1
  let fencedMarker = ''
  let inlineStart = -1
  let inlineTicks = 0

  while (index < length) {
    if (fencedStart >= 0) {
      if (isLineStart(text, index)) {
        const fence = readFenceMarkerAt(text, index)
        if (fence && fence.marker[0] === fencedMarker[0] && fence.marker.length >= fencedMarker.length) {
          const lineEnd = readLineEnd(text, index)
          ranges.push({ start: fencedStart, end: lineEnd })
          fencedStart = -1
          fencedMarker = ''
          index = lineEnd
          continue
        }
      }
      index += 1
      continue
    }

    if (inlineStart >= 0) {
      const tickCount = readBacktickRunLength(text, index)
      if (tickCount === inlineTicks) {
        ranges.push({ start: inlineStart, end: index + tickCount })
        inlineStart = -1
        inlineTicks = 0
        index += tickCount
        continue
      }
      index += 1
      continue
    }

    if (isLineStart(text, index)) {
      const fence = readFenceMarkerAt(text, index)
      if (fence) {
        fencedStart = index
        fencedMarker = fence.marker
        index = fence.contentStart
        continue
      }
    }

    const tickCount = readBacktickRunLength(text, index)
    if (tickCount > 0) {
      inlineStart = index
      inlineTicks = tickCount
      index += tickCount
      continue
    }

    index += 1
  }

  if (inlineStart >= 0) {
    ranges.push({ start: inlineStart, end: length })
  }
  if (fencedStart >= 0) {
    ranges.push({ start: fencedStart, end: length })
  }

  return ranges
}

function isLineStart(text: string, index: number): boolean {
  return index <= 0 || text[index - 1] === '\n'
}

function readLineEnd(text: string, index: number): number {
  const newlineIndex = text.indexOf('\n', index)
  return newlineIndex >= 0 ? newlineIndex + 1 : text.length
}

function readBacktickRunLength(text: string, index: number): number {
  if (text[index] !== '`') return 0
  let cursor = index
  while (cursor < text.length && text[cursor] === '`') {
    cursor += 1
  }
  return cursor - index
}

function readFenceMarkerAt(text: string, index: number): { marker: string; contentStart: number } | null {
  let cursor = index
  let indentation = 0
  while (cursor < text.length && indentation < 4 && (text[cursor] === ' ' || text[cursor] === '\t')) {
    cursor += 1
    indentation += 1
  }

  const fenceChar = text[cursor]
  if (fenceChar !== '`' && fenceChar !== '~') return null

  let markerEnd = cursor
  while (markerEnd < text.length && text[markerEnd] === fenceChar) {
    markerEnd += 1
  }

  const marker = text.slice(cursor, markerEnd)
  if (marker.length < 3) return null

  return { marker, contentStart: markerEnd }
}

const LEADING_NUMERIC_PREFIX_PATTERN = /^\s*\d+(?:\.\d+)*[.)]?\s+/

/**
 * Strip a stored title's legacy heading prefix when the renderer is about to
 * prepend a freshly computed outline number. Mirrors the desktop UI helper
 * `formatDocmanDisplayTitle` (apps/aops-desktop/src/pages/docman/lib/docman-display-title.ts):
 * returns the raw title untouched when there is no computed number, when the
 * computed number stringifies to '0', when the title is empty, or when
 * stripping would leave an empty string.
 */
export function stripLeadingNumericPrefixForRender(
  title: unknown,
  computedNumber: unknown,
): string {
  const rawTitle = String(title ?? '').trim()
  if (!rawTitle) return rawTitle
  const number = String(computedNumber ?? '').trim()
  if (!number || number === '0') return rawTitle
  const stripped = rawTitle.replace(LEADING_NUMERIC_PREFIX_PATTERN, '').trim()
  return stripped || rawTitle
}
