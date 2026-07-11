import { useEffect, useState, type ReactNode } from "react";
import { WorkbenchSectionShell, WorkbenchStatePanel } from "@aopslab/xf-ui-shell-react";
import { WorkbenchRecordDetailLayout } from "@aopslab/xf-ui-composition-react";
import { apiErrorMessage } from "../lib/aopsApi";
import {
  currentDocumentVersion,
  useDocmanDocumentVersions,
  useDocmanMaterialized,
  useDocmanVersionIndex,
  type DocmanDataModel,
  type DocmanDocument
} from "../lib/docman";
import type { DocsNavigator } from "../lib/docsNavigator";
import { Badge, type RecordListItem } from "../components/recordMasterDetail";
import { RecordCardsRegister } from "./projectman/record-cards/RecordCardsRegister";
import { MarkdownLite, markdownAnchorSlug } from "../components/MarkdownLite";
import { toneForStatus } from "../lib/projectman";
import { formatPmDate } from "./projectman/helpers";
import type { AopsCockpitLocale, AopsCockpitTranslationKey } from "../lib/i18n";

type TFn = (key: AopsCockpitTranslationKey) => string;

// Docs — A1 record-detail surface over hosted Docman: the 3-mode docs
// navigator (grouped by document group) selects a document; the detail renders
// the record header (title/status/group/updated) + the materialized markdown
// of the current version (mirror-pull surface). Outline + version list land
// with S3.2.
export function DocsPage({
  model,
  navigator,
  selectedDocumentId,
  locale,
  t
}: {
  model: DocmanDataModel;
  navigator: DocsNavigator;
  selectedDocumentId: string | null;
  locale: AopsCockpitLocale;
  t: TFn;
}): ReactNode {
  if (model.status === "select-project") {
    return (
      <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
        <WorkbenchStatePanel variant="empty" title={t("asNoProjectTitle")} message={t("asNoProjectMessage")} />
      </WorkbenchSectionShell>
    );
  }
  if (model.status === "loading") {
    return (
      <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
        <WorkbenchStatePanel variant="loading" title={t("docsLoadingTitle")} message={t("asLoadingMessage")} />
      </WorkbenchSectionShell>
    );
  }
  if (model.status === "error") {
    return (
      <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
        <WorkbenchStatePanel
          variant="error"
          title={t("docsErrorTitle")}
          message={apiErrorMessage(model.error, "docman_unavailable")}
          actions={
            <button type="button" className="aops-v2-secondary-button" onClick={model.refresh}>
              {t("authRetry")}
            </button>
          }
        />
      </WorkbenchSectionShell>
    );
  }
  if (model.status === "empty") {
    return (
      <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
        <WorkbenchStatePanel variant="empty" title={t("docsEmptyTitle")} message={t("docsEmptyMessage")} />
      </WorkbenchSectionShell>
    );
  }

  const selected = model.documents.find((document) => document.id === selectedDocumentId) ?? null;
  const detail = selected ? (
    <DocDetail model={model} document={selected} locale={locale} t={t} />
  ) : (
    <WorkbenchStatePanel variant="empty" title={t("docsTitle")} message={t("docsNavEmpty")} />
  );

  // Cards mode: the whole document set as a paged register (record-cards
  // registry); "Open document" jumps back to the reading surface (left-menu)
  // with the record selected.
  if (navigator.isCardsMode) {
    const groupTitle = new Map(
      model.groups.map((group) => [group.groupUid ?? group.id, group.title ?? group.groupUid ?? group.id])
    );
    const items: RecordListItem[] = model.documents.map((document) => ({
      id: document.id,
      title: document.title ?? document.slug ?? document.id.slice(0, 8),
      status: document.status ?? null,
      eyebrow: t("docsTitle"),
      chips: document.groupUid
        ? [{ label: groupTitle.get(document.groupUid) ?? document.groupUid, tone: "indigo" as const }]
        : [],
      fields: [
        { label: t("docsNavPanelTitle"), value: document.groupUid ? groupTitle.get(document.groupUid) ?? null : null },
        { label: t("asFieldSlug"), value: document.slug ?? null }
      ],
      body: document.summary ? [{ heading: t("docsTitle"), text: document.summary }] : undefined,
      tags: document.tags ?? undefined,
      searchText: `${document.title ?? ""} ${document.slug ?? ""} ${(document.tags ?? []).join(" ")}`,
      createdAt: (document as { createdAt?: string }).createdAt,
      updatedAt: document.updatedAt
    }));
    return (
      <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
        <div className="aops-pm-board-view is-cards">
          <RecordCardsRegister
            projectKey={model.selectedProject?.key ?? "__global__"}
            section="docs"
            items={items}
            sectionTitle={t("docsTitle")}
            searchPlaceholder={t("docsNavSearch")}
            emptyLabel={t("docsNavEmpty")}
            renderExtra={(item) => (
              <div className="aops-pm-recordlist-actions">
                <button
                  type="button"
                  className="aops-v2-secondary-button"
                  onClick={() => {
                    navigator.selectRecord(item.id);
                    navigator.switchMode("left-menu");
                  }}
                  data-testid="aops-v2-docs-card-open"
                >
                  {t("docsCardsOpen")}
                </button>
              </div>
            )}
            toolbarTrailing={
              <>
                <span className="aops-pm-cards-toolbar-sep" aria-hidden />
                {navigator.gearNode}
              </>
            }
            locale={locale}
            t={t}
          />
        </div>
      </WorkbenchSectionShell>
    );
  }

  if (navigator.isDropdownMode) {
    return (
      <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
        <div className="aops-pm-board-view is-dropdown">
          <div className="aops-pm-board-navrow">{navigator.dropdownNode}</div>
          {detail}
        </div>
      </WorkbenchSectionShell>
    );
  }
  return (
    <WorkbenchSectionShell className="aops-v2-section aops-pm-section" mainClassName="aops-v2-section-main">
      <div className="aops-pm-board-view">
        <WorkbenchRecordDetailLayout
          controller={navigator.controller}
          navigator={navigator.treePanel}
          navigatorLabel={t("docsNavPanelTitle")}
          className="aops-pm-board-recordlayout"
          contentClassName="aops-pm-board-recordcontent"
          content={detail}
        />
      </div>
    </WorkbenchSectionShell>
  );
}

