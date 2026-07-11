import { apiErrorMessage } from "../lib/aopsApi";
import type {
  AopsCockpitLocale,
  AopsCockpitTranslationKey
} from "../lib/i18n";

interface AuthGateProps {
  error: unknown;
  locale: AopsCockpitLocale;
  mode: "loading" | "error";
  serverBaseUrl: string;
  t: (key: AopsCockpitTranslationKey) => string;
  onRetry: () => void;
  onToggleLocale: () => void;
}

export function AuthGate({
  error,
  locale,
  mode,
  serverBaseUrl,
  t,
  onRetry,
  onToggleLocale
}: AuthGateProps) {
  const errorMessage = apiErrorMessage(error, "trusted_local_auth_failed");
  return (
    <main
      className="aops-auth-page"
      data-theme="light"
      data-accent="sage"
      aria-busy={mode === "loading"}
    >
      <section className="aops-auth-panel" aria-live="polite">
        <div className="aops-auth-brand">
          <span className="aops-auth-mark">{t("appShort")}</span>
          <div>
            <h1>{t("appTitle")}</h1>
            <p>{serverBaseUrl}</p>
          </div>
          <button
            type="button"
            className="aops-v2-icon-button aops-v2-locale-button"
            title={t("localeToggle")}
            onClick={onToggleLocale}
          >
            {locale.toUpperCase()}
          </button>
        </div>
        {mode === "loading" ? (
          <div className="aops-auth-state">
            <h2>{t("authCheckingTitle")}</h2>
            <p>{t("authCheckingMessage")}</p>
          </div>
        ) : (
          <div className="aops-auth-state" role="alert">
            <h2>{t("authErrorTitle")}</h2>
            <p>{errorMessage}</p>
            <button type="button" className="aops-v2-primary-button" onClick={onRetry}>
              {t("authRetry")}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
