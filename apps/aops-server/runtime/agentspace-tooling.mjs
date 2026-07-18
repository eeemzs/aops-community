// Generated during the public source projection.
// Community projection: canonical Agentspace DCM remains the source; this module is a fail-closed projection.
import {
  buildAgentspaceDomainCapabilityManifest as buildBaseAgentspaceDomainCapabilityManifest,
  buildAgentspaceHostRouteProjection as buildBaseAgentspaceHostRouteProjection,
} from '@aopslab/domain-kit-agentspace';

export const COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS = Object.freeze([
  "activity-item",
  "agent-profile",
  "artifact",
  "artifact-link",
  "chat",
  "chat-binding",
  "chat-member",
  "chat-message",
  "chat-room",
  "discussion-output",
  "discussion-topic",
  "discussion-turn",
  "experience-item",
  "memory-item",
  "mission",
  "playbook",
  "project",
  "prompt",
  "prompt-version",
  "resource",
  "skill",
  "skill-version",
  "tag"
]);
export const COMMUNITY_AGENTSPACE_DENIED_RESOURCE_IDS = Object.freeze([
  "agent-run",
  "agent-run-event",
  "agent-session",
  "codex-chat-message",
  "codex-chat-setting",
  "codex-chat-thread",
  "project-member",
  "project-path",
  "workflow-definition",
  "workflow-instance",
  "workflow-step-run"
]);
export const COMMUNITY_AGENTSPACE_REVIEWED_UNCLASSIFIED_RESOURCE_IDS = Object.freeze([
  "kanban-board",
  "kanban-column",
  "sprint",
  "sprint-item",
  "task",
  "task-comment"
]);
export const COMMUNITY_AGENTSPACE_DENIED_OPERATION_IDS = Object.freeze([
  "project.delete-cascade",
  "skill-version.export-skill-package",
  "skill-version.import-skill-package",
  "skill-version.materialize-skill-package"
]);
export const COMMUNITY_AGENTSPACE_ALLOWED_OPERATION_IDS = Object.freeze([
  "activity-item.add-activity-item",
  "activity-item.get-by-id",
  "activity-item.list-activity-items",
  "agent-profile.create",
  "agent-profile.delete",
  "agent-profile.get-by-id",
  "agent-profile.list",
  "agent-profile.update",
  "artifact-link.create",
  "artifact-link.get-by-id",
  "artifact-link.link-artifact",
  "artifact-link.list-artifact-links",
  "artifact.create",
  "artifact.get-artifact",
  "artifact.get-by-id",
  "artifact.link-artifact",
  "artifact.list-artifacts",
  "artifact.list-artifacts-by-ref",
  "artifact.remove-artifact",
  "artifact.store-artifact",
  "chat-binding.add",
  "chat-binding.remove",
  "chat-member.add",
  "chat-member.remove",
  "chat-member.update",
  "chat-message.list",
  "chat-message.send",
  "chat-room.archive",
  "chat-room.create",
  "chat-room.export-manifest",
  "chat-room.get-by-id",
  "chat-room.list",
  "chat-room.open-dm",
  "chat-room.update",
  "chat.catchup",
  "chat.mark-read",
  "discussion-output.set",
  "discussion-topic.abandon",
  "discussion-topic.conclude",
  "discussion-topic.create",
  "discussion-topic.get",
  "discussion-topic.list",
  "discussion-topic.status",
  "discussion-turn.add",
  "experience-item.add-experience-item",
  "experience-item.create",
  "experience-item.get-by-id",
  "experience-item.get-experience-item",
  "experience-item.list-experience-items",
  "experience-item.remove-experience-item",
  "experience-item.update-experience-item",
  "memory-item.add-memory-item",
  "memory-item.build-resume-pack",
  "memory-item.build-synopsis",
  "memory-item.create",
  "memory-item.get-by-id",
  "memory-item.list-memory-items",
  "memory-item.promote-from-experience",
  "memory-item.remove-memory-item",
  "memory-item.search-memory-items",
  "memory-item.set-memory-importance",
  "memory-item.update-memory-item",
  "mission.create",
  "mission.delete",
  "mission.get",
  "mission.list",
  "mission.resume",
  "mission.update",
  "playbook.list",
  "project.archive-project",
  "project.create",
  "project.get-by-id",
  "project.get-project",
  "project.list-projects",
  "project.remove-project",
  "project.set-project-type",
  "project.set-project-visibility",
  "project.update-project",
  "prompt-version.create",
  "prompt-version.get-by-id",
  "prompt-version.get-prompt-version",
  "prompt-version.list-prompt-versions",
  "prompt-version.publish-prompt-version",
  "prompt-version.remove-prompt-version",
  "prompt-version.update-prompt-version",
  "prompt.create",
  "prompt.get-by-id",
  "prompt.get-prompt",
  "prompt.list-prompts",
  "prompt.remove-prompt",
  "prompt.update-prompt",
  "resource.create",
  "resource.create-resource",
  "resource.get-by-id",
  "resource.get-resource",
  "resource.list-resources",
  "resource.remove-resource",
  "resource.update-resource",
  "skill-version.create",
  "skill-version.get-by-id",
  "skill-version.get-skill-version",
  "skill-version.list-skill-versions",
  "skill-version.publish-skill-version",
  "skill-version.remove-skill-version",
  "skill-version.update-skill-version",
  "skill.create",
  "skill.get-by-id",
  "skill.get-skill",
  "skill.list-skills",
  "skill.remove-skill",
  "skill.update-skill",
  "tag.create",
  "tag.ensure-tags",
  "tag.get-by-id",
  "tag.list-tags",
  "tag.search-tags"
]);

