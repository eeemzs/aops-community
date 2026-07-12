import type { DocmanPublishTarget } from '../ports/inbound/IDocumentServicePort.js'

export const DOCMAN_PUBLISH_TARGETS = ['markdown', 'html'] as const

export type DocmanPublishDeliveryKind = 'inline-text'

export type DocmanPublishTargetDescriptor = {
  target: DocmanPublishTarget
  deliveryKind: DocmanPublishDeliveryKind
  mediaType: string
}

const DOCMAN_PUBLISH_TARGET_DESCRIPTOR_MAP: Record<DocmanPublishTarget, DocmanPublishTargetDescriptor> = {
  markdown: {
    target: 'markdown',
    deliveryKind: 'inline-text',
    mediaType: 'text/markdown; charset=utf-8',
  },
  html: {
    target: 'html',
    deliveryKind: 'inline-text',
    mediaType: 'text/html; charset=utf-8',
  },
}

export function listDocmanPublishTargets(): DocmanPublishTarget[] {
  return [...DOCMAN_PUBLISH_TARGETS]
}

export function formatDocmanPublishTargets(): string {
  return listDocmanPublishTargets().join(', ')
}

export function isDocmanPublishTarget(value: unknown): value is DocmanPublishTarget {
  return resolveDocmanPublishTarget(value) !== null
}

export function resolveDocmanPublishTarget(value: unknown): DocmanPublishTarget | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  return normalized === 'markdown' || normalized === 'html'
    ? (normalized as DocmanPublishTarget)
    : null
}

export function resolveDocmanPublishTargetDescriptor(value: unknown): DocmanPublishTargetDescriptor | null {
  const target = resolveDocmanPublishTarget(value)
  return target ? getDocmanPublishTargetDescriptor(target) : null
}

export function getDocmanPublishTargetDescriptor(target: DocmanPublishTarget): DocmanPublishTargetDescriptor {
  return DOCMAN_PUBLISH_TARGET_DESCRIPTOR_MAP[target]
}
