import type { AopsCockpitTranslationKey } from "../lib/i18n";

export interface AuthBarPrincipal {
  fullName?: string | null;
  email?: string | null;
  userId?: string | null;
}

export function AuthBar({
  principal,
  t
}: {
  principal: AuthBarPrincipal;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  const label = principal.fullName || principal.email || principal.userId || t("unknownValue");
  return (
    <div className="cockpit-authbar" title={label}>
      <span className="cockpit-authbar__id">
        <span className="cockpit-authbar__dot" />
        {label}
      </span>
      <span className="aops-session-provider">{t("authProviderTrusted")}</span>
    </div>
  );
}
