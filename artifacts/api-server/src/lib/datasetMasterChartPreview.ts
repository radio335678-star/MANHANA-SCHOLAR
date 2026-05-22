/**
 * Dataset Master-Chart Preview — Kimi analysis prompt & types.
 *
 * Called stateless (pre-workspace) from the analyze endpoint.
 * Reads synopsis + resource text and returns a categorised list of
 * recommended master-chart names grouped into must-have, good-to-have,
 * and nice-to-have.
 */
import { randomUUID } from "node:crypto";
import { createKimiCompletion } from "./kimiModelRouter";
import { getKimiApiKey } from "./kimiModels";
import { parseModelJson } from "./kimiJsonParse";
import { logger } from "./logger";

// ──────────────────────────────────────────────────────────────────────────────
// Shared types (also imported by the route and the frontend via API response)
// ──────────────────────────────────────────────────────────────────────────────

export type DatasetChartCategory = "must_have" | "good_to_have" | "nice_to_have";

export type DatasetChartSuggestion = {
  id: string;               // stable uuid assigned server-side
  name: string;             // e.g. "Master Chart — Demographics"
  category: DatasetChartCategory;
  reason: string;           // 1-2 sentence rationale
  columnHints: string[];    // likely column names (non-exhaustive)
  confidence: "high" | "medium" | "low";
  sourceHint?: string;      // short excerpt from synopsis that triggered this
};

export type DatasetPreviewAnalysis = {
  analysisId: string;
  summary: string;
  studyDesignSignal: string;   // e.g. "Prospective RCT — 60 participants, 2 arms"
  categories: {
    mustHave: DatasetChartSuggestion[];
    goodToHave: DatasetChartSuggestion[];
    niceToHave: DatasetChartSuggestion[];
  };
  tokensUsed: number;
};

// ──────────────────────────────────────────────────────────────────────────────
// Prompting
// ──────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior medical research statistician and dataset planning expert embedded in a thesis-writing platform called Manthana Scholar.

Your task: given the researcher's synopsis, notes, and any uploaded files, identify the dataset master charts (Excel worksheets) they will need to conduct and report their study.

### Output rules
- Respond with ONLY valid JSON — no prose, no markdown fence, no trailing commentary.
- Root object must have exactly these keys: summary, studyDesignSignal, charts.
- "charts" is an array; each element has exactly: name, category, reason, columnHints, confidence, sourceHint.
- "name" must look like "Master Chart — <concise descriptor>", e.g. "Master Chart — Demographics and Baseline".
- "category" must be one of: must_have | good_to_have | nice_to_have.
- "reason" is 1–2 sentences, clinically specific (mention variables, outcome, time-points where relevant).
- "columnHints" is a JSON array of 4–8 likely column headers (strings), specific to this study.
- "confidence" is high | medium | low.
- "sourceHint" is a short (<120 char) verbatim or paraphrased excerpt from the synopsis that justified this suggestion. Omit if none.

### Category definitions
- must_have: Without this chart the core data cannot be collected or analysed. Every study needs Demographics; most need at least one outcome sheet.
- good_to_have: Strongly recommended for completeness and publication quality, but the study could technically proceed without it.
- nice_to_have: Optional enrichment data — useful if time/resources allow, often secondary outcomes, quality-of-life instruments, or adverse-event logs.

### Safety rule
Do NOT fabricate variables that are not inferable from the synopsis. If you are uncertain about specifics, keep columnHints generic but flag confidence as "low".

### Minimum output
Always emit at minimum 1 must_have chart (Demographics is universally applicable) even if no synopsis is provided.`;

function buildUserMessage(ctx: {
  title: string;
  domain: string;
  qualification: string;
  synopsisText: string;
  resourceTexts: string[];
  researchNotes: string;
}): string {
  const parts: string[] = [];

  parts.push(`Thesis title: ${ctx.title || "(not provided)"}`);
  parts.push(`Domain: ${ctx.domain || "(not provided)"}`);
  parts.push(`Qualification: ${ctx.qualification || "(not provided)"}`);

  if (ctx.synopsisText.trim()) {
    parts.push(`\n--- SYNOPSIS (first 6000 chars) ---\n${ctx.synopsisText.slice(0, 6000)}`);
  }

  ctx.resourceTexts.forEach((txt, i) => {
    if (txt.trim()) {
      parts.push(`\n--- RESOURCE FILE ${i + 1} (first 3000 chars) ---\n${txt.slice(0, 3000)}`);
    }
  });

  if (ctx.researchNotes.trim()) {
    parts.push(`\n--- RESEARCHER'S NOTES ---\n${ctx.researchNotes.slice(0, 2000)}`);
  }

  parts.push("\nAnalyse the above and return the JSON as specified.");
  return parts.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Conservative fallback when Kimi doesn't return parseable JSON
// ──────────────────────────────────────────────────────────────────────────────

