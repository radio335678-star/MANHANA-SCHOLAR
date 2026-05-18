import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  chatMessagesTable,
  sectionsTable,
  workspacesTable,
  usersTable,
  activityEventsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
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

// SSE streaming chat
router.post(
  "/workspaces/:workspaceId/sections/:sectionId/chat/stream",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getClerkUserId(req);
    const dbUser = await getOrCreateDbUser(clerkUserId);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const sectionId = parseInt(String(req.params.sectionId), 10);
    if (isNaN(workspaceId) || isNaN(sectionId)) { res.status(400).json({ error: "Invalid params" }); return; }

    const body = SendChatMessageBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const access = await verifyAccess(workspaceId, sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    // Save user message
    await db.insert(chatMessagesTable).values({
      sectionId,
      role: "user",
      content: body.data.content,
    });

    const historyRows = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sectionId, sectionId))
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
Provide precise, scholarly assistance. Cite sources as [Author, Year] placeholders. Do not use emojis. Keep responses clear and academic.`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...historyRows.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: body.data.content },
    ];

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const apiKey = process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? "";
    if (!apiKey) {
      const msg = "AI assistant is not configured. Please set KIMI_API_KEY to enable AI features.";
      res.write(`data: ${JSON.stringify({ type: "token", content: msg })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done", totalTokens: 0 })}\n\n`);
      await db.insert(chatMessagesTable).values({ sectionId, role: "assistant", content: msg, tokensUsed: 0 });
      res.end();
      return;
    }

    try {
      const { OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey, baseURL: "https://api.moonshot.ai/v1" });

      const stream = await client.chat.completions.create({
        model: "moonshot-v1-8k",
        messages,
        stream: true,
        max_tokens: 2048,
        temperature: 0.7,
      });

      let fullContent = "";
      let totalTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          fullContent += delta;
          res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
        }
        if (chunk.usage) {
          totalTokens = chunk.usage.total_tokens ?? 0;
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done", totalTokens })}\n\n`);

      // Save assistant message
      await db.insert(chatMessagesTable).values({
        sectionId,
        role: "assistant",
        content: fullContent,
        tokensUsed: totalTokens,
      });

    } catch (err) {
      const errMsg = "AI request failed. Please try again.";
      res.write(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`);
      await db.insert(chatMessagesTable).values({ sectionId, role: "assistant", content: errMsg, tokensUsed: 0 });
    }

    res.end();
  },
);

// SSE streaming section generation
router.post(
  "/workspaces/:workspaceId/sections/:sectionId/generate/stream",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getClerkUserId(req);
    const dbUser = await getOrCreateDbUser(clerkUserId);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    const sectionId = parseInt(String(req.params.sectionId), 10);
    if (isNaN(workspaceId) || isNaN(sectionId)) { res.status(400).json({ error: "Invalid params" }); return; }

    const body = GenerateSectionContentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const access = await verifyAccess(workspaceId, sectionId, dbUser.id);
    if (!access) { res.status(404).json({ error: "Not found" }); return; }

    const [userProfile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dbUser.id))
      .limit(1);

    const toneMap: Record<string, string> = {
      academic: "formal academic prose suitable for a medical thesis",
      concise: "concise and precise language",
      detailed: "comprehensive and detailed academic prose",
      formal: "highly formal scholarly English",
    };
    const toneDesc = toneMap[body.data.tone ?? "academic"] ?? toneMap.academic;
    const wordHint = body.data.wordLimit ? ` Target approximately ${body.data.wordLimit} words.` : "";

    const systemPrompt = `You are a scholarly writing assistant specializing in Indian medical research.
You help ${userProfile?.qualification ?? "MD"} scholars in ${userProfile?.domain ?? access.ws.domain ?? "medicine"} medicine write high-quality thesis content.
Write in ${toneDesc}.${wordHint}
Follow standard academic thesis conventions. Cite placeholders like [Author, Year] where references would go.
Do not use emojis. Write with precision, clarity, and authority appropriate for a medical thesis.`;

    const userMsg = `I am writing the "${access.sec.title}" section (${access.sec.type}) of my thesis titled "${access.ws.title}".\n\n${body.data.prompt}`;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const apiKey = process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? "";
    if (!apiKey) {
      const msg = "AI not configured. Set KIMI_API_KEY to enable section generation.";
      res.write(`data: ${JSON.stringify({ type: "token", content: msg })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done", totalTokens: 0 })}\n\n`);
      res.end();
      return;
    }

    try {
      const { OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey, baseURL: "https://api.moonshot.ai/v1" });

      const stream = await client.chat.completions.create({
        model: "moonshot-v1-8k",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        stream: true,
        max_tokens: body.data.wordLimit ? Math.ceil(body.data.wordLimit * 1.5) : 2048,
        temperature: 0.7,
      });

      let fullContent = "";
      let totalTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          fullContent += delta;
          res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
        }
        if (chunk.usage) {
          totalTokens = chunk.usage.total_tokens ?? 0;
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done", totalTokens, content: fullContent })}\n\n`);

      // Update section with generated content
      await db
        .update(sectionsTable)
        .set({
          content: fullContent,
          status: "in_progress",
          wordCount: fullContent.split(/\s+/).filter(Boolean).length,
          updatedAt: new Date(),
        })
        .where(eq(sectionsTable.id, sectionId));

      await db.insert(activityEventsTable).values({
        userId: dbUser.id,
        workspaceId: access.ws.id,
        type: "content_generated",
        description: `AI generated content for "${access.sec.title}" in "${access.ws.title}"`,
      });

    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "AI generation failed. Please try again." })}\n\n`);
    }

    res.end();
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

    await db.insert(chatMessagesTable).values({
      sectionId: params.data.sectionId,
      role: "user",
      content: body.data.content,
    });

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
${body.data.includeContext !== false && access.sec.content ? `Current section content:\n${access.sec.content.substring(0, 2000)}` : ""}
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