const EXPECTED_SOURCE_OPERATION_COUNT = 173;
const ALLOWED_RESOURCE_SET = new Set(COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS);
const DENIED_RESOURCE_SET = new Set(COMMUNITY_AGENTSPACE_DENIED_RESOURCE_IDS);
const DENIED_OPERATION_SET = new Set(COMMUNITY_AGENTSPACE_DENIED_OPERATION_IDS);
const ALLOWED_OPERATION_SET = new Set(COMMUNITY_AGENTSPACE_ALLOWED_OPERATION_IDS);
const COMMUNITY_DOMAIN_DESCRIPTION = "Community context services for projects, prompts, skills, memory, rooms, discussions, missions, playbooks, experiences, resources, artifacts, profiles, tags, and activity items.";
const COMMUNITY_DOMAIN_DOCS = Object.freeze({"summary":"Manage the reviewed Community Agentspace surface for projects, reusable context, coordination rooms, discussions, missions, and activity records.","notes":["This Community projection is an exact operation and schema allowlist.","Filesystem skill package import, export, and materialization are not exposed.","Project cascade deletion and private runtime/session records are not exposed."]});
const normalizeId = (value) => String(value ?? '').trim().toLowerCase();
const codepointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sorted = (values) => [...values].sort(codepointCompare);
const toRecord = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function exactSet(label, actual, expected) {
  const left = sorted(actual.map(normalizeId).filter(Boolean));
  const right = sorted(expected.map(normalizeId).filter(Boolean));
  if (new Set(left).size !== left.length || new Set(right).size !== right.length || left.length !== right.length || !left.every((value, index) => value === right[index])) {
    throw new Error('community_agentspace_set_mismatch:' + label + ':expected=' + right.join(',') + ':actual=' + left.join(','));
  }
}

function resolveResourceId(operation) {
  for (const tag of Array.isArray(operation?.tags) ? operation.tags : []) {
    const normalized = normalizeId(tag);
    if (normalized.startsWith('resource:')) return normalizeId(normalized.slice('resource:'.length));
  }
  return normalizeId(operation?.resourceId ?? operation?.serviceEntity);
}

