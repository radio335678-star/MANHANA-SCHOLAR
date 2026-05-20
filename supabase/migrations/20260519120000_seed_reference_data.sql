-- Reference data + thesis templates for production (idempotent)

INSERT INTO domains (name, slug, description, color)
SELECT * FROM (VALUES
  ('Allopathy', 'allopathy', 'Modern evidence-based medicine including MBBS, MD, MS, and surgical specialties.', 'blue'),
  ('Ayurveda', 'ayurveda', 'Classical Indian system rooted in Charaka, Susruta Samhita. BAMS, MD Ayu.', 'amber'),
  ('Homeopathy', 'homeopathy', 'Principle of similars and potentization. BHMS, MD Hom specialties.', 'teal'),
  ('Siddha', 'siddha', 'Tamil classical medicine. BSMS, MD Siddha.', 'purple'),
  ('Unani', 'unani', 'Greco-Arabic system of medicine. BUMS, MD Unani.', 'rose')
) AS v(name, slug, description, color)
WHERE NOT EXISTS (SELECT 1 FROM domains d WHERE d.slug = v.slug);

INSERT INTO qualifications (name, abbreviation, domain, level)
SELECT * FROM (VALUES
  ('MBBS', 'MBBS', 'Allopathy', 'ug'),
  ('MD', 'MD', 'Allopathy', 'pg'),
  ('MS', 'MS', 'Allopathy', 'pg'),
  ('MCh', 'MCh', 'Allopathy', 'pg'),
  ('DM', 'DM', 'Allopathy', 'pg'),
  ('DNB', 'DNB', 'Allopathy', 'pg'),
  ('PhD', 'PhD', 'Allopathy', 'pg'),
  ('MPH', 'MPH', 'Allopathy', 'pg'),
  ('MSc Medical', 'MSc', 'Allopathy', 'pg'),
  ('BAMS', 'BAMS', 'Ayurveda', 'ug'),
  ('MD Ayu', 'MD', 'Ayurveda', 'pg'),
  ('MS Ayu', 'MS', 'Ayurveda', 'pg'),
  ('PhD Ayurveda', 'PhD', 'Ayurveda', 'pg'),
  ('PG Diploma Ayurveda', 'PG Dip', 'Ayurveda', 'pg'),
  ('BHMS', 'BHMS', 'Homeopathy', 'ug'),
  ('MD Hom', 'MD', 'Homeopathy', 'pg'),
  ('PhD Homeopathy', 'PhD', 'Homeopathy', 'pg'),
  ('PG Diploma Homoeopathy', 'PG Dip', 'Homeopathy', 'pg'),
  ('BSMS', 'BSMS', 'Siddha', 'ug'),
  ('MD Siddha', 'MD', 'Siddha', 'pg'),
  ('PhD Siddha', 'PhD', 'Siddha', 'pg'),
  ('BUMS', 'BUMS', 'Unani', 'ug'),
  ('MD Unani', 'MD', 'Unani', 'pg'),
  ('MS Unani', 'MS', 'Unani', 'pg'),
  ('PhD Unani', 'PhD', 'Unani', 'pg')
) AS v(name, abbreviation, domain, level)
WHERE NOT EXISTS (
  SELECT 1 FROM qualifications q
  WHERE q.name = v.name AND q.domain = v.domain
);

INSERT INTO domain_section_templates (domain, qualification_level, sections_json, page_limit_min, page_limit_max, font_spacing_notes)
SELECT 'Allopathy', 'pg', '[{"title":"Title Page","minPages":1,"maxPages":1},{"title":"Certificate","minPages":1,"maxPages":1},{"title":"Declaration","minPages":1,"maxPages":1},{"title":"Acknowledgements","minPages":1,"maxPages":1},{"title":"Abstract","minPages":1,"maxPages":1},{"title":"List of Abbreviations","minPages":1,"maxPages":1},{"title":"Introduction","minPages":2,"maxPages":4},{"title":"Aims & Objectives","minPages":1,"maxPages":1},{"title":"Review of Literature","minPages":10,"maxPages":20},{"title":"Materials & Methods","minPages":3,"maxPages":8},{"title":"Observations & Results","minPages":5,"maxPages":15},{"title":"Discussion","minPages":8,"maxPages":12},{"title":"Conclusion & Summary","minPages":2,"maxPages":3},{"title":"References","minPages":5,"maxPages":10},{"title":"Tables","minPages":2,"maxPages":5},{"title":"Annexures","minPages":1,"maxPages":5}]'::jsonb, 60, 100, 'Arial/TNR 12pt, 1.5/Double spacing, Vancouver'
WHERE NOT EXISTS (SELECT 1 FROM domain_section_templates WHERE domain = 'Allopathy' AND qualification_level = 'pg');

