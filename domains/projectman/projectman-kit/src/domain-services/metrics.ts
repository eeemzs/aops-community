import type { ProjectmanKitServices } from './types.js';

/**
 * Metrics placeholder. İsterseniz Prometheus benzeri çıktı üretmek için genişletin.
 */
export function renderProjectmanKitMetrics(_services: Partial<ProjectmanKitServices>): string {
  //==> custom metrics renderer <==//
  return '# ProjectmanKit metrics not implemented';
}