function conservativeFallback(domain: string): DatasetPreviewAnalysis {
  const charts: DatasetChartSuggestion[] = [
    {
      id: randomUUID(),
      name: "Master Chart — Demographics and Baseline Characteristics",
      category: "must_have",
      reason: "Captures patient identifiers, age, sex, and baseline clinical parameters — mandatory for any clinical study.",
      columnHints: ["Patient ID", "Age (years)", "Sex", "Date of enrolment", "Diagnosis", "Comorbidities"],
      confidence: "high",
    },
    {
      id: randomUUID(),
      name: "Master Chart — Primary Outcome",
      category: "must_have",
      reason: "Records the study's main endpoint measurement(s) at each time-point.",
      columnHints: ["Patient ID", "Time-point", "Outcome variable", "Value", "Unit", "Observer remarks"],
      confidence: "medium",
    },
    {
      id: randomUUID(),
      name: "Master Chart — Secondary Outcomes",
      category: "good_to_have",
      reason: `Secondary endpoints relevant to a ${domain || "medical"} study, used for subgroup analyses and publication.`,
      columnHints: ["Patient ID", "Variable", "Baseline", "Follow-up 1", "Follow-up 2", "Notes"],
      confidence: "medium",
    },
    {
      id: randomUUID(),
      name: "Master Chart — Adverse Events and Complications",
      category: "good_to_have",
      reason: "Safety monitoring table for any complications or unintended events during the study period.",
      columnHints: ["Patient ID", "Event date", "Event description", "Grade (CTCAE)", "Action taken", "Outcome"],
      confidence: "medium",
    },
    {
      id: randomUUID(),
      name: "Master Chart — Follow-up and Dropout",
      category: "nice_to_have",
      reason: "Tracks patient retention, loss-to-follow-up dates, and reasons for dropout.",
      columnHints: ["Patient ID", "Follow-up date", "Status", "Lost-to-FU reason", "Withdrawn", "Notes"],
      confidence: "low",
    },
  ];

  return {
    analysisId: randomUUID(),
    summary: "Standard clinical study master-chart template (synopsis not parsed).",
    studyDesignSignal: "Study design inferred from domain — upload synopsis for precise recommendations.",
    categories: {
      mustHave: charts.filter((c) => c.category === "must_have"),
      goodToHave: charts.filter((c) => c.category === "good_to_have"),
      niceToHave: charts.filter((c) => c.category === "nice_to_have"),
    },
    tokensUsed: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────────────────────────

type KimiChartRaw = {
  name: string;
  category: string;
  reason: string;
  columnHints: string[];
  confidence: string;
  sourceHint?: string;
};

type KimiResponseRaw = {
  summary: string;
  studyDesignSignal: string;
  charts: KimiChartRaw[];
};

function isValidCategory(c: string): c is DatasetChartCategory {
  return ["must_have", "good_to_have", "nice_to_have"].includes(c);
}

function isValidConfidence(c: string): c is "high" | "medium" | "low" {
  return ["high", "medium", "low"].includes(c);
}

function normaliseChart(raw: KimiChartRaw): DatasetChartSuggestion {
  const category: DatasetChartCategory = isValidCategory(raw.category) ? raw.category : "good_to_have";
  return {
    id: randomUUID(),
    name: raw.name ?? "Master Chart",
    category,
    reason: raw.reason ?? "",
    columnHints: Array.isArray(raw.columnHints) ? raw.columnHints.map(String) : [],
    confidence: isValidConfidence(raw.confidence) ? raw.confidence : "medium",
    sourceHint: raw.sourceHint?.slice(0, 140),
  };
}

export async function analyseDatasetMasterCharts(ctx: {
  title: string;
  domain: string;
  qualification: string;
  synopsisText: string;
  resourceTexts: string[];
  researchNotes: string;
}): Promise<DatasetPreviewAnalysis> {
  if (!getKimiApiKey()) {
    throw new Error("AI analysis is not configured. Set KIMI_API_KEY to enable dataset master-chart analysis.");
  }

  const userMessage = buildUserMessage(ctx);

  try {
    const { result, modelUsed } = await createKimiCompletion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 4096,
      thinking: { type: "enabled" },
    });

    const tokensUsed = result.usage?.total_tokens ?? 0;
    const parsed = parseModelJson<KimiResponseRaw>(result.choices[0]?.message ?? null);

    if (!parsed || !Array.isArray(parsed.charts)) {
      logger.warn({ modelUsed }, "Dataset preview: Kimi returned non-parseable JSON — using fallback");
      return conservativeFallback(ctx.domain);
    }

    const charts = parsed.charts.map(normaliseChart);

    logger.info(
      { chartCount: charts.length, modelUsed, tokensUsed },
      "Dataset master-chart preview analysis complete",
    );

    return {
      analysisId: randomUUID(),
      summary: parsed.summary ?? "Analysis complete.",
      studyDesignSignal: parsed.studyDesignSignal ?? "",
      categories: {
        mustHave: charts.filter((c) => c.category === "must_have"),
        goodToHave: charts.filter((c) => c.category === "good_to_have"),
        niceToHave: charts.filter((c) => c.category === "nice_to_have"),
      },
      tokensUsed,
    };
  } catch (err) {
    logger.error({ err }, "Dataset master-chart preview Kimi call failed — using fallback");
    return conservativeFallback(ctx.domain);
  }
}
