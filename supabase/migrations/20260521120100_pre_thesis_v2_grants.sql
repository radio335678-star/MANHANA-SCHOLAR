-- Grants for API role on Pre-Thesis V2 tables (manthana_api created before these tables)

GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO manthana_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON department_thesis_templates TO manthana_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON university_department_overrides TO manthana_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON guideline_search_cache TO manthana_api;

GRANT USAGE, SELECT ON SEQUENCE departments_id_seq TO manthana_api;
GRANT USAGE, SELECT ON SEQUENCE department_thesis_templates_id_seq TO manthana_api;
GRANT USAGE, SELECT ON SEQUENCE university_department_overrides_id_seq TO manthana_api;
GRANT USAGE, SELECT ON SEQUENCE guideline_search_cache_id_seq TO manthana_api;
