/** Medical thesis domain — matches workspace.domain / profile enum. */
export type ThesisMedicalDomain =
  | "Allopathy"
  | "Ayurveda"
  | "Homeopathy"
  | "Siddha"
  | "Unani"
  | string;

const NO_CJK =
  "Do NOT use Chinese characters (汉字), Japanese kanji, or Korean hanja. Use Latin transliteration for non-English terms.";

/** Language and terminology rules for Vision Reader, keyed to thesis domain. */
export function buildVisionDomainLanguageGuidance(domain: ThesisMedicalDomain): string {
  const d = (domain || "Allopathy").trim();

  switch (d) {
    case "Ayurveda":
      return `OUTPUT LANGUAGE: Write in clear English with authentic Ayurvedic terminology. Include standard Sanskrit terms in Latin transliteration (e.g. vata, pitta, kapha, dravya, rasa, prakriti) where clinically relevant, with brief English glosses for technical terms. ${NO_CJK}`;
    case "Siddha":
      return `OUTPUT LANGUAGE: Write in clear English with Siddha medicine terminology. Use Tamil/Sanskrit transliterations standard in Siddha PG theses (e.g. gunam, thathu, udal) alongside English. ${NO_CJK}`;
    case "Unani":
      return `OUTPUT LANGUAGE: Write in clear English with Unani (Greco-Arabic) terminology — standard transliteration (mizaj, akhlat, arkan) plus English clinical framing. ${NO_CJK}`;
    case "Homeopathy":
      return `OUTPUT LANGUAGE: Write in clear English with homeopathic terminology (remedy names, potency notation, repertory rubrics) using standard homeopathic nomenclature. ${NO_CJK}`;
    case "Allopathy":
    default:
      return `OUTPUT LANGUAGE: Write in standard English biomedical/clinical terminology (SI units, ICD-style disease names). ${NO_CJK}`;
  }
}

/** Short hint for Dataset AI when building chart from vision output. */
export function buildDatasetPromptFromVision(domain: ThesisMedicalDomain, usedContextFile: boolean): string {
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
    `Call read_full_context if needed, then build all required sheets and commit_version.`
  );
}
