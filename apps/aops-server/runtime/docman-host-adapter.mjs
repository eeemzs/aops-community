// @ts-nocheck
import {
  createDocmanPlugin as createBaseDocmanPlugin,
} from '@aopslab/domain-host-plugin-docman';
import {
  clearDocmanKitEnvConfigCache,
  clearDocmanKitOperationCaches,
  parseDocmanToolInput,
  runDocmanKitOperationByTypedId,
} from '@aopslab/domain-kit-docman';
import { runAgentspaceKitOperationByTypedId } from '@aopslab/domain-kit-agentspace';
import {
  DEFAULT_DOCMAN_SCOPE_ID,
  applyDocmanRuntimeEnv,
  resolveDocmanRuntimeConfig,
} from '@aopslab/domain-runtime-config-docman';
import {
  filterDocmanHostRouteProjection,
  isDocmanOperationAllowed,
  sanitizeDocmanOperationInput,
  sanitizeDocmanOperationOutput,
} from './docman-policy.mjs';
import {
  createAgentspaceScopeResolver,
  normalizeScopeResolution,
  toNonEmptyString,
} from './scope-context.mjs';

let docmanHostedRuntimeEnvReady = false;

function toRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function unwrapData(value) {
  const record = toRecord(value);
  if (Object.prototype.hasOwnProperty.call(record, 'data')) {
    return record.data;
  }
  return value;
}

function toResultArray(value) {
  const data = unwrapData(value);
  if (Array.isArray(data)) return data;
  const record = toRecord(data);
  if (Array.isArray(record.items)) return record.items;
  return [];
}

function normalizeDocmanScopeId(value) {
  const normalized = toNonEmptyString(value);
  if (!normalized) return undefined;
  return normalized.toLowerCase() === 'default' ? DEFAULT_DOCMAN_SCOPE_ID : normalized;
}

const docmanScopeResolver = createAgentspaceScopeResolver({
  runAgentspaceOperation: runAgentspaceKitOperationByTypedId,
  normalizeScopeId: normalizeDocmanScopeId,
});

function ensureDocmanHostedRuntimeEnv(options = {}) {
  if (docmanHostedRuntimeEnvReady) return;

  clearDocmanKitEnvConfigCache();
  clearDocmanKitOperationCaches();

  const runtime = resolveDocmanRuntimeConfig(
    {
      scopeId: normalizeDocmanScopeId(options.defaultScopeId),
    },
    process.env,
  );

  if (runtime.repoDialect !== 'pg') {
    throw new Error('community_docman_postgresql_runtime_required');
  }

  applyDocmanRuntimeEnv(
    {
      runtimeMode: runtime.runtimeMode,
      repoUrl: runtime.repoUrl,
      repoDialect: runtime.repoDialect,
      scopeId: runtime.scopeId,
    },
    process.env,
  );

  if (process.env.AOPS_DB_BOOTSTRAP_MODE !== 'explicit') {
    throw new Error('community_strict_bootstrap_mode_required');
  }

  clearDocmanKitEnvConfigCache();
  clearDocmanKitOperationCaches();
  docmanHostedRuntimeEnvReady = true;
}

async function loadDocumentLinkById(linkId) {
  const normalizedLinkId = typeof linkId === 'string' ? linkId.trim() : '';
  if (!normalizedLinkId) return null;
  const result = await runDocmanKitOperationByTypedId('document-section-link.get', {
    id: normalizedLinkId,
  });
  return result?.item ?? result ?? null;
}

async function resolveDocmanRequestScope(requestContext = {}, options = {}) {
  const resolved = await docmanScopeResolver.resolveRequestScope(requestContext, options);
  return {
    projectId: resolved.projectId,
    scopeId: resolved.scopeId ?? DEFAULT_DOCMAN_SCOPE_ID,
    scopeResolution: resolved.scopeResolution ?? normalizeScopeResolution(requestContext.scopeResolution),
  };
}

export function createDocmanPlugin(options = {}) {
  ensureDocmanHostedRuntimeEnv(options);

  const basePlugin = createBaseDocmanPlugin({
    ...options,
    defaultScopeId: options.defaultScopeId,
    runner: async (operationId, input) => {
      if (!isDocmanOperationAllowed(operationId)) {
        throw new Error(`operation_route_not_found:docman:${operationId}`);
      }

      const sanitizedInput = await sanitizeDocmanOperationInput(operationId, input, {
        loadDocumentLinkById,
      });
      const result = await runDocmanKitOperationByTypedId(operationId, sanitizedInput);
      return sanitizeDocmanOperationOutput(operationId, result);
    },
  });

  const filteredRoutes = filterDocmanHostRouteProjection(basePlugin.manifest.routes);

  return {
    ...basePlugin,
    manifest: {
      ...basePlugin.manifest,
      routes: Array.isArray(filteredRoutes) ? filteredRoutes : filteredRoutes.routes ?? [],
      meta: {
        ...(basePlugin.manifest?.meta ?? {}),
        adapter: 'aops-docman-policy-wrapper',
        policy: 'root-or-section-pages-no-page-nesting',
      },
    },
    execute: async (args) => {
      const operationId = args?.match?.route?.operation;
      if (!isDocmanOperationAllowed(operationId)) {
        throw new Error(`operation_route_not_found:docman:${operationId}`);
      }
      const baseRoute = basePlugin.manifest.routes.find((route) => route.operation === operationId)
        ?? args?.match?.route;
      const inputBase =
        typeof baseRoute?.buildInput === 'function'
          ? baseRoute.buildInput(args?.request, args?.match?.params ?? {})
          : {};
      const explicitScopeId =
        typeof inputBase?.scopeId === 'string' && inputBase.scopeId.trim().length > 0
          ? inputBase.scopeId
          : undefined;
      const requestScope = await resolveDocmanRequestScope(args?.request?.context, options);
      const typedInput = parseDocmanToolInput(operationId, {
        ...inputBase,
        scopeId: explicitScopeId ?? requestScope.scopeId,
        ...(requestScope.scopeResolution ? { scopeResolution: requestScope.scopeResolution } : {}),
      });
      const sanitizedInput = await sanitizeDocmanOperationInput(operationId, typedInput, {
        loadDocumentLinkById,
      });
      const result = await runDocmanKitOperationByTypedId(operationId, sanitizedInput);
      return sanitizeDocmanOperationOutput(operationId, result);
    },
  };
}
