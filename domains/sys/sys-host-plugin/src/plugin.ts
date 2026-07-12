import { buildOperationInputJsonSchema } from '@aopslab/xf-validation';

import type { DomainPlugin, DomainRequest, DomainRouteManifestEntry } from './types.js';
import {
  buildSysHostRouteProjection,
  getSysToolInputSchema,
  listSysOperationSpecs,
  parseSysToolInput,
  runSysKitOperationByTypedId,
  type SysOperationInput,
  type SysOperationOutput,
  type SysTypedOperationId,
} from '@aopslab/domain-kit-sys';
import { applySysPgSchema } from '@aopslab/domain-pg-bootstrap-sys';

type SysRunner = <TId extends SysTypedOperationId>(
  operationId: TId,
  input: SysOperationInput<TId>,
) => Promise<SysOperationOutput<TId>>;

export type SysPluginOptions = {
  runner?: SysRunner;
  defaultWorkspaceId?: string;
};

const SYS_OPERATION_IDS = new Set(
  listSysOperationSpecs({ refresh: true }).map((operation) => operation.operationId as SysTypedOperationId),
);

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function inferRepoDialectFromUrl(repoUrl: string): 'pg' | 'sqlite' {
  const normalized = repoUrl.trim().toLowerCase();
  if (!normalized) return 'pg';
  if (normalized === ':memory:') return 'sqlite';
  if (normalized.startsWith('sqlite:') || normalized.startsWith('file:')) return 'sqlite';
  if (normalized.endsWith('.db') || normalized.endsWith('.sqlite') || normalized.endsWith('.sqlite3')) return 'sqlite';
  return 'pg';
}

function resolveSysPgBootstrapRepoUrl(): string | undefined {
  return (
    normalizeNonEmpty(process.env.SYS_REPO_URL) ??
    normalizeNonEmpty(process.env.SYS_PG_URL) ??
    normalizeNonEmpty(process.env.POSTGRES_URL_LOCAL) ??
    normalizeNonEmpty(process.env.POSTGRES_URL) ??
    normalizeNonEmpty(process.env.DATABASE_URL) ??
    normalizeNonEmpty(process.env.AOPS_PG_URL) ??
    normalizeNonEmpty(process.env.DEV_PG_URL)
  );
}

function toTypedOperationInput<TId extends SysTypedOperationId>(
  operationId: TId,
  input: Record<string, unknown>,
): SysOperationInput<TId> {
  return parseSysToolInput(operationId, input) as SysOperationInput<TId>;
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
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
  for (const [key, rawValue] of query.entries()) {
    payload[key] = parseMaybeJson(rawValue);
  }
  return payload;
}

function parseCrudKind(operationId: string): 'list' | 'get' | 'create' | 'update' | 'delete' | null {
  const segments = operationId.split('.').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length !== 2) return null;
  const kind = segments[1];
  if (kind === 'list' || kind === 'get' || kind === 'create' || kind === 'update' || kind === 'delete') return kind;
  return null;
}

function payloadFromBody(body: unknown): Record<string, unknown> {
  return toRecord(body);
}

function buildInputForOperation(
  operationId: SysTypedOperationId,
  request: DomainRequest,
  params: Record<string, string>,
): Record<string, unknown> {
  const query = buildQueryPayload(request.query);
  const body = payloadFromBody(request.body);
  const kind = parseCrudKind(operationId);

  if (kind === 'list') {
    const options = toRecord(query.options);
    const { options: _ignored, ...filter } = query;
    const payload: Record<string, unknown> = { filter };
    if (Object.keys(options).length > 0) payload.options = options;
    return payload;
  }
  if (kind === 'get') return { id: params.id, ...query };
  if (kind === 'create') return { ...query, ...body };
  if (kind === 'update') return { id: params.id, ...query, ...body };
  if (kind === 'delete') return { id: params.id, ...query, ...body };

  return {
    ...query,
    ...body,
    ...(params.id && !('id' in body) ? { id: params.id } : {}),
  };
}

function buildSysRoutes(): DomainRouteManifestEntry[] {
  return buildSysHostRouteProjection({ refresh: true }).map((route) => {
    const inputJsonSchema = buildOperationInputJsonSchema(
      getSysToolInputSchema(route.operation as SysTypedOperationId),
    );
    return {
      id: route.id,
      method: route.method,
      pattern: route.pattern,
      operation: route.operation,
      summary: route.summary,
      ...(inputJsonSchema ? { inputJsonSchema } : {}),
      buildInput: (request, params) => buildInputForOperation(route.operation as SysTypedOperationId, request, params),
    };
  });
}

function resolveRunner(options: SysPluginOptions): SysRunner {
  const defaultRunner: SysRunner = <TId extends SysTypedOperationId>(
    operationId: TId,
    input: SysOperationInput<TId>,
  ) => runSysKitOperationByTypedId(operationId, input);
  return options.runner ?? defaultRunner;
}

export function createSysPlugin(options: SysPluginOptions = {}): DomainPlugin {
  const routes = buildSysRoutes();
  const operations = listSysOperationSpecs({ refresh: true });
  const runner = resolveRunner(options);

  return {
    contract: 'v1',
    domain: 'sys',
    version: 'v1',
    capabilities: ['sys', 'manifest-driven-routing'],
    manifest: {
      domain: 'sys',
      version: 'v1',
      routes,
      meta: {
        adapter: 'sys-kit-operation-runner',
        runner: options.runner ? 'custom' : '@aopslab/domain-kit-sys#runSysKitOperationByTypedId',
        routeProjection: '@aopslab/domain-kit-sys#buildSysHostRouteProjection',
        operationCatalog: '@aopslab/domain-kit-sys#listSysOperationSpecs',
      },
    },
    setup: async () => {
      const repoUrl = resolveSysPgBootstrapRepoUrl();
      if (!repoUrl || inferRepoDialectFromUrl(repoUrl) !== 'pg') return;
      await applySysPgSchema({ repoUrl });
    },
    health: async () => ({
      ok: true,
      details: {
        routes: routes.length,
        operations: operations.length,
        runner: options.runner ? 'custom' : '@aopslab/domain-kit-sys#runSysKitOperationByTypedId',
      },
    }),
    execute: async ({ request, match }) => {
      const operationIdRaw = match.route.operation;
      if (!SYS_OPERATION_IDS.has(operationIdRaw as SysTypedOperationId)) {
        throw new Error(`unknown_sys_operation:${operationIdRaw}`);
      }
      const operationId = operationIdRaw as SysTypedOperationId;
      const inputBase = match.route.buildInput ? match.route.buildInput(request, match.params) : {};
      const workspaceId =
        typeof request.context.workspaceId === 'string' && request.context.workspaceId.trim().length > 0
          ? request.context.workspaceId
          : typeof request.context.workspaceUid === 'string' && request.context.workspaceUid.trim().length > 0
          ? request.context.workspaceUid
          : typeof request.context.workspaceUuid === 'string' && request.context.workspaceUuid.trim().length > 0
          ? request.context.workspaceUuid
          : typeof request.context.workspaceName === 'string' && request.context.workspaceName.trim().length > 0
          ? request.context.workspaceName
          : options.defaultWorkspaceId ?? 'default';

      const input = {
        ...inputBase,
        workspaceId,
      };

      const typedInput = toTypedOperationInput(operationId, input);
      return runner(operationId, typedInput);
    },
  };
}
