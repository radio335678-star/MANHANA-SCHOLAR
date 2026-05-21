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

/** Excel column naming and sample-data style for Dataset AI — all 5 thesis domains. */
export function buildDatasetDomainExcelGuidance(domain: ThesisMedicalDomain): string {
  const d = (domain || "Allopathy").trim();

  switch (d) {
    case "Ayurveda":
      return `DOMAIN (Ayurveda): Use Ayurvedic master-chart conventions — English plus standard Sanskrit transliteration in headers where appropriate (e.g. prakriti, vikriti, roga, chikitsa, dravya). Prefer PG thesis terminology over generic Western-only labels when the study is Ayurvedic. SI units where measurements apply.`;
    case "Siddha":
      return `DOMAIN (Siddha): Use Siddha medicine master-chart conventions — English with Siddha/Tamil transliterated headers (e.g. gunam, thathu, udal, noi, maruthuvam) matching Siddha PG thesis practice.`;
    case "Unani":
      return `DOMAIN (Unani): Use Unani (Tibb) conventions — English with standard Unani transliterations (mizaj, akhlat, arkan, amraz) in column names where the protocol uses them.`;
    case "Homeopathy":
      return `DOMAIN (Homeopathy): Use homeopathic master-chart conventions — remedy (Latin nomenclature), potency (e.g. 30C, 200C), repertory rubrics, LM/Q potencies as relevant. Avoid allopathic-only lab columns unless the study includes them.`;
    case "Allopathy":
    default:
      return `DOMAIN (Allopathy): Use standard biomedical/clinical master-chart conventions — SI units, ICD-style diagnoses, vitals and lab columns (e.g. Age_yr, BMI_kgm2, HbA1c_%, SBP_mmHg) as appropriate to the protocol.`;
  }
}
