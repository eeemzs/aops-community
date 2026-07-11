import { useCallback, useState, type ReactNode } from "react";
import type { RecordListItem } from "../../../components/recordMasterDetail";
import type { AopsCockpitLocale } from "../../../lib/i18n";
import { SegmentedControl } from "../components";
import { RecordCardsRegister } from "./RecordCardsRegister";
import {
  readRecordCardsUiState,
  writeRecordCardsUiState,
  type RecordCardsUiState
} from "./shared";
import type { TFn } from "../types";

// Generic record-section host: a persisted Cards | List view toggle over the
// first-class cards register (default) and the caller-supplied legacy list
// element. PM Issues/Feedback/Reviews, the Agentspace sections and the Runs
// tabs all mount through this one host.
export function RecordSectionHost({
  section,
  projectKey,
  items,
  title,
  searchPlaceholder,
  emptyLabel,
  listNode,
  onDeleteRecord,
  renderExtra,
  toolbarExtra,
  locale,
  t
}: {
  /** Persistence key for the section (e.g. issues | as-memory | runs-runs). */
  section: string;
  projectKey: string;
  items: RecordListItem[];
  title: string;
  searchPlaceholder: string;
  emptyLabel: string;
  /** The legacy master-detail element rendered in List view. */
  listNode: ReactNode;
  onDeleteRecord?: (item: RecordListItem) => Promise<void>;
  renderExtra?: (item: RecordListItem) => ReactNode;
  toolbarExtra?: ReactNode;
  locale: AopsCockpitLocale;
  t: TFn;
}): ReactNode {
  const [ui, setUi] = useState<RecordCardsUiState>(readRecordCardsUiState);
  // View preference is project+section scoped like the rest of the card UI
  // state (RR b4308877 P1: a plain section key leaked the choice across
  // projects). Legacy plain-section values are read as a fallback once.
  const viewKey = `${projectKey}:${section}`;
  const view = ui.viewBySection[viewKey] ?? ui.viewBySection[section] ?? "cards";
  const setView = useCallback(
    (next: "cards" | "list") =>
      setUi((prev) => {
        const state = { ...prev, viewBySection: { ...prev.viewBySection, [viewKey]: next } };
        writeRecordCardsUiState(state);
        return state;
      }),
    [viewKey]
  );

  return (
    <div className="aops-pm-recordsection" data-testid={`aops-v2-${section}-section`}>
      <div className="aops-pm-recordsection-viewrow">
        <span className="aops-pm-groupby-label">{t("pmRecordViewLabel")}</span>
        <SegmentedControl
          compact
          ariaLabel={`${t("pmRecordViewLabel")}: ${title}`}
          value={view}
          items={[
            { value: "cards", label: t("navModeCards") },
            { value: "list", label: t("pmRecordViewList") }
          ]}
          onChange={(value) => setView(value as "cards" | "list")}
        />
      </div>
      {view === "cards" ? (
        <RecordCardsRegister
          projectKey={projectKey}
          section={section}
          items={items}
          sectionTitle={title}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={emptyLabel}
          onDeleteRecord={onDeleteRecord}
          renderExtra={renderExtra}
          toolbarExtra={toolbarExtra}
          locale={locale}
          t={t}
        />
      ) : (
        listNode
      )}
    </div>
  );
}
