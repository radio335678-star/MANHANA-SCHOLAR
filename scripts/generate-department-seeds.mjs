/**
 * Generates lib/db/seeds/departments.json and department_thesis_templates.json
 * Run: node scripts/generate-department-seeds.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.join(__dirname, "..", "lib", "db", "seeds");

const ALLOPATHY = [
  "Anatomy", "Physiology", "Biochemistry", "Pharmacology", "Microbiology", "Pathology",
  "Forensic Medicine", "Community Medicine", "General Medicine", "General Surgery",
  "Obstetrics and Gynaecology", "Paediatrics", "Radiodiagnosis", "Radiotherapy",
  "Anaesthesiology", "Dermatology", "Psychiatry", "Ophthalmology", "ENT",
  "Orthopaedics", "Plastic Surgery", "Urology", "Nephrology", "Neurology",
  "Neurosurgery", "Cardiology", "Cardiothoracic and Vascular Surgery", "Gastroenterology",
  "Hematology", "Medical Oncology", "Surgical Oncology", "Pulmonary Medicine",
  "Physical Medicine and Rehabilitation", "Emergency Medicine", "Transfusion Medicine",
  "Nuclear Medicine", "Clinical Immunology", "Endocrinology", "Rheumatology",
  "Infectious Diseases", "Critical Care Medicine", "Neonatology", "Maternal and Child Health",
  "Community Health", "Hospital Administration", "Medical Genetics", "Geriatric Medicine",
  "Palliative Medicine", "Sports Medicine", "Aviation Medicine", "Tropical Medicine",
  "Occupational Health", "Family Medicine", "Oral and Maxillofacial Surgery",
  "Vascular Surgery", "Pediatric Surgery", "Neonatal Surgery", "Burns and Plastic Surgery",
];

const AYURVEDA = [
  "Kayachikitsa", "Panchakarma", "Shalya Tantra", "Shalakya Tantra", "Stri Roga and Prasuti Tantra",
  "Kaumarbhritya", "Swasthavritta", "Dravyaguna", "Rasashastra and Bhaishajya Kalpana",
  "Roga Nidan and Vikriti Vigyan", "Samhita and Siddhanta", "Agad Tantra",
  "Anatomy (Rachana Sharir)", "Physiology (Kriya Sharir)", "Biochemistry", "Pharmacology",
];

const HOMEOPATHY = [
  "Organon of Medicine", "Repertory", "Materia Medica", "Practice of Medicine",
  "Homeopathic Pharmacy", "Paediatrics", "Psychiatry", "Obstetrics and Gynaecology",
  "Surgery", "Community Medicine", "Pathology", "Forensic Medicine",
];

const SIDDHA = [
  "Maruthuvam", "Sirappu Maruthuvam", "Pillaippini Maruthuvam", "Nanju Noolum Maruthuva Neethi Noolum",
  "Noi Nadal", "Gunapadam", "Udal Koorugal", "Siddha Maruthuva Adippagam",
  "Community Medicine", "Siddha Pharmacy",
];

const UNANI = [
  "Moalijat", "Kulliyat", "Tahaffuzi wa Samaji Tib", "Ilmul Advia", "Jarahat",
  "Amraz-e-Atfal", "Amraz-e-Niswan", "Ilaj bit Tadbeer", "Niswan wa Qabalat",
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function defaultPreliminaryPages() {
  return [
    { page: "i", title: "Title Page", content: "Full title, candidate name, degree, department, institution, guide name, year" },
    { page: "ii", title: "Guide's Certificate", content: "Signed by guide, designation, department" },
    { page: "iii", title: "HOD's Certificate", content: "Signed by Head of Department" },
    { page: "iv", title: "Principal's/Dean's Certificate", content: "Institution certificate" },
    { page: "v", title: "Declaration by Candidate", content: "Standard university declaration format" },
    { page: "vi", title: "Acknowledgements", content: "1 page max" },
    { page: "vii", title: "Abstract", content: "Structured: Background / Aims / Methods / Results / Conclusion — max 250 words, single-spaced, NO references" },
    { page: "viii", title: "Table of Contents", content: "With page numbers" },
    { page: "ix", title: "List of Tables", content: "All tables numbered and titled" },
    { page: "x", title: "List of Figures", content: "All figures numbered and titled" },
    { page: "xi", title: "List of Abbreviations", content: "All abbreviations used in thesis" },
  ];
}

function defaultChapters() {
  return [
    { chapter: "I", title: "INTRODUCTION", minPages: 8, maxPages: 12 },
    { chapter: "II", title: "REVIEW OF LITERATURE", minPages: 20, maxPages: 30 },
    { chapter: "III", title: "AIMS AND OBJECTIVES", minPages: 1, maxPages: 2 },
    { chapter: "IV", title: "MATERIALS AND METHODS", minPages: 10, maxPages: 15 },
    { chapter: "V", title: "RESULTS", minPages: 20, maxPages: 30 },
    { chapter: "VI", title: "DISCUSSION", minPages: 15, maxPages: 20 },
    { chapter: "VII", title: "SUMMARY AND CONCLUSION", minPages: 3, maxPages: 5 },
  ];
}

function defaultAnnexures() {
  return [
    { id: "I", title: "Proforma / Data Collection Sheet" },
    { id: "II", title: "Patient Information Sheet (English)" },
    { id: "III", title: "Patient Information Sheet (Regional Language)" },
    { id: "IV", title: "Informed Consent Form" },
    { id: "V", title: "IEC Approval Certificate" },
    { id: "VI", title: "Master Chart (Patient Data Table)" },
  ];
}

function defaultBlueprintSeed(deptName) {
  return [
    {
      chapter: "I",
      title: "INTRODUCTION",
      bullets: [
        `Disease burden and epidemiology relevant to ${deptName}`,
        "Clinical and economic impact",
        "Current diagnostic/therapeutic approaches and limitations",
        "Rationale and gap in literature — justification for this study",
      ],
    },
    {
      chapter: "II",
      title: "REVIEW OF LITERATURE",
      bullets: [
        "Historical evolution and foundational concepts",
        "Pathophysiology and mechanisms",
        "Published international studies (chronological)",
        "Published Indian studies",
        "Limitations of existing literature and research gaps",
      ],
    },
    {
      chapter: "III",
      title: "AIMS AND OBJECTIVES",
      bullets: ["PRIMARY OBJECTIVE: (from synopsis)", "SECONDARY OBJECTIVES: (from synopsis)"],
    },
    {
      chapter: "IV",
      title: "MATERIALS AND METHODS",
      bullets: [
        "Study design, setting, duration",
        "Ethical clearance (IEC reference)",
        "Sample size calculation and formula",
        "Inclusion and exclusion criteria",
        "Study variables and equipment",
        "Statistical analysis plan",
      ],
    },
    {
      chapter: "V",
      title: "RESULTS",
      bullets: [
        "Demographic profile table",
        "Primary outcome tables with mean ± SD and p-values",
        "Secondary outcome tables",
        "Representative figures and charts",
        "ROC/correlation analyses if applicable",
      ],
    },
    {
      chapter: "VI",
      title: "DISCUSSION",
      bullets: [
        "Compare findings with published literature",
        "Mechanistic interpretation",
        "Clinical utility and implications",
        "Limitations and strengths",
      ],
    },
    {
      chapter: "VII",
      title: "SUMMARY AND CONCLUSION",
      bullets: [
        "Summary of methodology and key findings",
        "Conclusion answering all objectives",
        "Clinical implications and future research",
      ],
    },
  ];
}

const catalog = [
  ...ALLOPATHY.map((name) => ({ domain: "Allopathy", name, regulatoryBody: "NMC" })),
  ...AYURVEDA.map((name) => ({ domain: "Ayurveda", name, regulatoryBody: "NCISM" })),
  ...HOMEOPATHY.map((name) => ({ domain: "Homeopathy", name, regulatoryBody: "NCISM" })),
  ...SIDDHA.map((name) => ({ domain: "Siddha", name, regulatoryBody: "NCISM" })),
  ...UNANI.map((name) => ({ domain: "Unani", name, regulatoryBody: "NCISM" })),
];

const departments = catalog.map((d) => ({
  domain: d.domain,
  name: d.name,
  slug: slugify(d.name),
  qualificationLevels: ["pg"],
  regulatoryBody: d.regulatoryBody,
}));

const templates = departments.map((d) => ({
  departmentSlug: d.slug,
  domain: d.domain,
  qualificationLevel: "pg",
  preliminaryPagesJson: defaultPreliminaryPages(),
  chaptersJson: defaultChapters(),
  annexuresJson: defaultAnnexures(),
  defaultPageLimitMin: d.domain === "Allopathy" ? 50 : 50,
  defaultPageLimitMax: d.domain === "Allopathy" ? 150 : 150,
  chapterBlueprintSeedJson: defaultBlueprintSeed(d.name),
}));

writeFileSync(path.join(seedsDir, "departments.json"), JSON.stringify(departments, null, 2));
writeFileSync(path.join(seedsDir, "department_thesis_templates.json"), JSON.stringify(templates, null, 2));
console.log(`Generated ${departments.length} departments and ${templates.length} templates`);
