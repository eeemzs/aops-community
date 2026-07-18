// Generated during the public source projection.
// The base plugin retains input validation/runtime setup; this adapter only narrows its manifest and execution gate.
import { createAgentspacePlugin as createBaseAgentspacePlugin } from '@aopslab/domain-host-plugin-agentspace';
import {
  COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS,
  buildCommunityAgentspaceProjection,
  filterCommunityAgentspaceHostRouteProjection,
} from './agentspace-tooling.mjs';

const normalizeId = (value) => String(value ?? '').trim().toLowerCase();

export function createCommunityAgentspacePlugin(options = {}) {
  const projection = buildCommunityAgentspaceProjection({
    refresh: options.refreshProjectionOnCreate === true,
    includeDocs: true,
  });
  const allowedOperationIds = new Set(projection.operationIds);
  const basePlugin = createBaseAgentspacePlugin(options);
  const baseRoutes = Array.isArray(basePlugin?.manifest?.routes) ? basePlugin.manifest.routes : [];
  const routes = filterCommunityAgentspaceHostRouteProjection(baseRoutes, {
    expectedSourceRoutes: projection.sourceRoutes,
  });
  const baseHealth = basePlugin.health;
  const baseExecute = basePlugin.execute;
  if (typeof baseExecute !== 'function') throw new Error('community_agentspace_base_execute_missing');
  return {
    ...basePlugin,
    capabilities: [...COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS],
    manifest: {
      ...basePlugin.manifest,
      routes,
      meta: {
        ...(basePlugin.manifest?.meta ?? {}),
        adapter: 'aops-community-agentspace-filter-v1',
        capabilityProjection: './agentspace-tooling.mjs#buildCommunityAgentspaceProjection',
        sourceOperationCount: projection.sourceOperationIds.length,
        operationCount: projection.operationIds.length,
        resourceCount: projection.resourceIds.length,
        unclassifiedResourceIds: projection.unclassifiedResourceIds,
      },
    },
    health: typeof baseHealth === "function" ? async () => {
      const result = await baseHealth();
      return {
        ...result,
        details: {
          ...(result?.details ?? {}),
          routesCount: routes.length,
          communitySourceRoutesCount: baseRoutes.length,
          communityResourceCount: projection.resourceIds.length,
        },
      };
    } : baseHealth,
    execute: async (args) => {
      const operationId = normalizeId(args?.match?.route?.operation);
      if (!allowedOperationIds.has(operationId)) {
        throw new Error('operation_route_not_found:agentspace:' + (operationId || 'missing'));
      }
      return baseExecute(args);
    },
  };
}

export const createAgentspacePlugin = createCommunityAgentspacePlugin;
