import { db } from "@workspace/db";
import {
  workspacesTable,
  universityGuidelineTemplatesTable,
  domainSectionTemplatesTable,
  departmentThesisTemplatesTable,
  departmentsTable,
  universityDepartmentOverridesTable,
  preThesisBuildJobsTable,
  preThesisSourcesTable,
  preThesisConflictsTable,
  preThesisDocumentRevisionsTable,
} from "@workspace/db";
import { eq, and, ilike, desc } from "@workspace/db";
import { kimiWebSearch, kimiJsonCompletion, isMoonshotWebSearchEnabled } from "../lib/kimiTools";
import { uploadText, preThesisDraftPath, isStorageConfigured } from "../lib/supabaseStorage";
import { transitionWorkflow } from "./workflowState";
import { buildSearchQueryPlan } from "./preThesisSearchPlanner";
import { extractGuidelinesFromSearch, detectConflicts } from "./guidelineExtractor";
import {
  compilePreThesisMdV2,
  buildFormattingRows,
  DEFAULT_KEY_RULES,
  DEFAULT_REFERENCES_GUIDE,
} from "./preThesisCompilerV2";
import type { PreThesisDocumentV2, ChapterBlueprint } from "../types/preThesisDocumentV2";
import { PreThesisDocumentV2Schema } from "../types/preThesisDocumentV2";
import { computeCompletenessScore } from "./preThesisCompleteness";
import { collectLiteratureReferences } from "./preThesisLiteratureCollector";
import { bootstrapMasterCharts } from "./masterChartBootstrap";

export type TelemetryEvent = {
  type: string;
  message: string;
  progress?: number;
  agent?: string;
  timestamp: string;
};

function emit(events: TelemetryEvent[], type: string, message: string, progress?: number, agent?: string) {
  events.push({ type, message, progress, agent, timestamp: new Date().toISOString() });
}

async function appendTelemetry(jobId: number, events: TelemetryEvent[]) {
  await db
    .update(preThesisBuildJobsTable)
    .set({ telemetry: events })
    .where(eq(preThesisBuildJobsTable.id, jobId));
}

