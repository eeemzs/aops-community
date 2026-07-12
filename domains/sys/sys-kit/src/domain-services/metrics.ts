import type { SysKitServices } from './types.js';

/**
 * Metrics placeholder. İsterseniz Prometheus benzeri çıktı üretmek için genişletin.
 */
export function renderSysKitMetrics(_services: Partial<SysKitServices>): string {
  //==> custom metrics renderer <==//
  return '# SysKit metrics not implemented';
}
