import { z } from "zod";

export const LiteratureRefSchema = z.object({
  serialNo: z.number(),
  title: z.string(),
  authors: z.string(),
  year: z.number().nullable().optional(),
  journal: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  vancouverCitation: z.string(),
  relevanceNote: z.string().optional(),
  vaultResourceId: z.number().optional(),
  sourceType: z.literal("literature").default("literature"),
});

export const PreliminaryPageSchema = z.object({
  page: z.string(),
  title: z.string(),
  content: z.string(),
});

export const ChapterSchema = z.object({
  chapter: z.string(),
  title: z.string(),
  minPages: z.number().optional(),
  maxPages: z.number().optional(),
  notes: z.string().optional(),
});

export const AnnexureSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().optional(),
});

export const FormattingRowSchema = z.object({
  element: z.string(),
  specification: z.string(),
});

export const ChapterBlueprintSchema = z.object({
  chapter: z.string(),
  title: z.string(),
  bullets: z.array(z.string()),
});

export const SourceRefSchema = z.object({
  query: z.string().optional(),
  title: z.string(),
  url: z.string().optional(),
  snippet: z.string().optional(),
  attribution: z.enum(["template", "live"]).default("live"),
  confidence: z.string().optional(),
  sourceType: z.string().optional(),
  fetchedAt: z.string().optional(),
});

export const PreThesisDocumentV2Schema = z.object({
  buildVersion: z.literal(2),
  header: z.object({
    degreeTitle: z.string(),
    universityOrdinances: z.string(),
    candidateName: z.string().optional(),
    guideName: z.string().optional(),
    coGuideName: z.string().optional(),
    departmentName: z.string().optional(),
    collegeName: z.string().optional(),
    state: z.string().optional(),
    universityName: z.string().optional(),
    workspaceTitle: z.string(),
    domain: z.string(),
    qualification: z.string().optional(),
    generatedAt: z.string(),
    lastLiveVerifiedAt: z.string(),
  }),
  partA: z.object({
    paginationNote: z.string(),
    preliminaryPages: z.array(PreliminaryPageSchema),
  }),
  partB: z.object({
    paginationNote: z.string(),
    pageLimitNote: z.string(),
    chapters: z.array(ChapterSchema),
  }),
  partC: z.object({
    paginationNote: z.string(),
    supplementary: z.array(AnnexureSchema),
  }),
  formattingSpecs: z.object({
    sourceNote: z.string(),
    rows: z.array(FormattingRowSchema),
  }),
  chapterBlueprints: z.array(ChapterBlueprintSchema),
  keyRules: z.array(z.string()),
  referencesGuide: z.object({
    intro: z.string(),
    examples: z.array(z.string()),
    seedReferences: z.array(z.string()).optional(),
  }),
  annexureTemplates: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      templateContent: z.string().optional(),
    }),
  ),
  lockedResearchContext: z.string(),
  rulesJson: z.record(z.string(), z.unknown()),
  sources: z.array(SourceRefSchema),
  warnings: z.array(z.string()).default([]),
  literatureReferences: z.array(LiteratureRefSchema).default([]),
});

export type PreThesisDocumentV2 = z.infer<typeof PreThesisDocumentV2Schema>;
export type ChapterBlueprint = z.infer<typeof ChapterBlueprintSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type LiteratureRef = z.infer<typeof LiteratureRefSchema>;
