export type AgentInvokeSemanticPreview = {
  kind: 'delete-target' | 'bulk-push' | 'handoff-import' | 'sheet-import'
  summary: string
  change: {
    action: 'delete' | 'bulk-push' | 'import'
    basis: 'target-uid' | 'payload-counts' | 'source-revision' | 'sheet-rows'
  }
  sourceMode?: 'preset' | 'inline-data'
  preset?: string
  target?: Record<string, string | number>
  counts?: Record<string, number>
  idempotency?: {
    owner: 'domain-natural-key'
    recommendedKey: string
    scope: 'orderUid+revisionNumber'
  }
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readCollection(input: unknown, collectionKey: string): unknown[] {
  const payload = asRecord(input)
  if (Array.isArray(payload[collectionKey])) return payload[collectionKey] as unknown[]

  if (Array.isArray(payload.data)) return payload.data as unknown[]

  const data = asRecord(payload.data)
  if (Array.isArray(data[collectionKey])) return data[collectionKey] as unknown[]
  return []
}

function buildBulkPushPreview(args: {
  collectionKey: string
  targetLabel: string
  input: unknown
  presetOptional?: boolean
}): AgentInvokeSemanticPreview | undefined {
  const payload = asRecord(args.input)
  const preset = args.presetOptional === false ? '' : normalizeText(payload.preset)
  const count = readCollection(payload, args.collectionKey).length
  if (!preset && count <= 0) return undefined

  return {
    kind: 'bulk-push',
    summary: preset
      ? `Push ${args.targetLabel} from preset ${preset}.`
      : `Push ${count} ${args.targetLabel}.`,
    change: {
      action: 'bulk-push',
      basis: 'payload-counts',
    },
    ...(preset ? { sourceMode: 'preset' as const, preset } : { sourceMode: 'inline-data' as const }),
    ...(count > 0 ? { counts: { [args.collectionKey]: count } } : {}),
  }
}

function buildUnitPushPreview(input: unknown): AgentInvokeSemanticPreview | undefined {
  const payload = asRecord(input)
  const preset = normalizeText(payload.preset)
  const data = asRecord(payload.data)
  const unitTypes = asArray(payload.unitTypes).length > 0 ? asArray(payload.unitTypes) : asArray(data.unitTypes)
  const units = asArray(payload.units).length > 0 ? asArray(payload.units) : asArray(data.units)
  const subUnits = units.reduce<number>(
    (count, entry) => count + asArray(asRecord(entry).subUnits).length,
    0,
  )

  if (!preset && unitTypes.length <= 0 && units.length <= 0) return undefined

  return {
    kind: 'bulk-push',
    summary: preset
      ? `Push inventory units from preset ${preset}.`
      : `Push ${units.length} units across ${unitTypes.length} unit types.`,
    change: {
      action: 'bulk-push',
      basis: 'payload-counts',
    },
    ...(preset ? { sourceMode: 'preset' as const, preset } : { sourceMode: 'inline-data' as const }),
    counts: {
      unitTypes: unitTypes.length,
      units: units.length,
      subUnits,
    },
  }
}

function buildDeletePreview(
  input: unknown,
  key: 'unitUid' | 'subUnitUid' | 'attributeDefUid',
  label: string,
): AgentInvokeSemanticPreview | undefined {
  const payload = asRecord(input)
  const targetUid = normalizeText(payload[key])
  if (!targetUid) return undefined
  return {
    kind: 'delete-target',
    summary: `Delete ${label} ${targetUid}.`,
    change: {
      action: 'delete',
      basis: 'target-uid',
    },
    target: {
      [key]: targetUid,
    },
  }
}

function buildReceivingSourceRevisionKey(orderUid: string, revisionNumber: number): string {
  return `${orderUid}::r${String(revisionNumber)}`
}

function buildReceivingImportPreview(input: unknown): AgentInvokeSemanticPreview | undefined {
  const payload = asRecord(input)
  const handoff = asRecord(payload.handoff ?? payload.data ?? payload.input ?? payload)
  const orderUid = normalizeText(handoff.orderUid)
  const revisionNumber = normalizePositiveInteger(handoff.revisionNumber)
  if (!orderUid || !revisionNumber) return undefined

  const lineCount = normalizePositiveInteger(handoff.lineCount) ?? asArray(handoff.lines).length
  const sourceRevisionKey = buildReceivingSourceRevisionKey(orderUid, revisionNumber)

  return {
    kind: 'handoff-import',
    summary: `Import receiving handoff for purchase order ${orderUid} revision ${revisionNumber}.`,
    change: {
      action: 'import',
      basis: 'source-revision',
    },
    target: {
      orderUid,
      revisionNumber,
      ...(lineCount > 0 ? { lineCount } : {}),
    },
    ...(lineCount > 0 ? { counts: { lines: lineCount } } : {}),
    idempotency: {
      owner: 'domain-natural-key',
      recommendedKey: `inventory.receiving.import-purchase-order-handoff:${sourceRevisionKey}`,
      scope: 'orderUid+revisionNumber',
    },
  }
}

function buildBomSheetPreview(operationId: string, input: unknown): AgentInvokeSemanticPreview | undefined {
  const payload = asRecord(input)
  const rows = asArray(payload.rows)
  const sheetName = normalizeText(payload.sheetName)
  if (rows.length <= 0 && !sheetName) return undefined

  return {
    kind: 'sheet-import',
    summary:
      operationId === 'bom.import-sheet-preview'
        ? `Preview BOM sheet import for ${rows.length} rows.`
        : `Create BOM from sheet import with ${rows.length} rows.`,
    change: {
      action: 'import',
      basis: 'sheet-rows',
    },
    ...(sheetName ? { target: { sheetName } } : {}),
    counts: {
      rows: rows.length,
    },
  }
}

function buildInventorySemanticPreview(operationId: string, input: unknown): AgentInvokeSemanticPreview | undefined {
  switch (operationId) {
    case 'category.push':
      return buildBulkPushPreview({
        collectionKey: 'categories',
        targetLabel: 'inventory categories',
        input,
      })
    case 'attribute-def.push':
      return buildBulkPushPreview({
        collectionKey: 'attributeDefs',
        targetLabel: 'attribute definitions',
        input,
      })
    case 'attribute-def.delete':
      return buildDeletePreview(input, 'attributeDefUid', 'attribute definition')
    case 'category-attribute.push':
      return buildBulkPushPreview({
        collectionKey: 'categoryAttributes',
        targetLabel: 'category attribute bindings',
        input,
      })
    case 'manufacturer.push':
      return buildBulkPushPreview({
        collectionKey: 'manufacturers',
        targetLabel: 'manufacturers',
        input,
        presetOptional: false,
      })
    case 'distributor.push':
      return buildBulkPushPreview({
        collectionKey: 'distributors',
        targetLabel: 'distributors',
        input,
        presetOptional: false,
      })
    case 'supplier.push':
      return buildBulkPushPreview({
        collectionKey: 'suppliers',
        targetLabel: 'suppliers',
        input,
        presetOptional: false,
      })
    case 'unit.push':
      return buildUnitPushPreview(input)
    case 'unit.delete':
      return buildDeletePreview(input, 'unitUid', 'inventory unit')
    case 'subunit.delete':
      return buildDeletePreview(input, 'subUnitUid', 'inventory sub-unit')
    case 'receiving.import-purchase-order-handoff':
      return buildReceivingImportPreview(input)
    case 'bom.import-sheet-preview':
    case 'bom.import-sheet-create':
      return buildBomSheetPreview(operationId, input)
    default:
      return undefined
  }
}

export function buildAgentSemanticPreview(args: {
  domain: string
  operationId: string
  input: unknown
}): AgentInvokeSemanticPreview | undefined {
  if (normalizeText(args.domain).toLowerCase() !== 'inventory') return undefined
  return buildInventorySemanticPreview(args.operationId, args.input)
}

export function resolveAgentSemanticIdempotencyKey(args: {
  domain: string
  operationId: string
  input: unknown
}): string | undefined {
  return buildAgentSemanticPreview(args)?.idempotency?.recommendedKey
}
