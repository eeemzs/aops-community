import type { DocmanTypedOperationId } from './io-types.js'

export const DOCMAN_SCOPE_OWNED_CREATE_OPERATION_IDS = new Set<DocmanTypedOperationId>([
  'document.create',
  'document-group.create',
  'section.create',
  'page.create',
  'snippet.create',
  'asset.create',
  'embed.create',
])

export function isDocmanScopeOwnedCreateOperation(operationId: string): operationId is DocmanTypedOperationId {
  return DOCMAN_SCOPE_OWNED_CREATE_OPERATION_IDS.has(operationId as DocmanTypedOperationId)
}
