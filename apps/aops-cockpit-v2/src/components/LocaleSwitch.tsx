import type { AopsCockpitLocale, AopsCockpitTranslationKey } from "../lib/i18n";

const LOCALES: { id: AopsCockpitLocale; label: string }[] = [
  { id: "tr", label: "TR" },
  { id: "en", label: "EN" }
];

/**
 * Header-right TR/EN locale switch (aops-cockpit parity). Shares the
 * `.eops-segmented` reference utility with the section switch.
 */
export function LocaleSwitch({
  value,
  onChange,
  t
}: {
  value: AopsCockpitLocale;
  onChange: (next: AopsCockpitLocale) => void;
  t: (key: AopsCockpitTranslationKey) => string;
}) {
  return (
    <div className="eops-segmented cockpit-locale" role="group" aria-label={t("a11yLocaleSwitch")}>
      {LOCALES.map((loc) => (
        <button
          key={loc.id}
          type="button"
          className="eops-segmented-item"
          aria-pressed={value === loc.id}
          onClick={() => onChange(loc.id)}
        >
          {loc.label}
        </button>
      ))}
    </div>
  );
}
