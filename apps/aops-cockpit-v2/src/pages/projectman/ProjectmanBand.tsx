import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AopsCockpitTranslationKey } from "../../lib/i18n";
import type { ProjectmanSectionId } from "../../lib/sections";
import type { ProjectsPageModel } from "../ProjectsPage";
import type { TFn } from "./types";

// Section → crumb label. The band crumb mirrors the active section tab label
// (same i18n keys as PROJECTMAN_SECTIONS), so the two never drift apart.
export const PROJECTMAN_SECTION_TITLES: Record<ProjectmanSectionId, AopsCockpitTranslationKey> = {
  boards: "pmSectionBoards",
  sprints: "pmSectionSprints",
  issues: "pmSectionIssues",
  feedback: "pmSectionFeedback",
  reviews: "pmSectionReviews"
};

const BoxesIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
    <path
      d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 3v9m0 0l8-4.5M12 12L4 7.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const DownIcon = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const FavoriteIcon = (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
    <path
      d="M8 1.4l1.85 3.75 4.15.6-3 2.92.7 4.13L8 10.86 4.3 12.8l.7-4.13-3-2.92 4.15-.6L8 1.4z"
      fill="currentColor"
    />
  </svg>
);

// eops-desktop inventory-item-detail page-action-bar icons (viewBox 16, stroke 1.5).
const BackIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <path d="M10 2.5 4.5 8 10 13.5M4.5 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const RefreshIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.88M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const KebabIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <circle cx="8" cy="3.25" r="1.4" fill="currentColor" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    <circle cx="8" cy="12.75" r="1.4" fill="currentColor" />
  </svg>
);

// Page action bar (eops inventory-item-detail parity): 30px round ghost icon
// buttons — back · refresh · kebab. Replaces the old text Refresh button.
function ProjectmanActionBar({
  onBack,
  onRefresh,
  isFetching,
  disabled,
  t
}: {
  onBack: () => void;
  onRefresh: () => void;
  isFetching: boolean;
  disabled: boolean;
  t: TFn;
}): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="aops-pm-actionbar">
      <button
        type="button"
        className="aops-pm-action-btn"
        onClick={onBack}
        aria-label={t("pmActionBack")}
        title={t("pmActionBack")}
      >
        {BackIcon}
      </button>
      <button
        type="button"
        className={`aops-pm-action-btn${isFetching ? " is-busy" : ""}`}
        onClick={onRefresh}
        disabled={disabled}
        aria-label={t("pmRefresh")}
        title={t("pmRefresh")}
      >
        {RefreshIcon}
      </button>
      <div className="aops-pm-action-menuwrap" ref={menuRef}>
        <button
          type="button"
          className={`aops-pm-action-btn${menuOpen ? " is-active" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("pmActionMore")}
          title={t("pmActionMore")}
        >
          {KebabIcon}
        </button>
        {menuOpen ? (
          <div className="aops-pm-action-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="aops-pm-action-menu-item"
              disabled={disabled}
              onClick={() => {
                setMenuOpen(false);
                onRefresh();
              }}
            >
              {t("pmActionRefreshData")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="aops-pm-action-menu-item"
              onClick={() => {
                setMenuOpen(false);
                onBack();
              }}
            >
              {t("pmActionGoProjects")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function projectLabel(project: { slug?: string | null; name?: string | null; key: string }): string {
  return project.slug || project.name || project.key;
}

// Project-dropdown band (ported 1:1 from the aops-cockpit CockpitThinBar
// `.cockpit-selector` / `.cockpit-proj-menu`). Rendered in the shell thin-bar
// slot so it reads as a full-width top bar below the shell header.
export function ProjectmanBand({
  projects,
  projectOptions,
  favoriteProjectKeys = [],
  projectMenuTitle,
  crumb,
  isFetching,
  onRefresh,
  onBack,
  showProjectSelector = true,
  t
}: {
  projects: ProjectsPageModel;
  projectOptions?: ProjectsPageModel["projects"];
  favoriteProjectKeys?: readonly string[];
  projectMenuTitle?: string;
  crumb: string;
  isFetching: boolean;
  onRefresh: () => void;
  onBack: () => void;
  showProjectSelector?: boolean;
  t: TFn;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const selected = projects.selectedProject;
  const name = selected ? projectLabel(selected) : t("unknownValue");
  const menuProjects = projectOptions ?? projects.projects;
  const menuTitle = projectMenuTitle ?? t("pmBandProjectScope");
  const favoriteProjectKeySet = new Set(favoriteProjectKeys);

  return (
    <div className={`aops-pm-band${showProjectSelector ? "" : " is-projectless"}`}>
      {showProjectSelector ? (
        <div className="aops-pm-selector-wrap" ref={rootRef}>
          <button
            type="button"
            className="aops-pm-selector"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="aops-pm-selector-icon">{BoxesIcon}</span>
            <span className="aops-pm-selector-k">{t("pmBandProject")}</span>
            <b className="aops-pm-selector-name">{name}</b>
            <span className="aops-pm-selector-caret">{DownIcon}</span>
          </button>
          {open ? (
            <div className="aops-pm-proj-menu" role="listbox">
              <div className="aops-pm-proj-menu-head">{menuTitle}</div>
              {menuProjects.length === 0 ? (
                <div className="aops-pm-proj-menu-empty">{t("pmNoProjectTitle")}</div>
              ) : (
                menuProjects.map((project) => {
                  const active = project.key === projects.selectedProjectKey;
                  const isFavorite = favoriteProjectKeySet.has(project.key);
                  return (
                    <button
                      key={project.key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`aops-pm-proj-menu-item${active ? " is-active" : ""}`}
                      onClick={() => {
                        projects.onSelectProject(project.key);
                        setOpen(false);
                      }}
                    >
                      <span className="aops-pm-proj-menu-icon">{BoxesIcon}</span>
                      <span className="aops-pm-proj-menu-label">{projectLabel(project)}</span>
                      {isFavorite ? (
                        <span className="aops-pm-proj-menu-favorite" aria-hidden="true">
                          {FavoriteIcon}
                        </span>
                      ) : null}
                      {active ? <span className="aops-pm-proj-menu-check">✓</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <span className="aops-pm-band-crumb">{crumb}</span>
      <ProjectmanActionBar
        onBack={onBack}
        onRefresh={onRefresh}
        isFetching={isFetching}
        disabled={isFetching || projects.selectedProject === null}
        t={t}
      />
    </div>
  );
}
