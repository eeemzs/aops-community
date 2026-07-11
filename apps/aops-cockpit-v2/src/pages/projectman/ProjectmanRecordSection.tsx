import { useCallback, type ReactNode } from "react";
import { deletePmRecord, type ProjectmanDataModel } from "../../lib/projectman";
import type { RecordListItem } from "../../components/recordMasterDetail";
import type { AopsCockpitLocale } from "../../lib/i18n";
import { ProjectmanRecordList } from "./ProjectmanRecordList";
import { RecordSectionHost } from "./record-cards/RecordSectionHost";
import type { TFn } from "./types";

// PM Issues / Feedback / Reviews adapter over the generic record-section host:
// wires the section's hosted delete route (with the model refresh) and the
// legacy master-detail list element.
export function ProjectmanRecordSection({
  model,
  section,
  deleteResource,
  items,
  title,
  searchPlaceholder,
  emptyLabel,
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
    <RecordSectionHost
      section={section}
      projectKey={model.selectedProject?.key ?? "__global__"}
      items={items}
      title={title}
      searchPlaceholder={searchPlaceholder}
      emptyLabel={emptyLabel}
      onDeleteRecord={onDeleteRecord}
      locale={locale}
      t={t}
      listNode={
        <ProjectmanRecordList
          items={items}
          title={title}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={emptyLabel}
          t={t}
        />
      }
    />
  );
}
