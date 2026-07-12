import type { AgentspaceKitServices } from './types.js';

/**
 * Metrics placeholder. İsterseniz Prometheus benzeri çıktı üretmek için genişletin.
 */
export function renderAgentspaceKitMetrics(_services: Partial<AgentspaceKitServices>): string {
  //==> custom metrics renderer <==//
  return '# AgentspaceKit metrics not implemented';
}
