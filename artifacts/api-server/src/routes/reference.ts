import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  domainsTable,
  qualificationsTable,
  collegesTable,
  universitiesTable,
  departmentsTable,
} from "@workspace/db";
import {
  ListDomainsResponse,
  ListQualificationsResponse,
  ListCollegesResponse,
  ListUniversitiesResponse,
  ListCollegesQueryParams,
} from "@workspace/api-zod";
import { eq } from "@workspace/db";

const router: IRouter = Router();

router.get("/reference/domains", async (_req, res): Promise<void> => {
  const domains = await db.select().from(domainsTable).orderBy(domainsTable.name);
  res.json(ListDomainsResponse.parse(domains));
});

router.get("/reference/qualifications", async (_req, res): Promise<void> => {
  const qualifications = await db
    .select()
    .from(qualificationsTable)
    .orderBy(qualificationsTable.name);
  res.json(ListQualificationsResponse.parse(qualifications));
});

router.get("/reference/colleges", async (req, res): Promise<void> => {
  const parsed = ListCollegesQueryParams.safeParse(req.query);
  const domain = parsed.success ? parsed.data.domain : undefined;

  const query = db.select().from(collegesTable);
  const colleges = domain
    ? await query.where(eq(collegesTable.domain, domain))
    : await query;

  res.json(ListCollegesResponse.parse(colleges));
});

router.get("/reference/universities", async (_req, res): Promise<void> => {
  const universities = await db
    .select()
    .from(universitiesTable)
    .orderBy(universitiesTable.name);
  res.json(ListUniversitiesResponse.parse(universities));
});

router.get("/reference/departments", async (req, res): Promise<void> => {
  const domain = typeof req.query.domain === "string" ? req.query.domain : undefined;
  const query = db.select().from(departmentsTable).orderBy(departmentsTable.domain, departmentsTable.name);
  const departments = domain ? await query.where(eq(departmentsTable.domain, domain)) : await query;
  res.json(
    departments.map((d) => ({
      id: d.id,
      domain: d.domain,
      name: d.name,
      slug: d.slug,
      qualificationLevels: d.qualificationLevels,
      regulatoryBody: d.regulatoryBody,
    })),
  );
});

export default router;
