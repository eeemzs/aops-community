import {
  buildDocmanDomainCapabilityManifest as buildBaseDocmanDomainCapabilityManifest,
  buildDocmanHostRouteProjection as buildBaseDocmanHostRouteProjection,
} from '@aopslab/domain-kit-docman/operations';

import {
  filterDocmanHostRouteProjection,
  filterDocmanManifest,
  getAllowedDocmanOperationIds,
} from './docman-policy.mjs';

export function buildAopsDocmanDomainCapabilityManifest(options = {}) {
  return filterDocmanManifest(buildBaseDocmanDomainCapabilityManifest(options));
}

export function buildAopsDocmanHostRouteProjection(options = {}) {
  return filterDocmanHostRouteProjection(buildBaseDocmanHostRouteProjection(options));
}

export { getAllowedDocmanOperationIds };
