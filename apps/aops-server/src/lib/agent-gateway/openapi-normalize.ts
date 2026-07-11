const INVOKE_REQUEST_DESCRIPTION =
  'Send either the raw tool input JSON directly, or use the canonical envelope { sourceId?, input, preview?, apply?, confirm?, idempotencyKey? }. Use preview for preflight, apply for guarded writes, confirm for destructive writes, and idempotencyKey for best-effort guarded-write deduplication.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isEnvelopeOnlyInvokeSchema(schema: unknown): schema is Record<string, unknown> {
  if (!isRecord(schema)) return false
  if (Array.isArray(schema.oneOf)) return false
  if (schema.type !== 'object') return false

  const properties = isRecord(schema.properties) ? schema.properties : null
  if (!properties || !Object.prototype.hasOwnProperty.call(properties, 'input')) return false

  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : []
  return required.includes('input')
}

function normalizeInvokeSchema(schema: unknown): unknown {
  if (!isEnvelopeOnlyInvokeSchema(schema)) return schema

  const properties = isRecord(schema.properties) ? schema.properties : {}
  const rawInputSchema = properties.input ?? { type: 'object', additionalProperties: true }
  const envelopeSchema = {
    ...schema,
    properties: {
      ...properties,
      ...(Object.prototype.hasOwnProperty.call(properties, 'preview')
        ? {}
        : { preview: { type: 'boolean' } }),
      ...(Object.prototype.hasOwnProperty.call(properties, 'apply')
        ? {}
        : { apply: { type: 'boolean' } }),
      ...(Object.prototype.hasOwnProperty.call(properties, 'confirm')
        ? {}
        : { confirm: { type: 'boolean' } }),
      ...(Object.prototype.hasOwnProperty.call(properties, 'idempotencyKey')
        ? {}
        : { idempotencyKey: { type: 'string' } }),
    },
  }

  return {
    description:
      typeof schema.description === 'string' && schema.description.trim().length > 0
        ? schema.description
        : INVOKE_REQUEST_DESCRIPTION,
    oneOf: [rawInputSchema, envelopeSchema],
  }
}

export function normalizeAgentGatewayOpenApiDocument(document: Record<string, unknown>): Record<string, unknown> {
  const paths = isRecord(document.paths) ? document.paths : null
  if (!paths) return document

  let changed = false
  const normalizedPaths: Record<string, unknown> = {}

  for (const [pathKey, pathValue] of Object.entries(paths)) {
    if (!isRecord(pathValue) || !isRecord(pathValue.post)) {
      normalizedPaths[pathKey] = pathValue
      continue
    }

    const post = pathValue.post
    const requestBody = isRecord(post.requestBody) ? post.requestBody : null
    const content = requestBody && isRecord(requestBody.content) ? requestBody.content : null
    const jsonContent = content && isRecord(content['application/json']) ? content['application/json'] : null
    const schema = jsonContent?.schema
    const nextSchema = normalizeInvokeSchema(schema)

    if (nextSchema === schema) {
      normalizedPaths[pathKey] = pathValue
      continue
    }

    changed = true
    normalizedPaths[pathKey] = {
      ...pathValue,
      post: {
        ...post,
        requestBody: {
          ...requestBody,
          content: {
            ...content,
            'application/json': {
              ...jsonContent,
              schema: nextSchema,
            },
          },
        },
      },
    }
  }

  if (!changed) return document
  return {
    ...document,
    paths: normalizedPaths,
  }
}