const decodePointerToken = (value) => String(value).replace(/~1/g, '/').replace(/~0/g, '~');
function resolveTopLevelSchemaRef(value, available) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (available.has(raw)) return raw;
  for (const prefix of ['#/contracts/schemas/', '#/components/schemas/']) {
    if (!raw.startsWith(prefix)) continue;
    const name = decodePointerToken(raw.slice(prefix.length));
    if (!available.has(name)) throw new Error('community_agentspace_schema_ref_missing:' + name);
    return name;
  }
  if (raw.startsWith('#/')) return null;
  throw new Error('community_agentspace_external_schema_ref_forbidden:' + raw);
}
function collectSchemaRefs(value, available, output) {
  if (Array.isArray(value)) { for (const item of value) collectSchemaRefs(item, available, output); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref') { const name = resolveTopLevelSchemaRef(child, available); if (name) output.add(name); continue; }
    collectSchemaRefs(child, available, output);
  }
}
function projectSchemas(operations, contracts) {
  const sourceSchemas = toRecord(toRecord(contracts).schemas);
  const available = new Set(Object.keys(sourceSchemas));
  const retained = new Set();
  for (const operation of operations) {
    for (const ref of [operation?.inputSchemaRef, operation?.outputSchemaRef]) {
      const name = typeof ref === 'string' ? ref.trim() : '';
      if (!name) continue;
      if (!available.has(name)) throw new Error('community_agentspace_operation_schema_missing:' + operation.operationId + ':' + name);
      retained.add(name);
    }
  }
  const queue = [...retained];
  for (let index = 0; index < queue.length; index += 1) {
    const discovered = new Set();
    collectSchemaRefs(sourceSchemas[queue[index]], available, discovered);
    for (const name of discovered) { if (!retained.has(name)) { retained.add(name); queue.push(name); } }
  }
  const names = sorted(retained);
  return { names, schemas: Object.fromEntries(names.map((name) => [name, sourceSchemas[name]])) };
}
function routeList(value) { return Array.isArray(value) ? value : (Array.isArray(value?.routes) ? value.routes : []); }
function routeSignature(route) {
  const signature = { id: String(route?.id ?? '').trim(), method: String(route?.method ?? '').trim().toUpperCase(), pattern: String(route?.pattern ?? '').trim(), operation: normalizeId(route?.operation) };
  if (Object.values(signature).some((value) => !value)) throw new Error('community_agentspace_route_signature_invalid');
  return signature;
}
function exactRoutes(label, actualRoutes, expectedRoutes) {
  const actual = sorted(actualRoutes.map((route) => JSON.stringify(routeSignature(route))));
  const expected = sorted(expectedRoutes.map((route) => JSON.stringify(routeSignature(route))));
  if (new Set(actual).size !== actual.length || new Set(expected).size !== expected.length || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) throw new Error('community_agentspace_route_signature_mismatch:' + label);
}

export function inspectCommunityAgentspaceProjection(manifest) {
  const operations = Array.isArray(manifest?.capabilities?.operations) ? manifest.capabilities.operations : [];
  const resources = Array.isArray(manifest?.capabilities?.resources) ? manifest.capabilities.resources : [];
  const sourceOperationIds = operations.map((operation) => normalizeId(operation?.operationId));
  if (sourceOperationIds.some((operationId) => !operationId) || new Set(sourceOperationIds).size !== sourceOperationIds.length) throw new Error('community_agentspace_manifest_operation_identity_invalid');
  const declaredResourceIds = resources.map((resource) => normalizeId(resource?.resourceId));
  if (declaredResourceIds.some((resourceId) => !resourceId) || new Set(declaredResourceIds).size !== declaredResourceIds.length) throw new Error('community_agentspace_manifest_resource_identity_invalid');
  const policyOperationIds = Object.keys(toRecord(manifest?.policies?.operations)).map(normalizeId);
  const docsOperationIds = Object.keys(toRecord(manifest?.docs?.operations)).map(normalizeId);
  const docsResourceIds = Object.keys(toRecord(manifest?.docs?.resources)).map(normalizeId);
  const rows = operations.map((operation) => ({ operation, operationId: normalizeId(operation.operationId), resourceId: resolveResourceId(operation) }));
  const projectedRows = rows.filter((row) => ALLOWED_OPERATION_SET.has(row.operationId) && ALLOWED_RESOURCE_SET.has(row.resourceId) && !DENIED_OPERATION_SET.has(row.operationId));
  const projectedOperationIds = sorted(projectedRows.map((row) => row.operationId));
  const projectedResourceIds = sorted(new Set(projectedRows.map((row) => row.resourceId)));
  const missingAllowedOperationIds = sorted(COMMUNITY_AGENTSPACE_ALLOWED_OPERATION_IDS.filter((operationId) => !projectedOperationIds.includes(operationId)));
  const unreviewedOperationIds = sorted(rows.filter((row) => ALLOWED_RESOURCE_SET.has(row.resourceId) && !ALLOWED_OPERATION_SET.has(row.operationId) && !DENIED_OPERATION_SET.has(row.operationId)).map((row) => row.operationId));
  const deniedOperationIds = sorted(rows.filter((row) => DENIED_OPERATION_SET.has(row.operationId)).map((row) => row.operationId));
  const deniedResourceIds = sorted(new Set(rows.filter((row) => DENIED_RESOURCE_SET.has(row.resourceId)).map((row) => row.resourceId)));
  const unclassifiedResourceIds = sorted(new Set(rows.filter((row) => row.resourceId && !ALLOWED_RESOURCE_SET.has(row.resourceId) && !DENIED_RESOURCE_SET.has(row.resourceId)).map((row) => row.resourceId)));
  return {
    sourceOperationIds: sorted(sourceOperationIds),
    sourceResourceIds: sorted(new Set(rows.map((row) => row.resourceId).filter(Boolean))),
    declaredResourceIds: sorted(declaredResourceIds), policyOperationIds: sorted(policyOperationIds), docsOperationIds: sorted(docsOperationIds), docsResourceIds: sorted(docsResourceIds),
    projectedOperationIds, projectedResourceIds, missingAllowedOperationIds, unreviewedOperationIds, deniedOperationIds, deniedResourceIds, unclassifiedResourceIds,
  };
}