export async function runPreThesisBuild(
  workspaceId: number,
  jobId: number,
  onEvent?: (e: TelemetryEvent) => void,
): Promise<void> {
  const events: TelemetryEvent[] = [];
  const push = (type: string, message: string, progress?: number, agent?: string) => {
    emit(events, type, message, progress, agent);
    onEvent?.(events[events.length - 1]!);
    void appendTelemetry(jobId, [...events]);
  };

  const warnings: string[] = [];

  try {
    await db
      .update(preThesisBuildJobsTable)
      .set({ status: "running", startedAt: new Date(), currentAgent: "agent_1", buildVersion: 2 })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    const [ws] = await db.select().from(workspacesTable).where(eq(workspacesTable.id, workspaceId)).limit(1);
    if (!ws) throw new Error("Workspace not found");

    if (ws.workflowState === "init") {
      await transitionWorkflow(workspaceId, ws.userId, "pre_setup", { reason: "Pre-thesis build started" });
    }

    let department = null as (typeof departmentsTable.$inferSelect) | null;
    if (ws.departmentId) {
      const [d] = await db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.id, ws.departmentId))
        .limit(1);
      department = d ?? null;
    }

    // --- Agent 1: GuidelineFetcher ---
    push("agent_start", "Agent 1: University Guideline Fetcher", 5, "agent_1");

    let rules: Record<string, unknown> = {};
    const uniName = ws.universityName ?? "";
    const [template] = uniName
      ? await db
          .select()
          .from(universityGuidelineTemplatesTable)
          .where(
            and(
              ilike(universityGuidelineTemplatesTable.universityName, `%${uniName.split(" ")[0]}%`),
              eq(universityGuidelineTemplatesTable.domain, ws.domain),
            ),
          )
          .limit(1)
      : [];

    if (template) {
      rules = { ...(template.rulesJson as Record<string, unknown>) };
      await db.insert(preThesisSourcesTable).values({
        workspaceId,
        buildJobId: jobId,
        attribution: "template",
        title: `Template: ${template.universityName}`,
        snippet: JSON.stringify(rules).slice(0, 500),
        sourceType: "university_template",
      });
      push("template_loaded", `Template loaded: ${template.universityName}`, 12, "agent_1");
    } else {
      push("template_missing", "No internal template — initiating live search", 10, "agent_1");
    }

    const { queries, cacheKey } = buildSearchQueryPlan(ws, department);
    if (!isMoonshotWebSearchEnabled()) {
      warnings.push("Live web search unavailable — using template database only");
    }

    push("live_search", "Live search initiated...", 18, "agent_1");
    const liveResults = await kimiWebSearch(queries, cacheKey);

    for (const r of liveResults) {
      await db.insert(preThesisSourcesTable).values({
        workspaceId,
        buildJobId: jobId,
        attribution: "live",
        url: r.url || null,
        title: r.title,
        snippet: r.snippet,
        confidence: r.confidence ?? null,
        sourceType: r.sourceType ?? "web_search",
      });
      push("search_query", `Query: ${r.query ?? r.title}`, 25, "agent_1");
    }

    const liveRules = await extractGuidelinesFromSearch(rules, liveResults, uniName || ws.domain);
    rules = liveRules;

    // --- Agent 2: StructureMapper ---
    push("agent_start", "Agent 2: Domain & Department Structure Mapper", 35, "agent_2");
    await db
      .update(preThesisBuildJobsTable)
      .set({ currentAgent: "agent_2" })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    let preliminaryPages: Array<{ page: string; title: string; content: string }> = [];
    let chapters: Array<{ chapter: string; title: string; minPages?: number; maxPages?: number }> = [];
    let annexures: Array<{ id: string; title: string; content?: string }> = [];
    let blueprintSeed: ChapterBlueprint[] = [];
    let pageMin = (rules.pageLimitMin as number) ?? 50;
    let pageMax = (rules.pageLimitMax as number) ?? 150;
    let fontNotes = "Arial 11pt, 1.5 spacing, Vancouver";

    if (ws.departmentId) {
      const [deptTpl] = await db
        .select()
        .from(departmentThesisTemplatesTable)
        .where(
          and(
            eq(departmentThesisTemplatesTable.departmentId, ws.departmentId),
            eq(departmentThesisTemplatesTable.qualificationLevel, "pg"),
          ),
        )
        .limit(1);

      if (deptTpl) {
        preliminaryPages = deptTpl.preliminaryPagesJson as typeof preliminaryPages;
        chapters = (deptTpl.chaptersJson as typeof chapters).map((c) => ({
          chapter: String(c.chapter ?? ""),
          title: String(c.title ?? ""),
          minPages: c.minPages as number | undefined,
          maxPages: c.maxPages as number | undefined,
        }));
        annexures = (deptTpl.annexuresJson as typeof annexures).map((a) => ({
          id: String(a.id ?? ""),
          title: String(a.title ?? ""),
          content: a.content as string | undefined,
        }));
        blueprintSeed = deptTpl.chapterBlueprintSeedJson as ChapterBlueprint[];
        pageMin = deptTpl.defaultPageLimitMin ?? pageMin;
        pageMax = deptTpl.defaultPageLimitMax ?? pageMax;
        push("dept_template", `Department template: ${department?.name ?? ws.departmentId}`, 42, "agent_2");
      }
    }

    if (chapters.length === 0) {
      const [domainTpl] = await db
        .select()
        .from(domainSectionTemplatesTable)
        .where(eq(domainSectionTemplatesTable.domain, ws.domain))
        .limit(1);
      const sections = (domainTpl?.sectionsJson as Array<Record<string, unknown>>) ?? [];
      fontNotes = domainTpl?.fontSpacingNotes ?? fontNotes;
      pageMin = domainTpl?.pageLimitMin ?? pageMin;
      pageMax = domainTpl?.pageLimitMax ?? pageMax;
      chapters = sections.map((s, i) => ({
        chapter: String(i + 1),
        title: String(s.title ?? "Section"),
        minPages: s.minPages as number | undefined,
        maxPages: s.maxPages as number | undefined,
      }));
    }

    if (uniName && ws.departmentId) {
      const [override] = await db
        .select()
        .from(universityDepartmentOverridesTable)
        .where(
          and(
            ilike(universityDepartmentOverridesTable.universityName, `%${uniName.split(" ")[0]}%`),
            eq(universityDepartmentOverridesTable.departmentId, ws.departmentId),
          ),
        )
        .limit(1);
      if (override?.overrideJson) {
        const o = override.overrideJson as Record<string, unknown>;
        if (o.pageLimitMin) pageMin = o.pageLimitMin as number;
        if (o.pageLimitMax) pageMax = o.pageLimitMax as number;
        push("uni_override", `University-department override applied`, 48, "agent_2");
      }
    }

    // --- Agent 3: BlueprintWriter ---
    push("agent_start", "Agent 3: Chapter Blueprint Writer", 52, "agent_3");
    await db
      .update(preThesisBuildJobsTable)
      .set({ currentAgent: "agent_3" })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    let chapterBlueprints = blueprintSeed;

    const synopsisContext = [ws.synopsisText, ws.description, ws.researchNotes]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 40000);

    if (synopsisContext.trim()) {
      const { data: llmBlueprints } = await kimiJsonCompletion<{ blueprints: ChapterBlueprint[] }>(
        `You write detailed Indian medical PG thesis chapter blueprints. Return JSON: { "blueprints": [{ "chapter": "I", "title": "INTRODUCTION", "bullets": ["..."] }] }. Match standard IMRAD structure. Be specific to the study topic.`,
        `Thesis title: ${ws.title}
Department: ${department?.name ?? ws.domain}
Study type: ${ws.studyType ?? "Not specified"}
Synopsis/notes:
${synopsisContext}

Base blueprint seed:
${JSON.stringify(blueprintSeed)}

Expand each chapter with study-specific bullets (aims, sample size, variables, expected tables/figures, key papers to cite).`,
        4096,
      );
      if (llmBlueprints?.blueprints?.length) {
        chapterBlueprints = llmBlueprints.blueprints;
        push("blueprint_written", "Study-specific chapter blueprints generated", 62, "agent_3");
      }
    } else {
      warnings.push("No synopsis provided — using department default blueprints");
      push("blueprint_seed", "Using department blueprint seeds (no synopsis)", 60, "agent_3");
    }

    // --- Agent 4: Validator ---
    push("agent_start", "Agent 4: Guidelines Validator", 68, "agent_4");
    await db
      .update(preThesisBuildJobsTable)
      .set({ currentAgent: "agent_4" })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    const templateRules = (template?.rulesJson as Record<string, unknown>) ?? {};
    const conflicts = detectConflicts(templateRules, rules);

    for (const c of conflicts) {
      await db.insert(preThesisConflictsTable).values({
        workspaceId,
        buildJobId: jobId,
        fieldKey: c.fieldKey,
        templateValue: c.templateValue,
        liveValue: c.liveValue,
        severity: c.severity,
      });
      push("conflict", `${c.fieldKey}: template ${c.templateValue} vs live ${c.liveValue}`, 72, "agent_4");
    }

    if (conflicts.length === 0) {
      push("validation_ok", "Guidelines verified — no critical conflicts", 75, "agent_4");
    }

    rules.pageLimitMin = pageMin;
    rules.pageLimitMax = pageMax;

    // --- Agent 5: Compiler ---
    push("agent_start", "Agent 5: Reference MD Compiler", 78, "agent_5");
    await db
      .update(preThesisBuildJobsTable)
      .set({ currentAgent: "agent_5" })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    const liveVerifiedAt = new Date().toISOString();
    const qualLabel = ws.qualification ?? "PG";
    const degreeTitle = `${qualLabel} ${department?.name ?? ws.domain} THESIS`;

    const doc: PreThesisDocumentV2 = {
      buildVersion: 2,
      header: {
        degreeTitle,
        universityOrdinances: `Based on ${uniName || "University"} ordinances & ${department?.regulatoryBody ?? "NMC/NCISM"} PG regulations`,
        candidateName: ws.candidateName ?? undefined,
        guideName: ws.guideName ?? undefined,
        coGuideName: ws.coGuideName ?? undefined,
        departmentName: department?.name ?? undefined,
        collegeName: ws.collegeName ?? undefined,
        state: ws.state ?? undefined,
        universityName: uniName || undefined,
        workspaceTitle: ws.title,
        domain: ws.domain,
        qualification: ws.qualification ?? undefined,
        generatedAt: liveVerifiedAt,
        lastLiveVerifiedAt: liveVerifiedAt,
      },
      partA: {
        paginationNote: String(rules.preliminaryPagination ?? "Roman numerals (i, ii, iii...) — centered at bottom of each page"),
        preliminaryPages:
          preliminaryPages.length > 0
            ? preliminaryPages
            : [
                { page: "i", title: "Title Page", content: "Full title, candidate, guide, institution, year" },
                { page: "vii", title: "Abstract", content: "Max 250 words, structured, no references" },
              ],
      },
      partB: {
        paginationNote: String(rules.bodyPagination ?? "Arabic numerals (1, 2, 3...) — starts from Page 1"),
        pageLimitNote: `Minimum ${pageMin} pages, Maximum ${pageMax} pages — excluding tables, references, and annexures`,
        chapters,
      },
      partC: {
        paginationNote: "Continues Arabic pagination from main body",
        supplementary: annexures.map((a) => ({ title: a.title, content: a.content ?? a.title, id: a.id })),
      },
      formattingSpecs: {
        sourceNote: `${uniName || "University"} Official Formatting Guidelines`,
        rows: buildFormattingRows(rules, fontNotes),
      },
      chapterBlueprints,
      keyRules: DEFAULT_KEY_RULES,
      referencesGuide: {
        ...DEFAULT_REFERENCES_GUIDE,
        seedReferences: extractSynopsisReferences(ws.synopsisText),
      },
      annexureTemplates: annexures.map((a) => ({
        id: a.id,
        title: a.title,
        templateContent: a.content,
      })),
      lockedResearchContext: ws.researchNotes?.trim() || ws.description?.trim() || "_No additional research notes._",
      rulesJson: rules,
      sources: liveResults.map((r) => ({
        query: r.query,
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        attribution: "live" as const,
        confidence: r.confidence,
        sourceType: r.sourceType,
        fetchedAt: liveVerifiedAt,
      })),
      warnings,
    };

    const parsed = PreThesisDocumentV2Schema.safeParse(doc);
    if (!parsed.success) {
      warnings.push("Document validation had minor issues — compiled with defaults");
    }

    // --- Agent 7: Literature Reference Collector ---
    push("agent_start", "Agent 7: Literature Reference Collector", 82, "agent_7");
    await db
      .update(preThesisBuildJobsTable)
      .set({ currentAgent: "agent_7" })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    let literatureReferences: PreThesisDocumentV2["literatureReferences"] = [];
    try {
      literatureReferences = await collectLiteratureReferences(
        {
          workspaceId,
          userId: ws.userId,
          title: ws.title,
          domain: ws.domain,
          qualification: ws.qualification,
          departmentName: department?.name ?? null,
          synopsisText: ws.synopsisText,
          researchNotes: ws.researchNotes,
        },
        (msg) => push("literature_search", msg, 85, "agent_7"),
      );
      doc.literatureReferences = literatureReferences;
      push("literature_found", `${literatureReferences.length} references collected`, 88, "agent_7");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Literature collection failed";
      warnings.push(`Agent 7 warning: ${msg}`);
      push("literature_warn", `Literature collection skipped: ${msg}`, 88, "agent_7");
    }

    // Recompile markdown now that literatureReferences is merged into doc
    const md = compilePreThesisMdV2(parsed.success ? { ...parsed.data, literatureReferences } : doc);

    // --- Agent 8: Master Chart Shell Builder (only when needs_empty_files) ---
    push("agent_start", "Agent 8: Master Chart Shell Builder", 88, "agent_8");
    await db
      .update(preThesisBuildJobsTable)
      .set({ currentAgent: "agent_8" })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    let masterChartBootstrapResult: Awaited<ReturnType<typeof bootstrapMasterCharts>> = [];
    try {
      const plan = ws.datasetMasterChartPlan as Record<string, unknown> | null;
      masterChartBootstrapResult = await bootstrapMasterCharts(
        { workspaceId, userId: ws.userId, plan },
        (msg) => push("chart_shell_created", msg, 91, "agent_8"),
      );
      if (masterChartBootstrapResult.length > 0) {
        push("chart_bootstrap_complete", `${masterChartBootstrapResult.length} empty master chart shells created`, 94, "agent_8");
      } else {
        push("chart_bootstrap_skipped", "Chart shell builder skipped (no selection or has_marked_files)", 94, "agent_8");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chart bootstrap failed";
      warnings.push(`Agent 8 warning: ${msg}`);
      push("chart_bootstrap_warn", `Chart shell builder skipped: ${msg}`, 94, "agent_8");
    }

    // --- Final Quality Check & Persist ---
    push("agent_start", "Quality Check & Persist", 94, "agent_9");
    await db
      .update(preThesisBuildJobsTable)
      .set({ currentAgent: "agent_9" })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    const completenessScore = computeCompletenessScore(doc, liveResults.length);
    if (completenessScore < 70) {
      warnings.push(`Completeness score ${completenessScore}% — review before lock-in`);
    }
    if (liveResults.length < 2) {
      warnings.push("Fewer than 2 live sources — consider re-validating");
    }
    if (chapterBlueprints.length < 5) {
      warnings.push("Chapter blueprints may be incomplete");
    }

    await db
      .update(workspacesTable)
      .set({
        preThesisDraftMd: md,
        preThesisBuildVersion: 2,
        lastLiveVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workspacesTable.id, workspaceId));

    if (isStorageConfigured()) {
      await uploadText(preThesisDraftPath(workspaceId), md);
    }

    const resultJson: Record<string, unknown> = {
      ...(doc as unknown as Record<string, unknown>),
      masterChartBootstrap: masterChartBootstrapResult,
    };

    await db
      .update(preThesisBuildJobsTable)
      .set({
        status: "completed",
        currentAgent: null,
        completedAt: new Date(),
        resultJson,
        warnings,
        completenessScore,
      })
      .where(eq(preThesisBuildJobsTable.id, jobId));

    const [lastRev] = await db
      .select({ revision: preThesisDocumentRevisionsTable.revision })
      .from(preThesisDocumentRevisionsTable)
      .where(eq(preThesisDocumentRevisionsTable.workspaceId, workspaceId))
      .orderBy(desc(preThesisDocumentRevisionsTable.revision))
      .limit(1);

    await db.insert(preThesisDocumentRevisionsTable).values({
      workspaceId,
      revision: (lastRev?.revision ?? 0) + 1,
      resultJson,
      draftMd: md,
      completenessScore,
      createdByUserId: ws.userId,
      source: "build",
      summary: "8-agent build with literature references and chart shells",
    });

    push("complete", "Pre-thesis reference document compiled (v2, 8 agents)", 100, "agent_9");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Build failed";
    emit(events, "error", message);
    await db
      .update(preThesisBuildJobsTable)
      .set({
        status: "failed",
        error: message,
        completedAt: new Date(),
        telemetry: events,
      })
      .where(eq(preThesisBuildJobsTable.id, jobId));
    throw err;
  }
}

function extractSynopsisReferences(synopsis?: string | null): string[] | undefined {
  if (!synopsis) return undefined;
  const lines = synopsis.split("\n").filter((l) => /et al|\. \d{4}|doi:|pmid:/i.test(l));
  return lines.length > 0 ? lines.slice(0, 12) : undefined;
}
