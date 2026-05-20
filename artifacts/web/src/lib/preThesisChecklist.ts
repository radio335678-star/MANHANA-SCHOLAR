export type PreThesisChecklistItem = {
  id: string;
  label: string;
  required: boolean;
};

export const PRE_THESIS_CHECKLIST_ITEMS: PreThesisChecklistItem[] = [
  { id: "title", label: "Research Title Finalised", required: true },
  { id: "protocol", label: "Protocol Registered", required: true },
  { id: "ethics", label: "Ethics Clearance", required: true },
  { id: "guide", label: "Guide & Co-Guide Assigned", required: true },
  { id: "university", label: "University Guidelines Fetched", required: true },
  { id: "synopsis", label: "Synopsis Submitted", required: false },
  { id: "sample", label: "Sample Size Calculated", required: true },
  { id: "inclusion", label: "Inclusion/Exclusion Criteria Defined", required: true },
];

export function checklistProgress(checklist: Record<string, boolean>) {
  const checkedCount = Object.values(checklist).filter(Boolean).length;
  const pct = Math.round((checkedCount / PRE_THESIS_CHECKLIST_ITEMS.length) * 100);
  const requiredDone = PRE_THESIS_CHECKLIST_ITEMS.filter((c) => c.required).every(
    (c) => checklist[c.id],
  );
  return { checkedCount, pct, requiredDone };
}
