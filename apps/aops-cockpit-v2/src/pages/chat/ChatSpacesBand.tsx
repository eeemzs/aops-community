import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AopsCockpitTranslationKey } from "../../lib/i18n";
import { slugifyName, type ChatSpaceRef } from "../../lib/chat";

type TFn = (key: AopsCockpitTranslationKey) => string;

const SpaceIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
    <path
      d="M4 6.5h16M4 12h16M4 17.5h16M7 4v16M17 4v16"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const DownIcon = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function spaceLabel(space: ChatSpaceRef): string {
  return space.title || space.slug;
}

function deriveSpaceSlug(title: string): string {
  const slug = slugifyName(title);
  return slug === "oda" && !/[a-z0-9]/i.test(title) ? "space" : slug;
}

export function ChatSpacesBand({
  spaces,
  activeSpaceSlug,
  onSelectSpace,
  onCreateSpace,
  onArchiveSpace,
  adminEnabled,
  adminStatus,
  adminError,
  t
}: {
  spaces: ChatSpaceRef[];
  activeSpaceSlug: string;
  onSelectSpace: (slug: string) => void;
  onCreateSpace: (input: { slug: string; title: string }) => Promise<ChatSpaceRef>;
  onArchiveSpace: (slug: string) => Promise<void>;
  adminEnabled: boolean;
  adminStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
  adminError: string | null;
  t: TFn;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rows = spaces.length ? spaces : [{ slug: "default", title: "Default Space" }];
  const selected = rows.find((space) => space.slug === activeSpaceSlug) ?? rows[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="aops-pm-band aops-chat-spaces-band">
      <div className="aops-pm-selector-wrap" ref={rootRef}>
        <button
          type="button"
          className="aops-pm-selector aops-chat-space-selector"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="aops-pm-selector-icon">{SpaceIcon}</span>
          <span className="aops-pm-selector-k">{t("chatSpacesBandLabel")}</span>
          <b className="aops-pm-selector-name">{selected ? spaceLabel(selected) : t("chatSpacesEmpty")}</b>
          <span className="aops-pm-selector-caret">{DownIcon}</span>
        </button>
        {open ? (
          <div className="aops-pm-proj-menu aops-chat-space-menu" role="listbox">
            <div className="aops-pm-proj-menu-head">{t("chatSpacesBandScope")}</div>
            {rows.map((space) => {
              const active = space.slug === activeSpaceSlug;
              return (
                <button
                  key={space.slug}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`aops-pm-proj-menu-item${active ? " is-active" : ""}`}
                  onClick={() => {
                    onSelectSpace(space.slug);
                    setOpen(false);
                  }}
                >
                  <span className="aops-pm-proj-menu-icon">{SpaceIcon}</span>
                  {spaceLabel(space)}
                  {active ? <span className="aops-pm-proj-menu-check">✓</span> : null}
                </button>
              );
            })}
            <div className="aops-chat-space-menu-sep" />
            <button
              type="button"
              className="aops-pm-proj-menu-item aops-chat-space-manage"
              onClick={() => {
                setOpen(false);
                setManageOpen(true);
              }}
            >
              <span className="aops-pm-proj-menu-icon">{SpaceIcon}</span>
              {t("chatSpacesManage")}
            </button>
          </div>
        ) : null}
      </div>
      <span className="aops-pm-band-crumb">{t("chatTitle")}</span>
      {manageOpen ? (
        <ChatSpaceManagementModal
          spaces={rows}
          activeSpaceSlug={activeSpaceSlug}
          adminEnabled={adminEnabled}
          adminStatus={adminStatus}
          adminError={adminError}
          onCreateSpace={onCreateSpace}
          onArchiveSpace={onArchiveSpace}
          onClose={() => setManageOpen(false)}
          t={t}
        />
      ) : null}
    </div>
  );
}

