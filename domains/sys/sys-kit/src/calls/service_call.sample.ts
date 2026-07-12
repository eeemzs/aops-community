import type { SysKitContext } from '../domain-services/types.js';

export async function serviceCallSample(
  kit: { getAll: (ctx?: Partial<SysKitContext>) => Promise<Record<string, unknown>> },
  payload: Record<string, unknown>,
  overrides?: Partial<SysKitContext>,
) {
  const services = await kit.getAll(overrides);
  //==> custom service call: sample <==//
  return { ok: true, payload, services };
}
