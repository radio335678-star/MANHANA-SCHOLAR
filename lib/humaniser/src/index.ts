export interface HumaniserLevel {
  level: number;
  name: string;
  shortName: string;
  description: string;
  example: string;
  /** Instructions appended to the AI system prompt at this intensity level. */
  promptInjection: string;
}

export const HUMANISER_LEVELS: readonly HumaniserLevel[] = [
  {
    level: 0,
    name: "Raw AI",
    shortName: "Raw",
    description: "Pure model output — clinical, structured, no voice shaping.",
    example:
      "The study evaluated 80 participants. Results demonstrated statistical significance (p<0.05). Data were analyzed using SPSS.",
    promptInjection:
      "Write in clean, clinical academic prose. Apply no stylistic humanisation — output should be clear, structured, and factually precise.",
  },
  {
    level: 1,
    name: "Outline Draft",
    shortName: "Draft",
    description: "Minimal shaping. Useful for first-pass drafts and outlines.",
    example:
      "This study included 80 participants. The results showed statistical significance (p<0.05). Data analysis was performed using SPSS.",
    promptInjection:
      "Write clear academic prose with very minimal stylistic shaping. Reduce mechanical repetition of transition words. Keep formatting clean and structured.",
  },
  {
    level: 2,
    name: "Light Touch",
    shortName: "Light",
    description: "Subtle rhythm improvements and reduced transition repetition.",
    example:
      "The study included 80 participants. Results were statistically significant (p<0.05), with analysis performed in SPSS.",
    promptInjection:
      "Apply light humanisation: vary sentence structure slightly, reduce overuse of transition adverbs (Furthermore, Moreover, Additionally). Maintain a clinical academic register.",
  },
  {
    level: 3,
    name: "Lightly Humanised",
    shortName: "Lightly",
    description: "Natural pacing with organic paragraph openings. Subtle.",
    example:
      "The study enrolled 80 participants. The results were statistically significant (p<0.05), supporting the study hypothesis.",
    promptInjection:
      "Apply subtle humanisation: vary sentence openings, use referential transitions ('This finding...') instead of rote adverbs, introduce mild epistemic hedging ('appears to', 'suggests'). Maintain scholarly formality.",
  },
  {
    level: 4,
    name: "Scholar Voice",
    shortName: "Scholar",
    description:
      "Natural academic voice with good flow. Recommended for most thesis sections.",
    example:
      "Eighty participants were enrolled in this study. The observed findings achieved statistical significance at p<0.05, lending support to the study hypothesis.",
    promptInjection:
      "Write with a natural, mature academic voice. Vary sentence length (mix simple, compound, and complex sentences). Use conceptual paragraph transitions instead of explicit adverbs. Apply calibrated epistemic hedging ('may suggest', 'appears to indicate'). Avoid AI-signifier phrases.",
  },
  {
    level: 5,
    name: "Thesis-Optimal",
    shortName: "Optimal",
    description:
      "Full hedging, idiolect simulation, and organic syntax. Best for PG/PhD university submissions.",
    example:
      "Eighty participants were enrolled across study sites. The findings demonstrated statistical significance (p<0.05) and, notably, appeared to reinforce the primary hypothesis — a result consistent with recent literature in the field.",
    promptInjection:
      "Apply full scholarly humanisation: simulate authorial idiolect with preferred synonym rings (e.g. 'revealed' over 'showed'), vary syntax length extensively, use calibrated hedging ('tentatively indicate', 'it is plausible that'), introduce implicit logical flow in some paragraphs without explicit connectors. Suppress AI signifier phrases entirely. Write as a cautious postgraduate scholar thinking through their argument.",
  },
  {
    level: 6,
    name: "Flowing Prose",
    shortName: "Flowing",
    description: "Strong narrative flow with thematic paragraph linkage.",
    example:
      "Eighty participants were enrolled in the present study; the resultant data, subjected to rigorous statistical scrutiny, yielded significance at p<0.05 — a finding that both confirms the study hypothesis and opens avenues for further investigation.",
    promptInjection:
      "Write with strong narrative flow: ensure thematic linkage between paragraphs, use periodic sentences and embedded clauses for rhythm, build toward a concluding sentence that sets up the next paragraph. Vary lexical choices using a consistent authorial vocabulary profile. Avoid mechanical repetition at every level — syntax, connectors, and word choice.",
  },
  {
    level: 7,
    name: "Confident Prose",
    shortName: "Confident",
    description:
      "Assertive, confident academic voice. Ideal for Discussion and Conclusion sections.",
    example:
      "This study enrolled 80 participants; the findings were statistically significant (p<0.05), thereby reinforcing the hypothesis and underscoring the clinical relevance of the intervention under investigation.",
    promptInjection:
      "Write with a confident, assertive scholarly voice appropriate for Discussion and Conclusion sections. Use active voice for findings and interpretations. Assert the significance of results clearly while acknowledging limitations honestly. Employ sophisticated sentence constructions — semicolons, em-dashes, parenthetical clauses. Sound like a senior researcher who is certain of their data but appropriately measured in claims.",
  },
  {
    level: 8,
    name: "Deep Scholar",
    shortName: "Deep",
    description:
      "Advanced cognitive rhythm simulation with Indian English academic register.",
    example:
      "In the present investigation, 80 participants were recruited through purposive sampling; the data, once subjected to statistical analysis, demonstrated significance (p<0.05) — a result which, while anticipated, carries considerable weight given the methodological rigour applied throughout.",
    promptInjection:
      "Apply advanced humanisation: simulate cognitive rhythm — include brief parenthetical self-corrections, recursive elaborations, and deliberate epistemic qualifications that mirror a human scholar's thought process. Incorporate Indian English academic register where appropriate (e.g., preferred constructions from Ayurveda/medical writing traditions). Use field-specific idiolect. Introduce occasional zero-transition paragraphs where logical flow is self-evident. Vary paragraph length naturally — short paragraphs for emphasis, extended ones for analysis.",
  },
  {
    level: 9,
    name: "Ghost Writer",
    shortName: "Ghost",
    description:
      "Maximum humanisation — near-indistinguishable from a seasoned academic. Use with care.",
    example:
      "In the present investigation, eighty participants were recruited through purposive sampling — a methodological choice grounded in the need for a clinically homogeneous cohort. The resultant data, subjected to rigorous analysis, yielded statistical significance at p<0.05; this finding, whilst not entirely unexpected given the existing literature, carries meaningful implications for clinical practice, particularly in contexts where the intervention's efficacy has hitherto remained a subject of scholarly debate.",
    promptInjection:
      "Apply maximum humanisation. Write as a seasoned academic author with a fully developed scholarly voice: simulate reading-response integration (acknowledge complexity before resolving it), use organic literature critique voice ('while authors such as X have suggested...'), introduce synthetic reasoning pauses, employ culturally resonant academic phrasing for the medical humanities context. Vary all dimensions simultaneously — syntax length, lexical profile, transition strategy, hedging register, and paragraph rhythm. The output must be indistinguishable from a highly experienced human scholar. Avoid any AI-signifier patterns absolutely.",
  },
] as const;

export const DEFAULT_HUMANISER_LEVEL = 4;

export const MIN_HUMANISER_LEVEL = 0;
export const MAX_HUMANISER_LEVEL = 9;

/** Returns the humaniser level object, clamping to valid range. */
export function getHumaniserLevel(intensity: number): HumaniserLevel {
  const clamped = Math.max(
    MIN_HUMANISER_LEVEL,
    Math.min(MAX_HUMANISER_LEVEL, Math.round(intensity)),
  );
  return HUMANISER_LEVELS[clamped]!;
}

/** Badge colour class for a given intensity (Tailwind classes). */
export function humaniserBadgeClass(intensity: number): string {
  if (intensity <= 1) return "bg-secondary text-muted-foreground";
  if (intensity <= 3) return "bg-blue-100 text-blue-700";
  if (intensity <= 5) return "bg-primary/10 text-primary";
  if (intensity <= 7) return "bg-amber-100 text-amber-700";
  return "bg-purple-100 text-purple-700";
}
