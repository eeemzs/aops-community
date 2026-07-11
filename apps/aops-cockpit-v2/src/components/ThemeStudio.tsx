import { useState } from "react";
import {
  createCustomThemeFromTheme,
  createCustomThemeVariant,
  type ShellAppearanceAccentOption,
  type ShellThemeDefinition
} from "@aopslab/xf-ui-shell-react";
import type { AopsCockpitTranslationKey } from "../lib/i18n";

const MAX_VARIANTS = 3;
type ThemeMode = "light" | "dark";
type TFn = (key: AopsCockpitTranslationKey) => string;

export interface ThemeStudioProps {
  open: boolean;
  onClose: () => void;
  themeCatalog: ShellThemeDefinition[];
  activeThemeId: string;
  activeAccent: string;
  accentOptions: ShellAppearanceAccentOption[];
  theme: string; // light/dark mode
  customThemes: ShellThemeDefinition[];
  onSetThemeId: (id: string) => void;
  onSetAccent: (id: string) => void;
  onToggleTheme: () => void;
  onAddCustomTheme: (theme: ShellThemeDefinition) => void;
  onUpdateCustomTheme: (id: string, patch: Partial<ShellThemeDefinition>) => void;
  onDeleteCustomTheme: (id: string) => void;
  t: TFn;
}

/**
 * Theme Studio (eops-desktop parity) — overlay to pick a theme/mode/accent and
 * create / copy / edit / delete custom themes. Custom themes are stored on the
 * shell store (persisted) and applied automatically via the appearance snapshot
 * (AppShell.style). Built-in themes are read-only (copy, not edit).
 */
