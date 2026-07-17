import { useMemo } from "react";
import type { PlanRecordItem } from "../pages/projectman/types";
import {
  useRecordNavigator,
  type RecordNavigator,
  type RecordNavigatorConfig
} from "./recordNavigator";
import type { AopsCockpitTranslationKey } from "./i18n";

type NavT = (key: AopsCockpitTranslationKey) => string;

// Sprints navigator — same mode contract as the Boards navigator via the
// shared record navigator (left-menu / dock / dropdown / cards register).
// Implementation-plan is a sprint-backed facade, so items are grouped only by
// real lifecycle state. A sole active group is flattened into a compact list.

const SprintIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
    <path
      d="M5 3v18M5 4h11l-2 3 2 3H5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export type SprintsViewMode = RecordNavigator["viewMode"];
export type SprintsNavigator = RecordNavigator;

export interface SprintsNavigatorModel {
  items: PlanRecordItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function useSprintsNavigator(model: SprintsNavigatorModel, t: NavT): SprintsNavigator {
  const config = useMemo<RecordNavigatorConfig<PlanRecordItem>>(
    () => ({
      storagePrefix: "aops-cockpit-v2.sprints",
      testIdPrefix: "aops-v2-sprints",
      dockClassName: "aops-v2-sprints-navdock",
      treeClassName: "aops-v2-sprints-tree",
      flattenSingleGroup: true,
      // Cards mode: the sprints page renders the card register (boards parity).
      enableCardsMode: true,
      showDropdownSettings: false,
      showDropdownMeta: false,
      showModeShortcuts: false,
      showTreeSettings: false,
      showTreeClose: true,
      treeCloseLabel: "pmSprintSidePanelClose",
      showNavigatorSetting: false,
      leftMenuModeLabel: "pmRecordViewSidePanel",
      settingsModeOrder: ["left-menu", "cards", "dropdown"],
      labels: {
        panelTitle: "pmNavSprintsPanelTitle",
        paneAria: "pmNavSprintsPane",
        toolsAria: "pmNavSprintTools",
        searchPlaceholder: "pmNavSearchSprints",
        searchAria: "pmNavFilterSprints",
        empty: "pmNavNoSprints",
        emptySearch: "pmNavNothingMatches",
        unclassified: "pmNavUntitled",
        dropdownKicker: "pmNavSprintK",
        dropdownSelect: "pmNavSelect"
      },
      dropdownIcon: SprintIcon,
      groups: [
        {
          key: "active",
          label: t("navActiveGroup"),
          items: model.items.filter((item) => !item.archived)
        },
        {
          key: "archived",
          label: t("navArchivedGroup"),
          items: model.items.filter((item) => item.archived)
        }
      ],
      itemKey: (item) => item.key,
      itemLabel: (item) => item.name,
      searchText: (item) => item.name,
      selectedKey: model.selectedKey,
      onSelect: model.onSelect
    }),
    [model.items, model.onSelect, model.selectedKey, t]
  );
  return useRecordNavigator(config, t);
}
