export type AopsAuthProvider = "trusted-local";

const AUTH_PROVIDER: AopsAuthProvider = "trusted-local";

export function getAuthProvider(): AopsAuthProvider {
  return AUTH_PROVIDER;
}

export function isTrustedLocalAuthProvider(_authProvider: AopsAuthProvider = AUTH_PROVIDER): boolean {
  return true;
}

export function isInteractiveAuthProvider(_authProvider: AopsAuthProvider = AUTH_PROVIDER): boolean {
  return false;
}

export function authRequiresSession(_authProvider: AopsAuthProvider = AUTH_PROVIDER): boolean {
  return false;
}
