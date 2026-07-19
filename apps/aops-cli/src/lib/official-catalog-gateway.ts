import {
  assertOfficialCatalogReceiptV1,
  assertOfficialCatalogSnapshotV1,
  OFFICIAL_CATALOG_SCOPE_V1,
  OFFICIAL_CATALOG_TOOL_IDS_V1,
  OfficialCatalogError,
  type OfficialCatalogAdapterV1,
  type OfficialCatalogReceiptV1,
  type OfficialCatalogReconcilePlanV1,
  type OfficialCatalogRollbackRequestV1,
  type OfficialCatalogSnapshotV1,
} from './official-catalog.js'
import { invokeHostedToolWithApiState, unwrapHostedToolResult, type AgentGatewayContextOptions } from '../utils/agent-gateway.js'
import { createCliApiClientFromOptions } from '../utils/api.js'

export type OfficialCatalogGatewayInvokeV1 = (
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  envelope: Readonly<{
    preview: boolean
    apply: boolean
    confirm: boolean
    idempotencyKey?: string
  }>,
) => Promise<unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unwrapData(value: unknown): unknown {
  let current = value
  for (let depth = 0; depth < 4; depth += 1) {
    if (!isRecord(current)) break
    if (Object.prototype.hasOwnProperty.call(current, 'response')) {
      current = current.response
      continue
    }
    if (Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data
      continue
    }
    break
  }
  return current
}

function remoteError(toolId: string, error: unknown): OfficialCatalogError {
  return new OfficialCatalogError(
    'catalog_adapter_unavailable',
    `The server does not expose the required official-catalog operation: ${toolId}.`,
    {
      toolId,
      dependency: 'Agentspace official-catalog composite operation',
      cause: error instanceof Error ? error.message : String(error),
    },
  )
}

/**
 * Exact fail-closed client boundary for the future Agentspace composite owner.
 * No fallback sequence of generic Skill writes is attempted because it could
 * leave partial current-version mappings without a durable rollback receipt.
 */
export function createOfficialCatalogGatewayAdapterV1(
  invoke: OfficialCatalogGatewayInvokeV1,
): OfficialCatalogAdapterV1 {
  return Object.freeze({
    async inspect(): Promise<OfficialCatalogSnapshotV1> {
      const toolId = OFFICIAL_CATALOG_TOOL_IDS_V1.inspect
      try {
        const result = unwrapData(await invoke(toolId, { scope: OFFICIAL_CATALOG_SCOPE_V1 }, {
          preview: false,
          apply: false,
          confirm: false,
        })) as OfficialCatalogSnapshotV1
        assertOfficialCatalogSnapshotV1(result)
        return result
      } catch (error) {
        if (error instanceof OfficialCatalogError && error.code !== 'catalog_adapter_unavailable') throw error
        throw remoteError(toolId, error)
      }
    },

    async reconcile(
      plan: OfficialCatalogReconcilePlanV1,
      mode: 'preview' | 'apply',
    ): Promise<OfficialCatalogReconcilePlanV1 | OfficialCatalogReceiptV1> {
      const toolId = OFFICIAL_CATALOG_TOOL_IDS_V1.reconcile
      try {
        const result = unwrapData(await invoke(toolId, { plan }, {
          preview: mode === 'preview',
          apply: mode === 'apply',
          confirm: false,
          idempotencyKey: plan.idempotencyKey,
        }))
        if (mode === 'preview') return result as OfficialCatalogReconcilePlanV1
        const receipt = result as OfficialCatalogReceiptV1
        assertOfficialCatalogReceiptV1(receipt, 'reconcile')
        return receipt
      } catch (error) {
        if (error instanceof OfficialCatalogError && error.code !== 'catalog_adapter_unavailable') throw error
        throw remoteError(toolId, error)
      }
    },

    async rollback(
      request: OfficialCatalogRollbackRequestV1,
      mode: 'preview' | 'apply',
    ): Promise<OfficialCatalogRollbackRequestV1 | OfficialCatalogReceiptV1> {
      const toolId = OFFICIAL_CATALOG_TOOL_IDS_V1.rollback
      try {
        const result = unwrapData(await invoke(toolId, { request }, {
          preview: mode === 'preview',
          apply: mode === 'apply',
          confirm: mode === 'apply',
          idempotencyKey: request.idempotencyKey,
        }))
        if (mode === 'preview') return result as OfficialCatalogRollbackRequestV1
        const receipt = result as OfficialCatalogReceiptV1
        assertOfficialCatalogReceiptV1(receipt, 'rollback')
        return receipt
      } catch (error) {
        if (error instanceof OfficialCatalogError && error.code !== 'catalog_adapter_unavailable') throw error
        throw remoteError(toolId, error)
      }
    },
  })
}

/** Hosted transport binding used by both setup init and `setup catalog`. */
export async function createHostedOfficialCatalogAdapterV1(
  options: AgentGatewayContextOptions = {},
): Promise<OfficialCatalogAdapterV1> {
  const apiState = await createCliApiClientFromOptions(options)
  return createOfficialCatalogGatewayAdapterV1(async (toolId, input, envelope) => {
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...options,
      toolId,
      input,
      preview: envelope.preview,
      apply: envelope.apply,
      confirm: envelope.confirm,
      idempotencyKey: envelope.idempotencyKey,
    })
    return unwrapHostedToolResult(payload)
  })
}
