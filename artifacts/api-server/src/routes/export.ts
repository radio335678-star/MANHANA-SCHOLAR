import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sectionsTable, workspacesTable, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, getClerkUserId, getOrCreateDbUser } from "../lib/auth";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  TableOfContents,
  StyleLevel,
  convertInchesToTwip,
} from "docx";

const router: IRouter = Router();

function htmlToDocxParagraphs(html: string | null, sectionTitle: string): Paragraph[] {
  if (!html && !sectionTitle) return [];
  const paragraphs: Paragraph[] = [];

  if (!html || html.trim() === "") {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `[${sectionTitle} — content not yet written]`, italics: true, color: "888888" })],
        spacing: { after: 200 },
      })
    );
    return paragraphs;
  }

  // Strip HTML tags and split into paragraphs
  const stripped = html
    .replace(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi, "\n##HEADING##$1\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "\n• $1")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "$1")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "$1")
    .replace(/<u[^>]*>(.*?)<\/u>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');

  const lines = stripped.split("\n").filter(l => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("##HEADING##")) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace("##HEADING##", ""),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (trimmed.startsWith("•")) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed })],
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, size: 24 })],
          spacing: { after: 200, line: 480 },
          alignment: AlignmentType.JUSTIFIED,
        })
      );
    }
  }

  return paragraphs;
}

router.post(
  "/workspaces/:workspaceId/export/docx",
  requireAuth,
  async (req, res): Promise<void> => {
    const clerkUserId = getClerkUserId(req);
    const dbUser = await getOrCreateDbUser(clerkUserId);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    if (isNaN(workspaceId)) { res.status(400).json({ error: "Invalid workspace ID" }); return; }

    const [workspace] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (!workspace || workspace.userId !== dbUser.id) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const [userProfile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dbUser.id))
      .limit(1);

    const sections = await db
      .select()
      .from(sectionsTable)
      .where(eq(sectionsTable.workspaceId, workspaceId))
      .orderBy(asc(sectionsTable.order));

    const today = new Date().toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const allChildren: (Paragraph)[] = [];

    // Title Page
    allChildren.push(
      new Paragraph({
        children: [new TextRun({ text: workspace.title, bold: true, size: 36 })],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { before: 1440, after: 480 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `A Thesis Submitted for ${workspace.qualification ?? userProfile?.qualification ?? "Post-Graduate Degree"}`, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
      }),
      new Paragraph({
        children: [new TextRun({ text: workspace.domain ?? userProfile?.domain ?? "", size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
      }),
    );

    if (userProfile?.collegeName) {
      allChildren.push(
        new Paragraph({
          children: [new TextRun({ text: userProfile.collegeName, size: 24, bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        }),
      );
    }
    if (userProfile?.universityName) {
      allChildren.push(
        new Paragraph({
          children: [new TextRun({ text: userProfile.universityName, size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 480 },
        }),
      );
    }

    allChildren.push(
      new Paragraph({
        children: [new TextRun({ text: today, size: 22, color: "555555" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 720 },
      }),
      new Paragraph({
        children: [new PageBreak()],
      }),
    );

    // Sections
    for (const section of sections) {
      allChildren.push(
        new Paragraph({
          text: section.title,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 480, after: 240 },
        }),
        ...htmlToDocxParagraphs(section.content, section.title),
        new Paragraph({
          children: [new PageBreak()],
        }),
      );
    }

    const doc = new Document({
      creator: "MANTHANA-SCHOLER",
      title: workspace.title,
      description: `Thesis document for ${userProfile?.fullName ?? "scholar"}`,
      styles: {
        default: {
          document: {
            run: {
              font: "Arial",
              size: 24,
            },
            paragraph: {
              spacing: { line: 480 },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1.25),
                right: convertInchesToTwip(1),
              },
            },
          },
          children: allChildren,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    const filename = `${workspace.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_thesis.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  },
);

export default router;
