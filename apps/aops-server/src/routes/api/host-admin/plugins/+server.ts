import { json, type RequestHandler } from "@sveltejs/kit";

import {
  areHostAdminPluginDiagnosticsEnabled,
  readHostAdminPluginsSnapshot
} from "$lib/server/host-admin/plugins";

export const GET: RequestHandler = async ({ url }) => {
  if (url.search) {
    return json({ ok: false, error: "community_host_admin_query_forbidden" }, { status: 400 });
  }
  if (!areHostAdminPluginDiagnosticsEnabled()) {
    return json({ ok: false, error: "diagnostics_disabled" }, { status: 403 });
  }
  try {
    return json({ ok: true, ...(await readHostAdminPluginsSnapshot()) }, { status: 200 });
  } catch {
    return json({ ok: false, error: "bootstrap_diagnostics_failed" }, { status: 500 });
  }
};
