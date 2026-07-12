import { useCallback, type ReactNode } from "react";
import { deletePmRecord, type ProjectmanDataModel } from "../../lib/projectman";
import type { RecordListItem } from "../../components/recordMasterDetail";
import type { AopsCockpitLocale } from "../../lib/i18n";
import { ProjectmanRecordList } from "./ProjectmanRecordList";
import { RecordCardsRegister } from "./record-cards/RecordCardsRegister";
import type { TFn } from "./types";

// Shared PM flat-record surface for Issues / Feedback / Reviews: cards use the
// register while side-panel and dropdown modes preserve the same detail body.
export function ProjectmanRecordSection({
  model,
  section,
  deleteResource,
  items,
  title,
  searchPlaceholder,
  emptyLabel,
  view,
  locale,
  t
}: {
  model: ProjectmanDataModel;
  section: "issues" | "feedback" | "reviews";
  deleteResource: "issues" | "feedbacks" | "review-requests";
  items: RecordListItem[];
  title: string;
  searchPlaceholder: string;
  emptyLabel: string;
  view: "side-panel" | "cards" | "dropdown" | "list";
  locale: AopsCockpitLocale;
  t: TFn;
}): ReactNode {
  const onDeleteRecord = useCallback(
    async (item: RecordListItem) => {
      await deletePmRecord(model.client, deleteResource, item.id);
      model.refresh();
    },
    [deleteResource, model]
  );
  return (
    <div className="aops-pm-recordsection" data-testid={`aops-v2-${section}-section`}>
      {view === "cards" ? (
        <RecordCardsRegister
          projectKey={model.selectedProject?.key ?? "__global__"}
          section={section}
          items={items}
          sectionTitle={title}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={emptyLabel}
          onDeleteRecord={onDeleteRecord}
          locale={locale}
          t={t}
        />
      ) : (
        <ProjectmanRecordList
          items={items}
          title={title}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={emptyLabel}
          layout={view === "dropdown" ? "dropdown" : "side-panel"}
          t={t}
        />
      )}
    </div>
  );
}