export function ThemeStudio(props: ThemeStudioProps) {
  const { open, onClose, themeCatalog, activeThemeId, activeAccent, accentOptions, theme, customThemes, onSetThemeId, onSetAccent, onToggleTheme, onAddCustomTheme, onUpdateCustomTheme, onDeleteCustomTheme, t } = props;
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!open) return null;

  const editing = editingId ? customThemes.find((theme) => theme.id === editingId) ?? null : null;

  const handleCreate = (base?: ShellThemeDefinition) => {
    const created = createCustomThemeFromTheme(base, customThemes, base ? `${base.name} Copy` : "New theme");
    onAddCustomTheme(created);
    onSetThemeId(created.id);
    setEditingId(created.id);
  };

  const handleDelete = (id: string) => {
    if (editingId === id) setEditingId(null);
    onDeleteCustomTheme(id);
  };

  return (
    <div className="cockpit-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("themeStudioTitle")} onClick={onClose}>
      <div className="cockpit-modal cockpit-themestudio" onClick={(e) => e.stopPropagation()}>
        <div className="cockpit-modal__head">
          <div>
            <h2>{t("themeStudioTitle")}</h2>
            <p>{t("themeStudioSubtitle")}</p>
          </div>
          <div className="cockpit-modal__head-actions">
            <button type="button" className="aops-v2-secondary-button" onClick={() => handleCreate()}>
              {t("themeStudioNew")}
            </button>
            <button type="button" className="cockpit-modal__close" onClick={onClose} aria-label={t("themeStudioClose")}>
              ×
            </button>
          </div>
        </div>

        <div className="cockpit-modal__body">
          {/* Mode + accent for the active theme */}
          <div className="cockpit-ts-activebar">
            <span className="cockpit-ts-activebar__label">{t("themeStudioMode")}</span>
            <div className="eops-segmented">
              <button type="button" className="eops-segmented-item" aria-pressed={theme === "light"} onClick={() => { if (theme !== "light") onToggleTheme(); }}>
                {t("themeLight")}
              </button>
              <button type="button" className="eops-segmented-item" aria-pressed={theme === "dark"} onClick={() => { if (theme !== "dark") onToggleTheme(); }}>
                {t("themeDark")}
              </button>
            </div>
            <span className="cockpit-ts-activebar__label">{t("themeStudioAccent")}</span>
            <div className="cockpit-ts-swatches">
              {accentOptions.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  className="cockpit-ts-swatch"
                  aria-pressed={accent.id === activeAccent}
                  title={accent.label}
                  style={{ background: accent.swatch ?? "var(--accent)" }}
                  onClick={() => onSetAccent(accent.id)}
                />
              ))}
            </div>
          </div>

          {/* Theme catalog */}
          <div className="cockpit-ts-catalog">
            {themeCatalog.map((entry) => {
              const isActive = entry.id === activeThemeId;
              const isCustom = !entry.readonly;
              return (
                <div key={entry.id} className={`cockpit-ts-card${isActive ? " is-active" : ""}`}>
                  <div className="cockpit-ts-card__preview">
                    <span style={{ background: entry.light.background }} />
                    <span style={{ background: entry.dark.background }} />
                    {entry.variants.slice(0, 3).map((variant) => (
                      <span key={variant.id} style={{ background: variant.accent }} />
                    ))}
                  </div>
                  <div className="cockpit-ts-card__main">
                    <b>{entry.name}</b>
                    <span className={`aops-pm-badge ${isCustom ? "aops-pm-badge--sage" : "aops-pm-badge--ghost"}`}>
                      {isCustom ? t("themeStudioCustom") : t("themeStudioBuiltin")}
                    </span>
                  </div>
                  <div className="cockpit-ts-card__actions">
                    {isActive ? (
                      <span className="aops-pm-badge aops-pm-badge--sage">{t("themeStudioActive")}</span>
                    ) : (
                      <button type="button" className="aops-v2-secondary-button" onClick={() => onSetThemeId(entry.id)}>
                        {t("themeStudioUse")}
                      </button>
                    )}
                    <button type="button" className="aops-v2-secondary-button" onClick={() => handleCreate(entry)}>
                      {t("themeStudioCopy")}
                    </button>
                    {isCustom ? (
                      <>
                        <button type="button" className="aops-v2-secondary-button" onClick={() => setEditingId(entry.id)}>
                          {t("themeStudioEdit")}
                        </button>
                        <button type="button" className="aops-v2-secondary-button" onClick={() => handleDelete(entry.id)}>
                          {t("themeStudioDelete")}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {editing ? (
            <ThemeEditor theme={editing} onUpdate={onUpdateCustomTheme} onDone={() => setEditingId(null)} t={t} />
          ) : (
            <p className="cockpit-ts-note">{t("themeStudioReadonlyNote")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ThemeEditor({
  theme,
  onUpdate,
  onDone,
  t
}: {
  theme: ShellThemeDefinition;
  onUpdate: (id: string, patch: Partial<ShellThemeDefinition>) => void;
  onDone: () => void;
  t: TFn;
}) {
  const setMode = (mode: ThemeMode, key: "background" | "surface" | "foreground", value: string) => {
    onUpdate(theme.id, { [mode]: { ...theme[mode], [key]: value } } as Partial<ShellThemeDefinition>);
  };
  const setVariant = (index: number, patch: Partial<ShellThemeDefinition["variants"][number]>) => {
    onUpdate(theme.id, { variants: theme.variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)) });
  };
  const addVariant = () => {
    if (theme.variants.length >= MAX_VARIANTS) return;
    const existingIds = new Set(theme.variants.map((variant) => variant.id));
    const next = createCustomThemeVariant({ label: `${t("themeStudioAccent")} ${theme.variants.length + 1}`, accent: "#7ed6a5", seed: `tone-${theme.variants.length + 1}`, existingIds });
    onUpdate(theme.id, { variants: [...theme.variants, next] });
  };
  const removeVariant = (index: number) => {
    if (theme.variants.length <= 1) return;
    onUpdate(theme.id, { variants: theme.variants.filter((_, i) => i !== index) });
  };

  return (
    <div className="cockpit-ts-editor">
      <label className="aops-field">
        <span>{t("themeStudioName")}</span>
        <input value={theme.name} onChange={(e) => onUpdate(theme.id, { name: e.target.value })} />
      </label>

      <div className="cockpit-ts-editor-grid">
        {(["light", "dark"] as ThemeMode[]).map((mode) => (
          <div key={mode} className="cockpit-ts-editor-card">
            <h4>{mode === "light" ? t("themeStudioLightColors") : t("themeStudioDarkColors")}</h4>
            <ColorField label={t("themeStudioColorCanvas")} value={theme[mode].background} onChange={(v) => setMode(mode, "background", v)} />
            <ColorField label={t("themeStudioColorSurface")} value={theme[mode].surface} onChange={(v) => setMode(mode, "surface", v)} />
            <ColorField label={t("themeStudioColorText")} value={theme[mode].foreground} onChange={(v) => setMode(mode, "foreground", v)} />
          </div>
        ))}
      </div>

      <div className="cockpit-ts-editor-card">
        <div className="cockpit-ts-editor-card__head">
          <h4>{t("themeStudioVariants")}</h4>
          <button type="button" className="aops-v2-secondary-button" disabled={theme.variants.length >= MAX_VARIANTS} onClick={addVariant}>
            {t("themeStudioAddVariant")}
          </button>
        </div>
        {theme.variants.map((variant, index) => (
          <div key={variant.id} className="cockpit-ts-variant">
            <label className="aops-field">
              <span>{t("themeStudioVariantLabel")}</span>
              <input value={variant.label} onChange={(e) => setVariant(index, { label: e.target.value })} />
            </label>
            <ColorField label={t("themeStudioAccent")} value={variant.accent} onChange={(v) => setVariant(index, { accent: v })} />
            <ColorField label={t("themeStudioVariantSecondary")} value={variant.accentSecondary ?? variant.accent} onChange={(v) => setVariant(index, { accentSecondary: v })} />
            <ColorField label={t("themeStudioVariantTertiary")} value={variant.accentTertiary ?? variant.accent} onChange={(v) => setVariant(index, { accentTertiary: v })} />
            <button type="button" className="aops-v2-secondary-button" disabled={theme.variants.length <= 1} onClick={() => removeVariant(index)}>
              {t("themeStudioRemoveVariant")}
            </button>
          </div>
        ))}
      </div>

      <div className="cockpit-ts-editor__foot">
        <button type="button" className="aops-v2-primary-button" onClick={onDone}>
          {t("themeStudioDone")}
        </button>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="cockpit-ts-color">
      <span>{label}</span>
      <span className="cockpit-ts-color__inputs">
        <input type="color" value={normalizeHex(value)} onChange={(e) => onChange(e.target.value)} />
        <input className="cockpit-ts-color__hex" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

/** <input type="color"> requires a 6-digit hex; fall back if the stored value isn't one. */
function normalizeHex(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : "#888888";
}