function assertReviewedInventory(inventory) {
  if (inventory.sourceOperationIds.length !== EXPECTED_SOURCE_OPERATION_COUNT) throw new Error('community_agentspace_source_operation_count_drift:' + inventory.sourceOperationIds.length);
  exactSet('source_resources', inventory.sourceResourceIds, [...COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS, ...COMMUNITY_AGENTSPACE_DENIED_RESOURCE_IDS]);
  exactSet('declared_resources', inventory.declaredResourceIds, inventory.sourceResourceIds);
  exactSet('docs_operations', inventory.docsOperationIds, inventory.sourceOperationIds);
  exactSet('docs_resources', inventory.docsResourceIds, inventory.sourceResourceIds);
  const sourceOperationSet = new Set(inventory.sourceOperationIds);
  const unknownPolicyOperationIds = inventory.policyOperationIds.filter((operationId) => !sourceOperationSet.has(operationId));
  if (unknownPolicyOperationIds.length > 0) throw new Error('community_agentspace_unknown_policy_operations:' + unknownPolicyOperationIds.join(','));
  exactSet('projected_operations', inventory.projectedOperationIds, COMMUNITY_AGENTSPACE_ALLOWED_OPERATION_IDS);
  exactSet('projected_resources', inventory.projectedResourceIds, COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS);
  exactSet('denied_operations', inventory.deniedOperationIds, COMMUNITY_AGENTSPACE_DENIED_OPERATION_IDS);
  exactSet('denied_resources', inventory.deniedResourceIds, COMMUNITY_AGENTSPACE_DENIED_RESOURCE_IDS);
  exactSet('unclassified_resources', inventory.unclassifiedResourceIds, []);
  if (inventory.missingAllowedOperationIds.length > 0) throw new Error('community_agentspace_missing_allowed_operations:' + inventory.missingAllowedOperationIds.join(','));
  if (inventory.unreviewedOperationIds.length > 0) throw new Error('community_agentspace_unreviewed_operations:' + inventory.unreviewedOperationIds.join(','));
}

function filterRecord(value, allowedIds) {
  const allowed = new Set(allowedIds);
  return Object.fromEntries(Object.entries(toRecord(value)).filter(([id]) => allowed.has(normalizeId(id))));
}

