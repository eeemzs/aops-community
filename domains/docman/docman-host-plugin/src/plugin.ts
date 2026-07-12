import { buildOperationInputJsonSchema } from '@aopslab/xf-validation';

import type { DomainPlugin, DomainRequest, DomainRouteManifestEntry } from './types.js';
import {
  buildDocmanHostRouteProjection,
  getDocmanToolInputSchema,
  listDocmanOperationSpecs,
  parseDocmanToolInput,
  runDocmanKitOperationByTypedId,
  type DocmanOperationInput,
  type DocmanOperationOutput,
  type DocmanTypedOperationId
} from '@aopslab/domain-kit-docman';

const DEFAULT_DOCMAN_PLUGIN_SCOPE_ID = '00000000-0000-4000-8000-000000000000';

type DocmanRunner = <TId extends DocmanTypedOperationId>(
  operationId: TId,
  input: DocmanOperationInput<TId>
) => Promise<DocmanOperationOutput<TId>>;

export type DocmanPluginOptions = {
  runner?: DocmanRunner;
  defaultScopeId?: string;
};

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function isDocmanTypedOperationId(
  operationId: string,
  operationArgsById: Map<DocmanTypedOperationId, ReadonlyArray<{ name: string; optional: boolean }>>
): operationId is DocmanTypedOperationId {
  return operationArgsById.has(operationId as DocmanTypedOperationId);
}

function toTypedOperationInput<TId extends DocmanTypedOperationId>(
  operationId: TId,
  input: Record<string, unknown>,
): DocmanOperationInput<TId> {
  return parseDocmanToolInput(operationId, input) as DocmanOperationInput<TId>;
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function buildQueryPayload(query: URLSearchParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const filter: Record<string, unknown> = {};
  const options: Record<string, unknown> = {};

  for (const [key, rawValue] of query.entries()) {
    if (key.startsWith('filter.')) {
      filter[key.slice('filter.'.length)] = parseMaybeJson(rawValue);
      continue;
    }

    if (key.startsWith('options.')) {
      options[key.slice('options.'.length)] = parseMaybeJson(rawValue);
      continue;
    }

    if (key === 'includeVersionInfo') {
      options.includeVersionInfo = rawValue === 'true' || rawValue === '1';
      continue;
    }

    payload[key] = parseMaybeJson(rawValue);
  }

  if (Object.keys(filter).length > 0) payload.filter = filter;
  if (Object.keys(options).length > 0) payload.options = options;
  return payload;
}

function buildListInput(request: DomainRequest): Record<string, unknown> {
  const queryPayload = buildQueryPayload(request.query);
  const explicitFilter = toRecord(queryPayload.filter);
  const { options, filter: _filterEnvelope, ...flatFilter } = queryPayload;
  const mergedFilter = { ...flatFilter, ...explicitFilter };
  const payload: Record<string, unknown> = { filter: mergedFilter };
  if (options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).length > 0) {
    payload.options = options;
  }
  return payload;
}

function payloadFromBody(body: unknown): Record<string, unknown> {
  return toRecord(body);
}

function normalizeCustomBody(body: Record<string, unknown>): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(body, 'data')) return body;
  if (Object.keys(body).some((key) => key !== 'data')) return body;
  const dataPayload = toRecord(body.data);
  return Object.keys(dataPayload).length > 0 ? dataPayload : body;
}

function buildGetInput(request: DomainRequest, id: string): Record<string, unknown> {
  const queryPayload = buildQueryPayload(request.query);
  const options = toRecord(queryPayload.options);
  const payload: Record<string, unknown> = { id };
  if (Object.keys(options).length > 0) payload.options = options;
  return payload;
}

function buildDataInput(body: unknown): Record<string, unknown> {
  return toRecord(body);
}

function buildPatchInput(id: string, body: unknown): Record<string, unknown> {
  return {
    id,
    ...toRecord(body)
  };
}

function buildDeleteInput(id: string, body: unknown): Record<string, unknown> {
  const record = toRecord(body);
  return { id, ...record };
}

function parseCrudKind(operationId: string): 'list' | 'get' | 'create' | 'update' | 'delete' | null {
  const segments = operationId
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length !== 2) return null;
  const kind = segments[1];
  if (kind === 'list' || kind === 'get' || kind === 'create' || kind === 'update' || kind === 'delete') {
    return kind;
  }
  return null;
}

