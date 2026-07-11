// @ts-nocheck
const DOCMAN_CRUD_ENTITIES = Object.freeze([
  'document',
  'document-group',
  'document-version',
  'section',
  'page',
  'page-version',
  'document-section-link',
  'section-page-link',
  'snippet',
  'page-snippet-link',
  'asset',
  'asset-version',
  'embed',
  'page-embed-link',
]);

const DOCMAN_CRUD_KINDS = Object.freeze(['list', 'get', 'create', 'update', 'delete']);

const DOCMAN_CUSTOM_OPERATION_IDS = Object.freeze([
  'document.delete.safe',
  'document-version.delete.safe',
  'document-version.import-headings',
  'document-version.set-current',
  'document.compose.index',
  'document.index.build',
  'document.index.get',
  'document.summary.build',
  'document.summary.get',
  'document.search',
  'document.scope.search',
  'document.answer-pack',
  'document.compose.fetch',
  'document.publish.materialize',
  'document-section-link.usage.list',
]);

const DOCMAN_ALLOWED_OPERATION_IDS = Object.freeze([
  ...DOCMAN_CRUD_ENTITIES.flatMap((entity) => DOCMAN_CRUD_KINDS.map((kind) => `${entity}.${kind}`)),
  ...DOCMAN_CUSTOM_OPERATION_IDS,
]);

const SECTION_CONTENT_FIELDS = Object.freeze([
  'description',
  'descriptionMl',
  'summary',
  'releaseNotes',
  'releaseNotesMl',
  'status',
  'intro',
  'directives',
  'meta',
]);

function toRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeNonEmpty(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function stripKeys(record, keys) {
  const next = { ...toRecord(record) };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

function inferDocumentLinkKind(link) {
  const record = toRecord(link);
  const kind = normalizeNonEmpty(record.kind).toLowerCase();
  if (kind === 'section' || kind === 'page') return kind;
  if (normalizeNonEmpty(record.pageVersionId)) return 'page';
  if (normalizeNonEmpty(record.sectionId)) return 'section';
  return '';
}

function toDepth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function getDocumentLinkIdentity(record) {
  const row = toRecord(record);
  return normalizeNonEmpty(row.id) || normalizeNonEmpty(row.linkId);
}

function toAllowedRouteList(routeProjection) {
  const rawRoutes = Array.isArray(routeProjection)
    ? routeProjection
    : Array.isArray(routeProjection?.routes)
      ? routeProjection.routes
      : [];
  return rawRoutes.filter((route) => isDocmanOperationAllowed(route?.operation));
}

function sanitizeSectionPayload(record, field) {
  const input = toRecord(record);
  return {
    ...input,
    [field]: stripKeys(input[field], SECTION_CONTENT_FIELDS),
  };
}

function sanitizeSectionPageLinkPayload(record, field) {
  const input = toRecord(record);
  const data = { ...toRecord(input[field]) };
  const sectionId = normalizeNonEmpty(data.sectionId);
  const parentLinkId = normalizeNonEmpty(data.parentLinkId);

  if (parentLinkId) {
    throw new Error('Pages cannot be nested under another page.');
  }

  if (sectionId) {
    data.sectionId = sectionId;
  }
  delete data.parentLinkId;
  delete data.depth;

  return {
    ...input,
    [field]: data,
  };
}

async function sanitizeDocumentSectionLinkCreateInput(record, loadDocumentLinkById) {
  const input = toRecord(record);
  const data = { ...toRecord(input.data) };
  const kind = inferDocumentLinkKind(data);
  const parentLinkId = normalizeNonEmpty(data.parentLinkId);

  let parentLink = null;
  if (parentLinkId) {
    if (typeof loadDocumentLinkById !== 'function') {
      throw new Error('docman_parent_lookup_unavailable');
    }
    parentLink = await loadDocumentLinkById(parentLinkId);
    if (!parentLink?.id) {
      throw new Error('Selected parent section could not be resolved.');
    }
    if (inferDocumentLinkKind(parentLink) !== 'section') {
      throw new Error(
        kind === 'page'
          ? 'Pages cannot be nested under another page.'
          : 'Sections can only be nested under other sections.'
      );
    }
  }

  delete data.depth;
  if (parentLinkId) {
    data.parentLinkId = parentLinkId;
    data.depth = toDepth(parentLink?.depth) + 1;
  } else {
    delete data.parentLinkId;
    data.depth = 0;
  }

  return {
    ...input,
    data,
  };
}

async function sanitizeDocumentSectionLinkUpdateInput(record, loadDocumentLinkById) {
  const input = toRecord(record);
  const patch = { ...toRecord(input.patch) };
  const hasParentUpdate = hasOwn(patch, 'parentLinkId');

  if (!hasParentUpdate) {
    delete patch.depth;
    return {
      ...input,
      patch,
    };
  }

  const currentLinkId = normalizeNonEmpty(input.id);
  if (!currentLinkId) {
    throw new Error('Document structure link id is required.');
  }

  if (typeof loadDocumentLinkById !== 'function') {
    throw new Error('docman_parent_lookup_unavailable');
  }

  const currentLink = await loadDocumentLinkById(currentLinkId);
  if (!currentLink?.id) {
    throw new Error('Document structure link could not be resolved.');
  }

  const nextKind = inferDocumentLinkKind({ ...currentLink, ...patch });
  const parentLinkId = normalizeNonEmpty(patch.parentLinkId);

  let parentLink = null;
  if (parentLinkId) {
    parentLink = await loadDocumentLinkById(parentLinkId);
    if (!parentLink?.id) {
      throw new Error('Selected parent section could not be resolved.');
    }
    if (inferDocumentLinkKind(parentLink) !== 'section') {
      throw new Error(
        nextKind === 'page'
          ? 'Pages cannot be nested under another page.'
          : 'Sections can only be nested under other sections.'
      );
    }
  }

  patch.parentLinkId = parentLinkId || null;
  patch.depth = parentLinkId ? toDepth(parentLink?.depth) + 1 : 0;

  return {
    ...input,
    patch,
  };
}

function sanitizeSectionRecord(record) {
  return stripKeys(record, SECTION_CONTENT_FIELDS);
}

function sanitizeSectionPageLinkRecord(record) {
  const item = { ...toRecord(record) };
  const sectionId = normalizeNonEmpty(item.sectionId);
  if (sectionId) {
    item.sectionId = sectionId;
  }
  delete item.parentLinkId;
  item.depth = 0;
  return item;
}

function sanitizeOutputShape(output, sanitizer) {
  if (Array.isArray(output)) {
    return output.map((item) => sanitizer(item));
  }

  const record = toRecord(output);
  if (Array.isArray(record.items)) {
    return {
      ...record,
      items: record.items.map((item) => sanitizer(item)),
    };
  }
  if (record.item && typeof record.item === 'object') {
    return {
      ...record,
      item: sanitizer(record.item),
    };
  }
  if (Object.keys(record).length > 0) {
    return sanitizer(record);
  }
  return output;
}

function normalizePageParentsToSections(items = []) {
  const rows = Array.isArray(items) ? items.map((item) => ({ ...toRecord(item) })) : [];
  const byId = new Map();
  rows.forEach((row) => {
    const id = getDocumentLinkIdentity(row);
    if (id) byId.set(id, row);
  });

  const resolveSectionAncestor = (row) => {
    let parentLinkId = normalizeNonEmpty(row.parentLinkId);
    while (parentLinkId) {
      const parent = byId.get(parentLinkId);
      if (!parent) return null;
      if (inferDocumentLinkKind(parent) === 'section') {
        return parent;
      }
      parentLinkId = normalizeNonEmpty(parent.parentLinkId);
    }
    return null;
  };

  return rows.map((row) => {
    if (inferDocumentLinkKind(row) !== 'page') return row;
    const sectionParent = resolveSectionAncestor(row);
    if (!sectionParent) {
      delete row.parentLinkId;
      row.depth = 0;
      return row;
    }
    row.parentLinkId = getDocumentLinkIdentity(sectionParent) || undefined;
    row.depth = toDepth(sectionParent.depth) + 1;
    return row;
  });
}

function sanitizeDocumentComposeIndex(output) {
  const record = toRecord(output);
  if (!Array.isArray(record.items)) return output;
  return {
    ...record,
    items: normalizePageParentsToSections(record.items),
  };
}

export function getAllowedDocmanOperationIds() {
  return [...DOCMAN_ALLOWED_OPERATION_IDS];
}

export function isDocmanOperationAllowed(operationId) {
  const normalized = normalizeNonEmpty(operationId).toLowerCase();
  if (!normalized) return false;
  return DOCMAN_ALLOWED_OPERATION_IDS.includes(normalized);
}

function resolveDocmanResourceId(operation) {
  const record = toRecord(operation);
  const tags = Array.isArray(record.tags) ? record.tags : [];
  const resourceTag = tags.find((tag) => normalizeNonEmpty(tag).toLowerCase().startsWith('resource:'));
  if (resourceTag) {
    return normalizeNonEmpty(resourceTag.slice('resource:'.length)).toLowerCase();
  }
  const operationId = normalizeNonEmpty(record.operationId).toLowerCase();
  const [prefix, second] = operationId.split('.');
  return normalizeNonEmpty(second || prefix).toLowerCase();
}

export function filterDocmanManifest(manifest) {
  const record = toRecord(manifest);
  const capabilities = toRecord(record.capabilities);
  const operations = Array.isArray(capabilities.operations)
    ? capabilities.operations.filter((operation) => isDocmanOperationAllowed(operation?.operationId))
    : [];
  const allowedResourceIds = new Set(
    operations.map((operation) => resolveDocmanResourceId(operation)).filter(Boolean)
  );
  const resources = Array.isArray(capabilities.resources)
    ? capabilities.resources.filter((resource) => allowedResourceIds.has(normalizeNonEmpty(resource?.resourceId).toLowerCase()))
    : [];
  const docs = toRecord(record.docs);
  const operationsDocMap = toRecord(docs.operations);
  const resourcesDocMap = toRecord(docs.resources);
  const filteredDocEntries = Object.fromEntries(
    Object.entries(operationsDocMap).filter(([operationId]) => isDocmanOperationAllowed(operationId))
  );
  const filteredResourceEntries = Object.fromEntries(
    Object.entries(resourcesDocMap).filter(([resourceId]) => allowedResourceIds.has(normalizeNonEmpty(resourceId).toLowerCase()))
  );

  return {
    ...record,
    capabilities: {
      ...capabilities,
      operations,
      ...(resources.length > 0 ? { resources } : {}),
    },
    docs: {
      ...docs,
      ...(Object.keys(filteredResourceEntries).length > 0 ? { resources: filteredResourceEntries } : {}),
      operations: filteredDocEntries,
    },
  };
}

export function filterDocmanHostRouteProjection(routeProjection) {
  const routes = toAllowedRouteList(routeProjection);
  if (Array.isArray(routeProjection)) return routes;
  return {
    ...toRecord(routeProjection),
    routes,
  };
}

export async function sanitizeDocmanOperationInput(
  operationId,
  input,
  { loadDocumentLinkById } = {},
) {
  const normalizedOperationId = normalizeNonEmpty(operationId).toLowerCase();

  if (normalizedOperationId === 'section.create') {
    return sanitizeSectionPayload(input, 'data');
  }
  if (normalizedOperationId === 'section.update') {
    return sanitizeSectionPayload(input, 'patch');
  }
  if (normalizedOperationId === 'document-section-link.create') {
    return sanitizeDocumentSectionLinkCreateInput(input, loadDocumentLinkById);
  }
  if (normalizedOperationId === 'document-section-link.update') {
    return sanitizeDocumentSectionLinkUpdateInput(input, loadDocumentLinkById);
  }
  if (normalizedOperationId === 'section-page-link.create') {
    return sanitizeSectionPageLinkPayload(input, 'data');
  }
  if (normalizedOperationId === 'section-page-link.update') {
    return sanitizeSectionPageLinkPayload(input, 'patch');
  }

  return input;
}

export function sanitizeDocmanOperationOutput(operationId, output) {
  const normalizedOperationId = normalizeNonEmpty(operationId).toLowerCase();

  if (
    normalizedOperationId === 'section.list' ||
    normalizedOperationId === 'section.get' ||
    normalizedOperationId === 'section.create' ||
    normalizedOperationId === 'section.update'
  ) {
    return sanitizeOutputShape(output, sanitizeSectionRecord);
  }

  if (normalizedOperationId === 'document-section-link.list') {
    const sanitized = sanitizeOutputShape(output, (item) => item);
    if (Array.isArray(sanitized)) {
      return normalizePageParentsToSections(sanitized);
    }
    if (Array.isArray(sanitized?.items)) {
      return {
        ...sanitized,
        items: normalizePageParentsToSections(sanitized.items),
      };
    }
    return sanitized;
  }

  if (normalizedOperationId === 'document.compose.index') {
    return sanitizeDocumentComposeIndex(output);
  }

  if (
    normalizedOperationId === 'section-page-link.list' ||
    normalizedOperationId === 'section-page-link.create' ||
    normalizedOperationId === 'section-page-link.update'
  ) {
    return sanitizeOutputShape(output, sanitizeSectionPageLinkRecord);
  }

  return output;
}