INSERT INTO domain_section_templates (domain, qualification_level, sections_json, page_limit_min, page_limit_max, font_spacing_notes)
SELECT 'Ayurveda', 'pg', '[{"title":"Title Page","minPages":1,"maxPages":1},{"title":"Certificate","minPages":1,"maxPages":1},{"title":"Introduction","minPages":2,"maxPages":4},{"title":"Review of Literature","minPages":10,"maxPages":20},{"title":"Materials & Methods","minPages":3,"maxPages":8},{"title":"Results","minPages":5,"maxPages":15},{"title":"Discussion","minPages":8,"maxPages":12},{"title":"Conclusion","minPages":2,"maxPages":3},{"title":"References","minPages":5,"maxPages":10}]'::jsonb, 50, 150, 'Arial 12pt, Double spacing, Vancouver'
WHERE NOT EXISTS (SELECT 1 FROM domain_section_templates WHERE domain = 'Ayurveda' AND qualification_level = 'pg');

INSERT INTO domain_section_templates (domain, qualification_level, sections_json, page_limit_min, page_limit_max, font_spacing_notes)
SELECT 'Homeopathy', 'pg', '[{"title":"Title Page","minPages":1,"maxPages":1},{"title":"Introduction","minPages":2,"maxPages":4},{"title":"Review of Literature","minPages":10,"maxPages":20},{"title":"Material & Methods","minPages":3,"maxPages":8},{"title":"Results","minPages":5,"maxPages":15},{"title":"Discussion","minPages":8,"maxPages":12},{"title":"Conclusion","minPages":2,"maxPages":3},{"title":"References","minPages":5,"maxPages":10}]'::jsonb, 50, 150, 'Arial/TNR 12pt, Double spacing'
WHERE NOT EXISTS (SELECT 1 FROM domain_section_templates WHERE domain = 'Homeopathy' AND qualification_level = 'pg');

INSERT INTO domain_section_templates (domain, qualification_level, sections_json, page_limit_min, page_limit_max, font_spacing_notes)
SELECT 'Siddha', 'pg', '[{"title":"Title Page","minPages":1,"maxPages":1},{"title":"Introduction","minPages":2,"maxPages":4},{"title":"Review of Literature","minPages":10,"maxPages":20},{"title":"Materials & Methods","minPages":3,"maxPages":8},{"title":"Results","minPages":5,"maxPages":15},{"title":"Discussion","minPages":8,"maxPages":12},{"title":"Conclusion","minPages":2,"maxPages":3},{"title":"References","minPages":5,"maxPages":10}]'::jsonb, 60, 100, 'Arial 12pt, Double spacing'
WHERE NOT EXISTS (SELECT 1 FROM domain_section_templates WHERE domain = 'Siddha' AND qualification_level = 'pg');

INSERT INTO domain_section_templates (domain, qualification_level, sections_json, page_limit_min, page_limit_max, font_spacing_notes)
SELECT 'Unani', 'pg', '[{"title":"Title Page","minPages":1,"maxPages":1},{"title":"Introduction","minPages":2,"maxPages":4},{"title":"Review of Literature","minPages":10,"maxPages":20},{"title":"Materials & Methods","minPages":3,"maxPages":8},{"title":"Results","minPages":5,"maxPages":15},{"title":"Discussion","minPages":8,"maxPages":12},{"title":"Conclusion","minPages":2,"maxPages":3},{"title":"References","minPages":5,"maxPages":10}]'::jsonb, 60, 100, 'Arial 12pt, Double spacing'
WHERE NOT EXISTS (SELECT 1 FROM domain_section_templates WHERE domain = 'Unani' AND qualification_level = 'pg');

INSERT INTO university_guideline_templates (university_name, domain, qualification_level, rules_json, version, effective_year)
SELECT 'Maharashtra University of Health Sciences', 'Allopathy', 'pg', '{"paper":"A4, 80 GSM bond","font":"Arial 12pt body, 14pt bold headings","spacing":"Double line spacing","margins":"1 inch all sides","pageLimitMin":60,"pageLimitMax":100,"binding":"Hard binding only","referencing":"Vancouver","language":"British English"}'::jsonb, '2025', 2025
WHERE NOT EXISTS (
  SELECT 1 FROM university_guideline_templates
  WHERE university_name = 'Maharashtra University of Health Sciences' AND domain = 'Allopathy' AND qualification_level = 'pg'
);

INSERT INTO university_guideline_templates (university_name, domain, qualification_level, rules_json, version, effective_year)
SELECT 'Rajiv Gandhi University of Health Sciences', 'Allopathy', 'pg', '{"paper":"A4","font":"Times New Roman 12pt","spacing":"1.5 line spacing","margins":"1 inch","pageLimitMin":60,"pageLimitMax":80,"referencing":"Vancouver"}'::jsonb, '2025', 2025
WHERE NOT EXISTS (
  SELECT 1 FROM university_guideline_templates
  WHERE university_name = 'Rajiv Gandhi University of Health Sciences' AND domain = 'Allopathy' AND qualification_level = 'pg'
);

INSERT INTO university_guideline_templates (university_name, domain, qualification_level, rules_json, version, effective_year)
SELECT 'Dr. YSR University of Health Sciences', 'Ayurveda', 'pg', '{"paper":"A4","font":"Arial 12pt","spacing":"Double","pageLimitMin":50,"pageLimitMax":150,"referencing":"Vancouver"}'::jsonb, '2025', 2025
WHERE NOT EXISTS (
  SELECT 1 FROM university_guideline_templates
  WHERE university_name = 'Dr. YSR University of Health Sciences' AND domain = 'Ayurveda' AND qualification_level = 'pg'
);