function buildCustomInput(
  operationId: string,
  request: DomainRequest,
  params: Record<string, string>
): Record<string, unknown> {
  const bodyRaw = payloadFromBody(request.body);
  const body = normalizeCustomBody(bodyRaw);
  const query = buildQueryPayload(request.query);

  if (operationId === 'document.compose.index') {
    return { documentVersionId: params.id, ...query, ...body };
  }
  if (operationId === 'document-version.import-headings') {
    return {
      ...query,
      ...body,
      documentVersionId: params.id,
    };
  }
  if (
    operationId === 'document.index.build' ||
    operationId === 'document.index.get' ||
    operationId === 'document.summary.build' ||
    operationId === 'document.summary.get'
  ) {
    return {
      ...query,
      ...body,
      documentVersionId: params.id,
    };
  }
  if (operationId === 'document.search') {
    return {
      ...query,
      ...body,
      documentVersionId: params.id,
    };
  }
  if (operationId === 'document.scope.search') {
    return {
      ...query,
      ...body,
      scopeId: params.id,
    };
  }
  if (operationId === 'document.answer-pack') {
    return {
      ...query,
      ...body,
      documentVersionId: params.id,
    };
  }
  if (operationId === 'document.compose.fetch') {
    return {
      ...query,
      ...body,
      documentVersionId: params.id,
    };
  }
  if (operationId === 'document.publish.materialize') {
    return {
      ...query,
      ...body,
      documentVersionId: params.id,
    };
  }
  if (operationId === 'document-section-link.usage.list') {
    return { sectionId: params.id, ...query, ...body };
  }
  if (operationId === 'document.delete.safe' || operationId === 'document-version.delete.safe') {
    return { id: params.id, ...query, ...body };
  }

  const payload: Record<string, unknown> = { ...query, ...body };
  if (params.id && payload.id === undefined) payload.id = params.id;
  return payload;
}

function buildInputForOperation(
  operationId: DocmanTypedOperationId,
  request: DomainRequest,
  params: Record<string, string>
): Record<string, unknown> {
  const kind = parseCrudKind(operationId);
  if (kind === 'list') return buildListInput(request);
  if (kind === 'get') return buildGetInput(request, params.id);
  if (kind === 'create') return buildDataInput(request.body);
  if (kind === 'update') return buildPatchInput(params.id, request.body);
  if (kind === 'delete') return buildDeleteInput(params.id, request.body);
  return buildCustomInput(operationId, request, params);
}

function buildDocmanRoutes(): DomainRouteManifestEntry[] {
  return buildDocmanHostRouteProjection({ refresh: true }).map((route) => {
    const inputJsonSchema = buildOperationInputJsonSchema(
      getDocmanToolInputSchema(route.operation as DocmanTypedOperationId),
    );
    return {
      id: route.id,
      method: route.method,
      pattern: route.pattern,
      operation: route.operation,
      summary: route.summary,
      ...(inputJsonSchema ? { inputJsonSchema } : {}),
      buildInput: (request, params) =>
        buildInputForOperation(route.operation as DocmanTypedOperationId, request, params)
    };
  });
}

function resolveRunner(options: DocmanPluginOptions): DocmanRunner {
  const defaultRunner: DocmanRunner = <TId extends DocmanTypedOperationId>(
    operationId: TId,
    input: DocmanOperationInput<TId>
  ) => runDocmanKitOperationByTypedId(operationId, input);
  return options.runner ?? defaultRunner;
}

export function createDocmanPlugin(options: DocmanPluginOptions = {}): DomainPlugin {
  const routes = buildDocmanRoutes();
  const operations = listDocmanOperationSpecs({ refresh: true });
  const operationArgsById = new Map<DocmanTypedOperationId, ReadonlyArray<{ name: string; optional: boolean }>>(
    operations.map((operation) => [operation.operationId as DocmanTypedOperationId, operation.args])
  );
  const runner = resolveRunner(options);

  return {
    contract: 'v1',
    domain: 'docman',
    version: 'v1',
    capabilities: ['documents', 'compose', 'render', 'workspace-context', 'manifest-driven-routing', 'dcm-first'],
    manifest: {
      domain: 'docman',
      version: 'v1',
      routes,
      meta: {
        adapter: 'docman-kit-operation-runner',
        runner: options.runner ? 'custom' : '@aopslab/domain-kit-docman#runDocmanKitOperationByTypedId',
        routeProjection: '@aopslab/domain-kit-docman#buildDocmanHostRouteProjection',
        operationCatalog: '@aopslab/domain-kit-docman#listDocmanOperationSpecs'
      }
    },
    health: async () => ({
      ok: true,
      details: {
        runner: options.runner ? 'custom' : '@aopslab/domain-kit-docman#runDocmanKitOperationByTypedId',
        routes: routes.length,
        operations: operations.length
      }
    }),
    execute: async ({ request, match }) => {
      const operationIdRaw = match.route.operation;
      if (!isDocmanTypedOperationId(operationIdRaw, operationArgsById)) {
        throw new Error(`unknown_docman_operation:${operationIdRaw}`);
      }
      const operationId = operationIdRaw;
      const inputBase = match.route.buildInput ? match.route.buildInput(request, match.params) : {};
      const explicitScopeId =
        typeof inputBase.scopeId === 'string' && inputBase.scopeId.trim().length > 0
          ? inputBase.scopeId
          : undefined;
      const scopeId =
        explicitScopeId
          ? explicitScopeId
          : typeof request.context.scopeId === 'string' && request.context.scopeId.trim().length > 0
          ? request.context.scopeId
          : options.defaultScopeId ?? DEFAULT_DOCMAN_PLUGIN_SCOPE_ID;
      const scopeResolution =
        request.context.scopeResolution === 'cascade' || request.context.scopeResolution === 'explicit'
          ? request.context.scopeResolution
          : undefined;

      const input = {
        ...inputBase,
        scopeId,
        ...(scopeResolution ? { scopeResolution } : {})
      };

      const typedInput = toTypedOperationInput(operationId, input);
      return runner(operationId, typedInput);
    }
  };
}
