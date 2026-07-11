import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { okResult } from "$lib/server/xf-result";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.principal) {
    return json({ ok: false, error: "trusted_local_principal_missing" }, { status: 500 });
  }
  return json(okResult({
    principal: locals.principal,
    tenantId: locals.tenantId,
    authProvider: "trusted-local",
    authRequired: false
  }));
};
