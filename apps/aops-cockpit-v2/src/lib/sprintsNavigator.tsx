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
// Items are the merged sprint + plan records grouped into Sprints / Plans /
// Archived.

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
      // Cards mode: the sprints page renders the card register (boards parity).
      enableCardsMode: true,
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
          key: "sprints",
          label: t("pmNavSprintsGroup"),
          items: model.items.filter((item) => !item.archived && item.kind === "sprint")
        },
        {
          key: "plans",
          label: t("pmNavPlansGroup"),
          items: model.items.filter((item) => !item.archived && item.kind === "plan")
        },
        {
          key: "archived",
          label: t("navArchivedGroup"),
          items: model.items.filter((item) => item.archived)
        }
      ],
      itemKey: (item) => item.key,
      itemLabel: (item) => item.name,
      itemMeta: (item) => [item.kind === "sprint" ? t("pmSprintType") : t("pmPlanType")],
      searchText: (item) => item.name,
      selectedKey: model.selectedKey,
      onSelect: model.onSelect
    }),
    [model.items, model.onSelect, model.selectedKey, t]
  );
  return useRecordNavigator(config, t);
}