export function filterCommunityAgentspaceManifest(manifest) {
  const inventory = inspectCommunityAgentspaceProjection(manifest);
  assertReviewedInventory(inventory);
  const source = toRecord(manifest);
  const capabilities = toRecord(source.capabilities);
  const operations = (Array.isArray(capabilities.operations) ? capabilities.operations : []).filter((operation) => ALLOWED_OPERATION_SET.has(normalizeId(operation?.operationId)));
  const allowedResources = new Set(COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS);
  const resources = (Array.isArray(capabilities.resources) ? capabilities.resources : []).filter((resource) => allowedResources.has(normalizeId(resource?.resourceId)));
  const policies = toRecord(source.policies);
  const docs = toRecord(source.docs);
  const contracts = toRecord(source.contracts);
  const schemaProjection = projectSchemas(operations, contracts);
  return {
    ...source,
    domain: { ...toRecord(source.domain), displayName: 'Agentspace Community', description: COMMUNITY_DOMAIN_DESCRIPTION },
    capabilities: { ...capabilities, operations, resources },
    contracts: { ...contracts, schemas: schemaProjection.schemas },
    ...(Object.keys(policies).length > 0 ? { policies: { ...policies, operations: filterRecord(policies.operations, COMMUNITY_AGENTSPACE_ALLOWED_OPERATION_IDS) } } : {}),
    ...(Object.keys(docs).length > 0 ? { docs: { ...docs, domain: structuredClone(COMMUNITY_DOMAIN_DOCS), resources: filterRecord(docs.resources, COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS), operations: filterRecord(docs.operations, COMMUNITY_AGENTSPACE_ALLOWED_OPERATION_IDS) } } : {}),
  };
}

export function filterCommunityAgentspaceHostRouteProjection(routeProjection, { expectedSourceOperationIds, expectedSourceRoutes } = {}) {
  const sourceRoutes = routeList(routeProjection);
  const sourceOperationIds = sourceRoutes.map((route) => normalizeId(route?.operation));
  if (sourceOperationIds.some((operationId) => !operationId) || new Set(sourceOperationIds).size !== sourceOperationIds.length) throw new Error('community_agentspace_route_operation_identity_invalid');
  if (expectedSourceRoutes) exactRoutes('source_routes', sourceRoutes, routeList(expectedSourceRoutes));
  else if (expectedSourceOperationIds) exactSet('route_source_operations', sourceOperationIds, expectedSourceOperationIds);
  else if (sourceOperationIds.length !== EXPECTED_SOURCE_OPERATION_COUNT) throw new Error('community_agentspace_route_source_count_drift:' + sourceOperationIds.length);
  const routes = sourceRoutes.filter((route) => ALLOWED_OPERATION_SET.has(normalizeId(route.operation)));
  exactSet('route_projected_operations', routes.map((route) => route.operation), COMMUNITY_AGENTSPACE_ALLOWED_OPERATION_IDS);
  return Array.isArray(routeProjection) ? routes : { ...toRecord(routeProjection), routes };
}

export function buildCommunityAgentspaceProjection(options = {}) {
  const manifestOptions = { ...options, includeDocs: true };
  const sourceManifest = buildBaseAgentspaceDomainCapabilityManifest(manifestOptions);
  const inventory = inspectCommunityAgentspaceProjection(sourceManifest);
  const manifest = filterCommunityAgentspaceManifest(sourceManifest);
  const sourceRoutes = buildBaseAgentspaceHostRouteProjection({ refresh: options.refresh });
  const routes = filterCommunityAgentspaceHostRouteProjection(
    sourceRoutes,
    { expectedSourceOperationIds: inventory.sourceOperationIds },
  );
  return {
    manifest, routes,
    operationIds: [...COMMUNITY_AGENTSPACE_ALLOWED_OPERATION_IDS],
    resourceIds: [...COMMUNITY_AGENTSPACE_ALLOWED_RESOURCE_IDS],
    sourceOperationIds: [...inventory.sourceOperationIds],
    sourceRoutes,
    unclassifiedResourceIds: [...inventory.unclassifiedResourceIds],
  };
}

export function buildCommunityAgentspaceDomainCapabilityManifest(options = {}) {
  return buildCommunityAgentspaceProjection(options).manifest;
}

export function buildCommunityAgentspaceHostRouteProjection(options = {}) {
  return buildCommunityAgentspaceProjection(options).routes;
}

export const buildAgentspaceDomainCapabilityManifest = buildCommunityAgentspaceDomainCapabilityManifest;
export const buildAgentspaceHostRouteProjection = buildCommunityAgentspaceHostRouteProjection;
