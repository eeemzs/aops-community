type LinkRecord = Record<string, unknown>

const hasOwn = (record: LinkRecord | null | undefined, key: string) =>
  Object.prototype.hasOwnProperty.call(record ?? {}, key)

const toFinitePosition = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeNonEmpty = (value: unknown) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

type LinkUpdateRecord = {
  id: string
  patch: Record<string, unknown>
}

const normalizeUpdatePatch = (patch: unknown) =>
  patch && typeof patch === 'object' && !Array.isArray(patch) ? { ...patch } : null

const resolveNextParentLinkId = (
  currentLink: LinkRecord | null,
  patch: LinkRecord,
) => {
  if (hasOwn(patch, 'parentLinkId')) {
    return normalizeNonEmpty(patch.parentLinkId)
  }
  return normalizeNonEmpty(currentLink?.parentLinkId)
}

export function buildSafeDocumentLinkUpdateSequence(
  currentLinks: LinkRecord[] = [],
  updates: LinkUpdateRecord[] = [],
) {
  const normalizedUpdates = (Array.isArray(updates) ? updates : [])
    .map((update) => {
      const id = normalizeNonEmpty(update?.id)
      const patch = normalizeUpdatePatch(update?.patch)
      if (!id || !patch) return null
      return { id, patch }
    })
    .filter((update): update is LinkUpdateRecord => Boolean(update))

  if (normalizedUpdates.length <= 1) {
    return normalizedUpdates
  }

  const currentLinksById = new Map<string, LinkRecord>()
  for (const link of Array.isArray(currentLinks) ? currentLinks : []) {
    const id = normalizeNonEmpty(link?.id ?? link?.linkId)
    if (!id) continue
    currentLinksById.set(id, link)
  }

  const maxPositionByParentLinkId = new Map<string, number>()
  currentLinksById.forEach((link) => {
    const parentLinkId = normalizeNonEmpty(link.parentLinkId)
    const nextMax = Math.max(maxPositionByParentLinkId.get(parentLinkId) ?? 0, toFinitePosition(link.position))
    maxPositionByParentLinkId.set(parentLinkId, nextMax)
  })

  const tempCounterByParentLinkId = new Map<string, number>()
  const tempUpdates = normalizedUpdates.map((update, index) => {
    const currentLink = currentLinksById.get(update.id) ?? null
    const nextParentLinkId = resolveNextParentLinkId(currentLink, update.patch)
    const basePosition =
      (maxPositionByParentLinkId.get(nextParentLinkId) ?? 0) + normalizedUpdates.length + 16
    const nextCounter = (tempCounterByParentLinkId.get(nextParentLinkId) ?? 0) + 1
    tempCounterByParentLinkId.set(nextParentLinkId, nextCounter)

    return {
      id: update.id,
      patch: {
        ...update.patch,
        position: basePosition + nextCounter + index,
      },
    }
  })

  return [...tempUpdates, ...normalizedUpdates]
}
