import type { Workspace } from "@workspace/db";
import type { Department } from "@workspace/db";

export type SearchQueryPlan = {
  queries: string[];
  cacheKey: string;
};

export function buildSearchQueryPlan(
  ws: Workspace,
  department?: Department | null,
): SearchQueryPlan {
  const year = new Date().getFullYear();
  const uni = ws.universityName?.trim() ?? "";
  const college = ws.collegeName?.trim() ?? "";
  const qual = ws.qualification?.trim() ?? "MD";
  const dept = department?.name ?? "";
  const domain = ws.domain;

  const queries: string[] = [];

  if (uni) {
    queries.push(`${uni} ${qual} dissertation thesis format guidelines ${year}`);
    if (dept) queries.push(`${uni} ${dept} PG thesis ordinance submission`);
    queries.push(`${uni} thesis plagiarism similarity limit binding copies`);
  }

  if (college) {
    queries.push(`${college} MD MS dissertation submission checklist ${year}`);
  }

  const regulatory =
    domain === "Allopathy"
      ? "NMC"
      : domain === "Ayurveda"
        ? "NCISM Ayurveda"
        : domain === "Homeopathy"
          ? "NCISM Homeopathy"
          : domain === "Siddha"
            ? "NCISM Siddha"
            : "NCISM Unani";

  queries.push(`${regulatory} PG dissertation guidelines ${domain} ${year}`);
  queries.push(`Indian medical university thesis formatting Vancouver references ${year}`);

  const cacheKey = [
    uni.toLowerCase(),
    dept.toLowerCase(),
    qual.toLowerCase(),
    domain.toLowerCase(),
    String(year),
  ]
    .filter(Boolean)
    .join("|");

  return { queries: [...new Set(queries)].slice(0, 8), cacheKey };
}
