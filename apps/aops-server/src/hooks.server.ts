import type { Handle } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";

const TRUSTED_LOCAL_PRINCIPAL = Object.freeze({
  userId: "00000000-0000-4000-8000-000000000001",
  fullName: "AOPS Local Operator",
  roles: ["admin"],
  permissions: ["*"]
});
const TRUSTED_LOCAL_TENANT_ID = "123e4567-e89b-41d4-a000-000000000001";

export function isCommunityLoopbackClientAddress(value: unknown): boolean {
  const address = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (address === "::1") return true;
  const ipv4 = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  const match = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ipv4);
  if (!match) return false;
  return match.slice(1).every((octet) => Number(octet) <= 255);
}

function loopbackDenied(pathname: string): Response {
  if (pathname.startsWith("/api") || pathname.endsWith(".json")) {
    return json(
      { ok: false, error: "trusted_local_loopback_required" },
      { status: 403 }
    );
  }
  return new Response("trusted_local_loopback_required", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  let clientAddress = "";
  try {
    clientAddress = event.getClientAddress();
  } catch {
    return loopbackDenied(event.url.pathname);
  }
  if (!isCommunityLoopbackClientAddress(clientAddress)) {
    return loopbackDenied(event.url.pathname);
  }

  event.locals.tenantId = TRUSTED_LOCAL_TENANT_ID;
  event.locals.locale = "en";
  event.locals.fallbackLocale = "en";
  event.locals.authProvider = "trusted-local";
  event.locals.principal = TRUSTED_LOCAL_PRINCIPAL;

  const response = await resolve(event);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
};
