import { DESKTOP_SHELL_ICONS } from "@aopslab/xf-ui-shell-react";
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
    <div className="cockpit-authbar" title={label} aria-label={label} role="status">
      <span className="cockpit-authbar__icon" aria-hidden="true">
        {DESKTOP_SHELL_ICONS.user}
        <span className="cockpit-authbar__dot is-active" />
      </span>
      <span className="cockpit-authbar__status">{t("authProviderTrusted")}</span>
    </div>
  );
}
