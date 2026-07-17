import { useMemo } from "react";
import type { DocmanDataModel, DocmanDocument } from "./docman";
import {
  useRecordNavigator,
  type RecordNavigator,
  type RecordNavigatorConfig
} from "./recordNavigator";
import type { AopsCockpitTranslationKey } from "./i18n";

type NavT = (key: AopsCockpitTranslationKey) => string;

// Docs navigator — the shared 3-mode record navigator grouped by Docman
// document groups (group title from document-groups; ungrouped bucket last).

const DocIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
    <path
      d="M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h5M9.5 15.5h5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export type DocsNavigator = RecordNavigator;

export interface DocsNavigatorModel {
  docman: DocmanDataModel;
  selectedDocumentId: string | null;
  onSelectDocument: (documentId: string) => void;
}

export function useDocsNavigator(model: DocsNavigatorModel, t: NavT): DocsNavigator {
  const config = useMemo<RecordNavigatorConfig<DocmanDocument>>(() => {
    const groupTitle = new Map(
      model.docman.groups.map((group) => [group.groupUid ?? group.id, group.title ?? group.groupUid ?? group.id])
    );
    const byGroup = new Map<string, DocmanDocument[]>();
    for (const document of model.docman.documents) {
      const key = document.groupUid ?? "__ungrouped";
      byGroup.set(key, [...(byGroup.get(key) ?? []), document]);
    }
    const groups = [...byGroup.entries()]
      .sort(([a], [b]) => (groupTitle.get(a) ?? a).localeCompare(groupTitle.get(b) ?? b))
      .map(([key, items]) => ({
        key,
        label: key === "__ungrouped" ? t("docsNavUngrouped") : groupTitle.get(key) ?? key,
        items
      }));
    return {
      storagePrefix: "aops-cockpit-v2.docs",
      testIdPrefix: "aops-v2-docs",
      dockClassName: "aops-v2-docs-navdock",
      // Cards mode: the Docs page renders the document cards register.
      enableCardsMode: true,
      showDropdownSettings: false,
      showModeShortcuts: false,
      showTreeSettings: false,
      showTreeClose: true,
      showNavigatorSetting: false,
      leftMenuModeLabel: "pmRecordViewSidePanel",
      settingsModeOrder: ["left-menu", "cards", "dropdown"],
      labels: {
        panelTitle: "docsNavPanelTitle",
        paneAria: "docsNavPane",
        toolsAria: "docsNavTools",
        searchPlaceholder: "docsNavSearch",
        searchAria: "docsNavFilter",
        empty: "docsNavEmpty",
        emptySearch: "docsNavEmptySearch",
        unclassified: "docsNavUntitled",
        dropdownKicker: "docsNavDocK",
        dropdownSelect: "docsNavSelectDoc"
      },
      dropdownIcon: DocIcon,
      groups,
      itemKey: (document) => document.id,
      itemLabel: (document) => document.title ?? document.slug ?? document.id.slice(0, 8),
      itemMeta: (document) => (document.slug && document.slug !== document.title ? [document.slug] : undefined),
      searchText: (document) => `${document.title ?? ""} ${document.slug ?? ""} ${(document.tags ?? []).join(" ")}`,
      selectedKey: model.selectedDocumentId,
      onSelect: model.onSelectDocument
    };
  }, [model.docman.documents, model.docman.groups, model.onSelectDocument, model.selectedDocumentId, t]);
  return useRecordNavigator(config, t);
}
