import type { DocmanKitServices } from './types.js';

/**
 * Metrics placeholder. İsterseniz Prometheus benzeri çıktı üretmek için genişletin.
 */
export function renderDocmanKitMetrics(_services: Partial<DocmanKitServices>): string {
  //==> custom metrics renderer <==//
  return '# DocmanKit metrics not implemented';
}

