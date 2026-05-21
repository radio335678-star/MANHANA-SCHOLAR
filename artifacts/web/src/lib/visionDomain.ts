export type ThesisMedicalDomain =
  | "Allopathy"
  | "Ayurveda"
  | "Homeopathy"
  | "Siddha"
  | "Unani"
  | string;

/** Dataset AI prompt when sending Vision Reader output (short — full text goes in context file if large). */
export function buildDatasetPromptFromVision(
  domain: ThesisMedicalDomain,
  usedContextFile: boolean,
): string {
  const d = (domain || "Allopathy").trim();
  const domainChartHint: Record<string, string> = {
    Ayurveda: "Use Ayurvedic/Sanskrit transliterated column headers where appropriate for the study.",
    Siddha: "Use Siddha medicine column naming conventions for the study.",
    Unani: "Use Unani medicine terminology in column headers where appropriate.",
    Homeopathy: "Use homeopathic terminology for remedies, potencies, and rubrics where relevant.",
    Allopathy: "Use standard clinical/biomedical column names and SI units.",
  };
  const hint = domainChartHint[d] ?? domainChartHint.Allopathy;

  if (usedContextFile) {
    return (
      `Build or update the master chart Excel from the Vision Reader context file just attached (full document transcription). ` +
      `${hint} Call read_full_context first, then apply_sheet_patch, generate_sample_rows, validate_sheet, and commit_version.`
    );
  }

  return (
    `Build or update the master chart Excel from the Vision Reader transcription below. ${hint} ` +
    `Call read_full_context if needed, then build all required sheets and commit_version.\n\n--- Vision Reader ---\n\n`
  );
}

export function visionDomainLabel(domain: ThesisMedicalDomain): string {
  return (domain || "Allopathy").trim();
}
