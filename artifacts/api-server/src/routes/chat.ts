import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  chatMessagesTable,
  sectionsTable,
  workspacesTable,
  usersTable,
  activityEventsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, getClerkUserId, getOrCreateDbUser } from "../lib/auth";
import { chat, generateContent } from "../lib/kimi";
import {
  ListChatMessagesParams,
  ListChatMessagesResponse,
  SendChatMessageParams,
  SendChatMessageBody,
  SendChatMessageResponse,
  ClearChatHistoryParams,
  GenerateSectionContentParams,
  GenerateSectionContentBody,
  GenerateSectionContentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function msgToResponse(m: typeof chatMessagesTable.$inferSelect) {
  return {
    ...m,
    createdAt: m.createdAt.toISOString(),
    tokensUsed: m.tokensUsed ?? null,
  };
}

async function verifyAccess(workspaceId: number, sectionId: number, userId: number) {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (!ws || ws.userId !== userId) return null;

  const [sec] = await db
    .select()
    .from(sectionsTable)
    .where(eq(sectionsTable.id, sectionId))
    .limit(1);
  if (!sec || sec.workspaceId !== workspaceId) return null;

  return { ws, sec };
}

router.get(
  "/workspaces/:workspaceId/sections/:sectionId/chat",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getClerkUserId(req);
    const dbUser = await getOrCreateDbUser(clerkUserId);
    if (!dbUser) { res.json([]); return; }

    const params = ListChatMessagesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const access = await verifyAccess(params.data.workspaceId, params.data.sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sectionId, params.data.sectionId))
      .orderBy(chatMessagesTable.createdAt)
      .limit(50);

    res.json(ListChatMessagesResponse.parse(messages.map(msgToResponse)));
  },
);

router.post(
  "/workspaces/:workspaceId/sections/:sectionId/chat",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getClerkUserId(req);
    const dbUser = await getOrCreateDbUser(clerkUserId);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const params = SendChatMessageParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const body = SendChatMessageBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const access = await verifyAccess(params.data.workspaceId, params.data.sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    const [userMsg] = await db
      .insert(chatMessagesTable)
      .values({
        sectionId: params.data.sectionId,
        role: "user",
        content: body.data.content,
      })
      .returning();

    const historyRows = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sectionId, params.data.sectionId))
      .orderBy(chatMessagesTable.createdAt)
      .limit(20);

    const [userProfile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dbUser.id))
      .limit(1);

    const systemPrompt = `You are MANTHANA, an expert AI research assistant for Indian medical scholars.
You are helping a ${userProfile?.qualification ?? "medical"} scholar in ${userProfile?.domain ?? "medicine"} write their thesis titled "${access.ws.title}".
Current section: "${access.sec.title}" (${access.sec.type}).
${body.data.includeContext !== false && access.sec.content ? `Current section content (for context):\n${access.sec.content.substring(0, 2000)}` : ""}
Provide precise, scholarly assistance. Cite sources as [Author, Year] placeholders. Do not use emojis.`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...historyRows.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: body.data.content },
    ];

    const aiResponse = await chat(messages);

    const [assistantMsg] = await db
      .insert(chatMessagesTable)
      .values({
        sectionId: params.data.sectionId,
        role: "assistant",
        content: aiResponse.content,
        tokensUsed: aiResponse.tokensUsed,
      })
      .returning();

    res.json(SendChatMessageResponse.parse(msgToResponse(assistantMsg!)));
  },
);

router.delete(
  "/workspaces/:workspaceId/sections/:sectionId/chat/clear",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getClerkUserId(req);
    const dbUser = await getOrCreateDbUser(clerkUserId);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const params = ClearChatHistoryParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const access = await verifyAccess(params.data.workspaceId, params.data.sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    await db
      .delete(chatMessagesTable)
      .where(eq(chatMessagesTable.sectionId, params.data.sectionId));

    res.sendStatus(204);
  },
);

router.post(
  "/workspaces/:workspaceId/sections/:sectionId/generate",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getClerkUserId(req);
    const dbUser = await getOrCreateDbUser(clerkUserId);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const params = GenerateSectionContentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const body = GenerateSectionContentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const access = await verifyAccess(params.data.workspaceId, params.data.sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    const [userProfile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dbUser.id))
      .limit(1);

    const result = await generateContent(body.data.prompt, {
      workspaceTitle: access.ws.title,
      sectionTitle: access.sec.title,
      sectionType: access.sec.type,
      domain: userProfile?.domain ?? access.ws.domain ?? "medicine",
      qualification: userProfile?.qualification ?? access.ws.qualification ?? "MD",
      tone: body.data.tone ?? "academic",
      wordLimit: body.data.wordLimit,
    });

    await db.insert(activityEventsTable).values({
      userId: dbUser.id,
      workspaceId: access.ws.id,
      type: "content_generated",
      description: `AI generated content for "${access.sec.title}" in "${access.ws.title}"`,
    });

    res.json(
      GenerateSectionContentResponse.parse({
        content: result.content,
        tokensUsed: result.tokensUsed,
      }),
    );
  },
);

export default router;
