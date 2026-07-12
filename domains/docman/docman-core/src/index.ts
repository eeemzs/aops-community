export const DOCMAN_CORE_ID = 'docman' as const

export const DOCMAN_DEFAULT_PAGE_SOURCE_FORMAT = 'md' as const
export const DOCMAN_ASSET_REFERENCE_SCHEME = 'asset://' as const

export const DOCMAN_PAGE_SOURCE_FORMATS = [
  'md',
  'mdx',
] as const

export type DocmanPageSourceFormat = (typeof DOCMAN_PAGE_SOURCE_FORMATS)[number]
export type DocmanPageSourceFormatReadiness = 'stable'
export type DocmanAssetReference = {
  assetUid: string
  version?: number
}

export type DocmanPageSourceFormatCapability = {
  id: DocmanPageSourceFormat
  label: string
  readiness: DocmanPageSourceFormatReadiness
  readinessLabel: string
  note: string
}

const DOCMAN_PAGE_SOURCE_FORMAT_CAPABILITIES: Record<
  DocmanPageSourceFormat,
  DocmanPageSourceFormatCapability
> = {
  md: {
    id: 'md',
    label: 'Markdown',
    readiness: 'stable',
    readinessLabel: 'Stable',
    note: 'Native compose/render/edit flow is available today.',
  },
  mdx: {
    id: 'mdx',
    label: 'MDX',
    readiness: 'stable',
    readinessLabel: 'Stable',
    note: 'Native source compose supports MDX. Editor stays source-first and does not live-run JSX.',
  },
}

export function listDocmanPageSourceFormats(): DocmanPageSourceFormat[] {
  return [...DOCMAN_PAGE_SOURCE_FORMATS]
}

export function resolveDocmanPageSourceFormat(value: unknown): DocmanPageSourceFormat {
  if (typeof value !== 'string') return DOCMAN_DEFAULT_PAGE_SOURCE_FORMAT
  const normalized = value.trim().toLowerCase()
  if (!normalized) return DOCMAN_DEFAULT_PAGE_SOURCE_FORMAT
  return (DOCMAN_PAGE_SOURCE_FORMATS as readonly string[]).includes(normalized)
    ? (normalized as DocmanPageSourceFormat)
    : DOCMAN_DEFAULT_PAGE_SOURCE_FORMAT
}

export function getDocmanPageSourceFormatCapability(
  value: unknown,
): DocmanPageSourceFormatCapability {
  return DOCMAN_PAGE_SOURCE_FORMAT_CAPABILITIES[resolveDocmanPageSourceFormat(value)]
}

export function formatDocmanPageSourceFormatLabel(value: unknown): string {
  return getDocmanPageSourceFormatCapability(value).label
}

export function parseDocmanAssetReference(value: unknown): DocmanAssetReference | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized.startsWith(DOCMAN_ASSET_REFERENCE_SCHEME)) return null

  const body = normalized.slice(DOCMAN_ASSET_REFERENCE_SCHEME.length).trim()
  if (!body) return null

  const match = /^(?<assetUid>[A-Za-z0-9][A-Za-z0-9._:-]*?)(?:@(?<version>\d+))?$/.exec(body)
  const assetUid = match?.groups?.assetUid?.trim()
  if (!assetUid) return null

  const parsedVersion = Number(match?.groups?.version)
  const version = Number.isInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : undefined

  return version ? { assetUid, version } : { assetUid }
}

export function isDocmanAssetReference(value: unknown): boolean {
  return parseDocmanAssetReference(value) !== null
}

export function formatDocmanAssetReference(input: DocmanAssetReference): string {
  const assetUid = String(input?.assetUid ?? '').trim()
  if (!assetUid) {
    throw new Error('docman_asset_reference_requires_asset_uid')
  }

  const parsedVersion = Number(input?.version)
  const version = Number.isInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : undefined

  return `${DOCMAN_ASSET_REFERENCE_SCHEME}${assetUid}${version ? `@${version}` : ''}`
}
