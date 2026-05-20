export type StandardSectionSpec = {
  title: string;
  type:
    | "introduction"
    | "literature_review"
    | "methodology"
    | "results"
    | "discussion"
    | "conclusion"
    | "abstract"
    | "references"
    | "custom";
  minPages: number;
  maxPages: number;
  targetPages: number;
};

export const STANDARD_SECTION_SPECS: StandardSectionSpec[] = [
  { title: "Title Page", type: "custom", minPages: 1, maxPages: 1, targetPages: 1 },
  { title: "Certificate", type: "custom", minPages: 1, maxPages: 1, targetPages: 1 },
  { title: "Declaration", type: "custom", minPages: 1, maxPages: 1, targetPages: 1 },
  { title: "Acknowledgements", type: "custom", minPages: 1, maxPages: 2, targetPages: 2 },
  { title: "Abstract", type: "abstract", minPages: 1, maxPages: 2, targetPages: 2 },
  { title: "List of Abbreviations", type: "custom", minPages: 1, maxPages: 3, targetPages: 2 },
  { title: "Introduction", type: "introduction", minPages: 3, maxPages: 8, targetPages: 5 },
  { title: "Aims & Objectives", type: "custom", minPages: 1, maxPages: 3, targetPages: 2 },
  { title: "Review of Literature", type: "literature_review", minPages: 15, maxPages: 40, targetPages: 25 },
  { title: "Materials & Methods", type: "methodology", minPages: 8, maxPages: 20, targetPages: 12 },
  { title: "Observations & Results", type: "results", minPages: 15, maxPages: 40, targetPages: 25 },
  { title: "Discussion", type: "discussion", minPages: 15, maxPages: 35, targetPages: 22 },
  { title: "Conclusion & Summary", type: "conclusion", minPages: 2, maxPages: 5, targetPages: 3 },
  { title: "References", type: "references", minPages: 5, maxPages: 15, targetPages: 8 },
  { title: "Tables", type: "custom", minPages: 5, maxPages: 20, targetPages: 10 },
  { title: "Annexures", type: "custom", minPages: 2, maxPages: 10, targetPages: 5 },
];

export function inferSectionType(title: string): StandardSectionSpec["type"] {
  const match = STANDARD_SECTION_SPECS.find(
    (s) => s.title.toLowerCase() === title.toLowerCase(),
  );
  return match?.type ?? "custom";
}

export function getPageSpecForTitle(title: string): Pick<StandardSectionSpec, "minPages" | "maxPages" | "targetPages"> {
  const match = STANDARD_SECTION_SPECS.find(
    (s) => s.title.toLowerCase() === title.toLowerCase(),
  );
  return match ?? { minPages: 1, maxPages: 5, targetPages: 3 };
}