function ChatSpaceManagementModal({
  spaces,
  activeSpaceSlug,
  adminEnabled,
  adminStatus,
  adminError,
  onCreateSpace,
  onArchiveSpace,
  onClose,
  t
}: {
  spaces: ChatSpaceRef[];
  activeSpaceSlug: string;
  adminEnabled: boolean;
  adminStatus: "idle" | "loading" | "ready" | "unavailable" | "error";
  adminError: string | null;
  onCreateSpace: (input: { slug: string; title: string }) => Promise<ChatSpaceRef>;
  onArchiveSpace: (slug: string) => Promise<void>;
  onClose: () => void;
  t: TFn;
}): ReactNode {
  const [title, setTitle] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const trimmedTitle = title.trim();
  const derivedSlug = deriveSpaceSlug(trimmedTitle);
  const readOnly = !adminEnabled;
  const busy = busyKey !== null;
  const errorText = localError ?? adminError;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (readOnly || busy || !trimmedTitle) return;
    setBusyKey("__create__");
    setLocalError(null);
    try {
      await onCreateSpace({ slug: derivedSlug, title: trimmedTitle });
      setTitle("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  };

  const archive = async (space: ChatSpaceRef) => {
    if (readOnly || busy || space.slug === "default" || !space.id) return;
    setBusyKey(space.slug);
    setLocalError(null);
    try {
      await onArchiveSpace(space.slug);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="aops-v2-chat-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="aops-v2-chat-modal aops-chat-space-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("chatSpacesManageTitle")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="aops-v2-chat-modal-head">
          <h4>{t("chatSpacesManageTitle")}</h4>
          <button type="button" className="aops-v2-chat-iconclose" aria-label={t("chatClose")} onClick={onClose}>
            x
          </button>
        </header>
        <div className="aops-v2-chat-modal-body">
          <p className="aops-v2-chat-muted">{t("chatSpacesManageIntro")}</p>
          {readOnly ? <p className="aops-chat-space-readonly">{t("chatSpacesReadOnlyNote")}</p> : null}
          {errorText ? <p className="aops-chat-space-error">{errorText}</p> : null}

          <section className="aops-chat-space-section" aria-label={t("chatSpacesTitle")}>
            <div className="aops-chat-space-section-head">
              <h5>{t("chatSpacesTitle")}</h5>
              <span>{adminStatus === "loading" ? t("chatSpacesLoading") : t("chatSpacesBandScope")}</span>
            </div>
            <div className="aops-chat-space-list">
              {spaces.length ? (
                spaces.map((space) => {
                  const isDefault = space.slug === "default";
                  const missingId = !space.id;
                  const disabled = readOnly || busy || isDefault || missingId;
                  const titleText = readOnly
                    ? t("chatSpacesReadOnlyNote")
                    : isDefault
                      ? t("chatSpaceDefaultArchiveDisabled")
                      : missingId
                        ? t("chatSpaceArchiveMissingId")
                        : undefined;
                  return (
                    <div
                      key={space.slug}
                      className={`aops-chat-space-row${space.slug === activeSpaceSlug ? " is-active" : ""}`}
                    >
                      <div className="aops-chat-space-row-main">
                        <strong>{spaceLabel(space)}</strong>
                        <span>{space.slug}</span>
                      </div>
                      <span className="aops-chat-space-status">{space.status ?? "active"}</span>
                      <button
                        type="button"
                        className="aops-v2-chat-danger-button aops-chat-space-archive"
                        disabled={disabled}
                        title={titleText}
                        onClick={() => void archive(space)}
                      >
                        {busyKey === space.slug ? t("chatSpaceArchiving") : t("chatSpaceArchive")}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="aops-v2-chat-muted">{t("chatSpaceListEmpty")}</p>
              )}
            </div>
          </section>

          <section className="aops-chat-space-section" aria-label={t("chatSpaceCreateTitle")}>
            <div className="aops-chat-space-section-head">
              <h5>{t("chatSpaceCreateTitle")}</h5>
              <span>{t("chatSpacesRenameUnsupported")}</span>
            </div>
            <label className="aops-v2-chat-field">
              <span>{t("chatSpaceTitleLabel")}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("chatSpaceTitlePlaceholder")}
                disabled={readOnly || busy}
                autoFocus={!readOnly}
              />
            </label>
            <div className="aops-chat-space-slug-preview">
              <span>{t("chatSpaceSlugPreview")}</span>
              <code>{derivedSlug}</code>
            </div>
            <div className="aops-v2-chat-connect-actions">
              <button type="button" className="aops-v2-secondary-button" onClick={onClose}>
                {t("chatCancel")}
              </button>
              <button
                type="button"
                className="aops-v2-primary-button"
                disabled={readOnly || busy || !trimmedTitle}
                onClick={() => void submit()}
              >
                {busyKey === "__create__" ? t("chatSpaceCreating") : t("chatSpaceCreate")}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
