import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const seedsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "db", "seeds");
const existing = JSON.parse(readFileSync(path.join(seedsDir, "university_guideline_templates.json"), "utf-8"));

const baseRules = {
  paper: "A4, 80 GSM bond",
  font: "Arial 11pt body, 14pt bold chapter titles",
  spacing: "1.5 line spacing",
  margins: "Left 1.5 inch, others 1 inch",
  pageLimitMin: 50,
  pageLimitMax: 150,
  binding: "Hard binding",
  referencing: "Vancouver",
  language: "British English",
  plagiarismMaxPercent: 10,
  preliminaryPagination: "Roman numerals centered at bottom",
  bodyPagination: "Arabic numerals centered at bottom",
};

const universities = [
  { name: "Maharashtra University of Health Sciences", domain: "Allopathy" },
  { name: "Rajiv Gandhi University of Health Sciences", domain: "Allopathy" },
  { name: "Dr. NTR University of Health Sciences", domain: "Allopathy" },
  { name: "Kaloji Narayana Rao University of Health Sciences", domain: "Allopathy" },
  { name: "King George's Medical University", domain: "Allopathy" },
  { name: "Banaras Hindu University", domain: "Allopathy" },
  { name: "All India Institute of Medical Sciences Delhi", domain: "Allopathy" },
  { name: "Jawaharlal Institute of Postgraduate Medical Education and Research", domain: "Allopathy" },
  { name: "Post Graduate Institute of Medical Education and Research", domain: "Allopathy" },
  { name: "Sri Ramachandra Institute of Higher Education and Research", domain: "Allopathy" },
  { name: "Tamil Nadu Dr. M.G.R. Medical University", domain: "Allopathy" },
  { name: "The Tamil Nadu Dr. MGR Medical University", domain: "Allopathy" },
  { name: "West Bengal University of Health Sciences", domain: "Allopathy" },
  { name: "Uttar Pradesh University of Medical Sciences", domain: "Allopathy" },
  { name: "Kerala University of Health Sciences", domain: "Allopathy" },
  { name: "Gujarat University", domain: "Allopathy" },
  { name: "Savitribai Phule Pune University", domain: "Allopathy" },
  { name: "Mumbai University", domain: "Allopathy" },
  { name: "JSS Academy of Higher Education and Research", domain: "Allopathy" },
  { name: "Kasturba Medical College Manipal", domain: "Allopathy" },
  { name: "Dr. YSR University of Health Sciences", domain: "Ayurveda" },
  { name: "Rajiv Gandhi University of Health Sciences", domain: "Ayurveda" },
  { name: "Maharashtra University of Health Sciences", domain: "Ayurveda" },
  { name: "Rajiv Gandhi University of Health Sciences", domain: "Homeopathy" },
  { name: "Maharashtra University of Health Sciences", domain: "Homeopathy" },
  { name: "Tamil Nadu Dr. MGR Medical University", domain: "Siddha" },
  { name: "Rajiv Gandhi University of Health Sciences", domain: "Unani" },
];

const names = new Set(existing.map((u) => `${u.universityName}|${u.domain}`));
const added = [];

for (const u of universities) {
  const key = `${u.name}|${u.domain}`;
  if (names.has(key)) continue;
  names.add(key);
  added.push({
    universityName: u.name,
    domain: u.domain,
    qualificationLevel: "pg",
    version: "2025",
    effectiveYear: 2025,
    rulesJson: { ...baseRules },
  });
}

writeFileSync(
  path.join(seedsDir, "university_guideline_templates.json"),
  JSON.stringify([...existing, ...added], null, 2),
);
console.log(`Added ${added.length} university templates (total ${existing.length + added.length})`);