function DocDetail({
  model,
  document,
  locale,
  t
}: {
  model: DocmanDataModel;
  document: DocmanDocument;
  locale: AopsCockpitLocale;
  t: TFn;
}): ReactNode {
  const versionsQuery = useDocmanDocumentVersions({ model, documentId: document.id });
  const versions = versionsQuery.data ?? [];
  const current = currentDocumentVersion(versions);
  // Operator can pin an older version; reset to current on document switch.
  const [versionId, setVersionId] = useState<string | null>(null);
  useEffect(() => {
    setVersionId(null);
  }, [document.id]);
  const activeVersionId = versionId ?? current?.id ?? null;
  const activeVersion = versions.find((version) => version.id === activeVersionId) ?? current;
  const materializedQuery = useDocmanMaterialized({ model, versionId: activeVersionId });
  const indexQuery = useDocmanVersionIndex({ model, versionId: activeVersionId });
  const markdown = materializedQuery.data?.content ?? "";
  const outline = (indexQuery.data?.entries ?? []).filter((entry) => entry.title);
  const groupTitle =
    model.groups.find((group) => (group.groupUid ?? group.id) === (document.groupUid ?? ""))?.title ??
    document.groupUid ??
    null;

  const scrollToHeading = (title: string) => {
    const target = window.document.getElementById(markdownAnchorSlug(title));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const metadata = (
    <div className="aops-pm-rechead-meta">
      <Badge tone={toneForStatus(document.status)}>{document.status ?? t("pmUnknownStatus")}</Badge>
      {groupTitle ? <span className="aops-pm-muted" title={groupTitle}>{groupTitle}</span> : null}
      <span className="aops-pm-muted">{formatPmDate(document.updatedAt, locale)}</span>
      <span className="aops-pm-mono" title={document.slug ?? document.id}>
        {document.slug ?? document.id.slice(0, 8)}
      </span>
    </div>
  );
  const versionPicker = versions.length ? (
    <div className="aops-docs-versions" role="group" aria-label={t("docsVersions")}>
      <span className="aops-pm-groupby-label">{t("docsVersions")}</span>
      {versions.map((version) => {
        const active = version.id === activeVersionId;
        return (
          <button
            key={version.id}
            type="button"
            className={`aops-docs-version-chip${active ? " is-active" : ""}${
              version.isCurrent ? " is-current" : ""
            }`}
            aria-pressed={active}
            title={version.label ?? version.title ?? undefined}
            onClick={() => setVersionId(version.id)}
          >
            v{version.version ?? "?"}
            {version.isCurrent ? " ●" : ""}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <section className="aops-docs-record" aria-label={document.title ?? document.id}>
      <header className="aops-pm-rechead">
        <div className="aops-pm-rechead-id">
          <span className="aops-pm-rechead-eyebrow">{t("docsTitle")}</span>
          <h3 className="aops-pm-rechead-title">{document.title ?? document.slug ?? document.id.slice(0, 8)}</h3>
          <div className="aops-docs-desktop-meta">
            {metadata}
            {versionPicker}
          </div>
          <details className="aops-docs-mobile-meta">
            <summary>{t("docsVersions")} · {versions.length}</summary>
            {metadata}
            {versionPicker}
          </details>
          {document.summary ? <p className="aops-pm-sprint-goal">{document.summary}</p> : null}
        </div>
      </header>
      {outline.length > 1 ? (
        <details className="aops-docs-outline">
          <summary>{t("docsOutline")}</summary>
          <ul>
            {outline.map((entry, index) => (
              <li key={index} style={{ paddingLeft: `${Math.max(0, (entry.depth ?? 1) - 1) * 14}px` }}>
                <button type="button" onClick={() => scrollToHeading(entry.title ?? "")}>
                  {entry.number ? `${entry.number} ` : ""}
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {versionsQuery.isPending || materializedQuery.isPending ? (
        <p className="aops-pm-muted">{t("asLoadingMessage")}</p>
      ) : materializedQuery.error ? (
        <p className="aops-pm-error-line">{apiErrorMessage(materializedQuery.error, "docman_unavailable")}</p>
      ) : markdown ? (
        <div className="aops-docs-body">
          <MarkdownLite markdown={markdown} />
        </div>
      ) : (
        <p className="aops-pm-muted">
          {t("docsNoContent")}
          {activeVersion?.status ? ` (${activeVersion.status})` : ""}
        </p>
      )}
    </section>
  );
}
