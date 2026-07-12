import type { AgentspaceKitContext } from '../domain-services/types.js';

export async function serviceCallSample(
  kit: { getAll: (ctx?: Partial<AgentspaceKitContext>) => Promise<Record<string, unknown>> },
  payload: Record<string, unknown>,
  overrides?: Partial<AgentspaceKitContext>,
) {
  const services = await kit.getAll(overrides);
  //==> custom service call: sample <==//
  return { ok: true, payload, services };
}
