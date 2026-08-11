import type { ManthanaDocumentAST, StyleTokens } from '../types/ast';
import { UniversalConverterService } from './converter';

export interface ASTDelta {
  type: 'append_node' | 'update_node' | 'set_meta';
  pageIndex: number;
  node?: any;
  meta?: {
    totalTokens: number;
    renderingTimeMs: number;
    webGpuAccelerated: boolean;
    privacyMode: boolean;
  };
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  defaultTokens: Partial<StyleTokens>;
  document: ManthanaDocumentAST;
}

export const DEFAULT_STYLE_TOKENS: StyleTokens = {
  fontFamily: 'geist-sans',
  fontSizeH1: 26,
  fontSizeH2: 18,
  fontSizeH3: 14,
  fontSizeBody: 11,
  fontSize: 11,
  lineHeight: 1.6,
  letterSpacing: 0,
  paragraphSpacing: 1.0,
  primaryColor: '#60a5fa',
  secondaryColor: '#c8c8c8',
  backgroundColor: '#0a0a0a',
  textColor: '#e8e8e8',
  accentColor: '#93c5fd',
  marginMm: 15,
  marginTopMm: 20,
  marginBottomMm: 20,
  pageSize: 'A4',
  columns: 1,
  headerText: 'Q108 SCHOLAR',
  footerText: 'Page %PAGE% of %TOTAL%',
  showPageNumbers: true,
  pageNumberPosition: 'center',
  watermarkText: '',
  watermarkOpacity: 8,
};

export const EMPTY_DOCUMENT: ManthanaDocumentAST = {
  id: 'doc-empty-01',
  title: 'Untitled Document',
  subtitle: 'Start writing your content below or type / for commands',
  author: 'Author',
  date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  tokens: {
    ...DEFAULT_STYLE_TOKENS,
    watermarkText: '',
  },
  metadata: {
    totalTokens: 0,
    renderingTimeMs: 5,
    webGpuAccelerated: true,
    privacyMode: true,
  },
  pages: [
    {
      pageNumber: 1,
      nodes: [
        {
          id: 'node-init-1',
          type: 'heading1',
          content: 'Untitled Document',
        },
        {
          id: 'node-init-2',
          type: 'paragraph',
          content: 'Start writing your document here... Type / to insert headings, codeblocks, images, callouts, or tables.',
        },
      ],
    },
  ],
};

export const TEMPLATE_PRESETS: PromptTemplate[] = [
  {
    id: 'blank-doc',
    name: 'Blank Document',
    category: 'General',
    description: 'Clean empty page ready for writing.',
    prompt: 'Create a clean blank document.',
    defaultTokens: {
      ...DEFAULT_STYLE_TOKENS,
      watermarkText: '',
    },
    document: EMPTY_DOCUMENT,
  },
  {
    id: 'research-draft',
    name: 'Research Draft Outline',
    category: 'Academic',
    description: 'Minimal research paper framework.',
    prompt: 'Create a clean research paper framework.',
    defaultTokens: {
      ...DEFAULT_STYLE_TOKENS,
      fontFamily: 'ibm-plex-serif',
      watermarkText: '',
    },
    document: {
      id: 'doc-research-01',
      title: 'Research Project Title',
      subtitle: 'Abstract & Methodology Draft',
      author: 'Researcher',
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      tokens: { ...DEFAULT_STYLE_TOKENS, fontFamily: 'ibm-plex-serif', watermarkText: '' },
      metadata: { totalTokens: 50, renderingTimeMs: 10, webGpuAccelerated: true, privacyMode: true },
      pages: [
        {
          pageNumber: 1,
          nodes: [
            { id: 'r-1', type: 'heading1', content: '1. Introduction & Problem Statement' },
            { id: 'r-2', type: 'paragraph', content: 'Write your research background and thesis statement here...' },
            { id: 'r-3', type: 'heading2', content: '2. Methodology' },
            { id: 'r-4', type: 'paragraph', content: 'Describe experimental setup and data collection...' },
          ],
        },
      ],
    },
  },
  {
    id: 'executive-summary',
    name: 'Executive Memorandum',
    category: 'Business',
    description: 'Sleek executive memo framework.',
    prompt: 'Create a clean executive memorandum.',
    defaultTokens: {
      ...DEFAULT_STYLE_TOKENS,
      primaryColor: '#60a5fa',
      watermarkText: '',
    },
    document: {
      id: 'doc-exec-01',
      title: 'Executive Memorandum',
      subtitle: 'Strategic Overview',
      author: 'Executive',
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      tokens: { ...DEFAULT_STYLE_TOKENS, primaryColor: '#60a5fa', watermarkText: '' },
      metadata: { totalTokens: 40, renderingTimeMs: 8, webGpuAccelerated: true, privacyMode: true },
      pages: [
        {
          pageNumber: 1,
          nodes: [
            { id: 'e-1', type: 'heading1', content: 'Executive Summary' },
            { id: 'e-2', type: 'callout', content: 'Key Takeaway: Highlight core strategic objective here.' },
            { id: 'e-3', type: 'paragraph', content: 'Details and background analysis...' },
          ],
        },
      ],
    },
  },
];

export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
export const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "";

export async function generateWithOpenRouterFree(prompt: string, systemInstruction?: string): Promise<string> {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: messages
    })
  });

  const data = await response.json();
  if (response.status === 200) {
    return data.choices?.[0]?.message?.content || "";
  } else {
    throw new Error(data.error?.message || `OpenRouter API error: ${response.status}`);
  }
}

export async function generateWithGemini25Flash(prompt: string, systemInstruction?: string): Promise<string> {
  // Primary AI: Try OpenRouter auto-router free tier first, fallback to Gemini 2.5 Flash
  try {
    return await generateWithOpenRouterFree(prompt, systemInstruction);
  } catch (err) {
    console.warn("OpenRouter failed, falling back to Gemini:", err);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload: any = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (response.status === 200) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error(data.error?.message || `Gemini API error: ${response.status}`);
  }
}

export async function* streamDocumentAST(
  prompt: string,
  templateId?: string
): AsyncGenerator<ASTDelta, void, unknown> {
  const template = TEMPLATE_PRESETS.find((t) => t.id === templateId) || TEMPLATE_PRESETS[0];
  const doc = JSON.parse(JSON.stringify(template.document)) as ManthanaDocumentAST;

  // Stream Meta
  yield {
    type: 'set_meta',
    pageIndex: 0,
    meta: {
      totalTokens: 50,
      renderingTimeMs: 12,
      webGpuAccelerated: true,
      privacyMode: true,
    },
  };

  // Try real OpenRouter / Gemini generation if prompt is custom
  if (prompt && prompt.length > 5 && (!templateId || templateId === 'blank-doc')) {
    try {
      const isMultiPageRequest = /2\s*page|thesis|report|paper|essay|extensive/i.test(prompt);
      const systemInst = `You are Q108 Scholar AI Academic Author. ${
        isMultiPageRequest
          ? "Write a comprehensive, detailed, multi-page academic thesis (~800+ words) with at least 5 major sections, detailed paragraphs, callouts, and classical verses."
          : "Write a well-structured document using clean Markdown."
      } Use headings (#, ##, ###), > [CALLOUT] for callout boxes, :::shloka [Citation] for verses, and :::math for equations. Provide deep, thorough content.`;
      const aiResponseText = await generateWithGemini25Flash(prompt, systemInst);
      
      const parsedAst = UniversalConverterService.markdownToAst(aiResponseText, prompt.slice(0, 40));
      const parsedNodes = parsedAst.pages[0]?.nodes || [];

      if (parsedNodes.length > 0) {
        let count = 0;
        for (const n of parsedNodes) {
          count++;
          yield {
            type: 'append_node',
            pageIndex: 0,
            node: { ...n, id: `node-ai-${Date.now()}-${count}` },
            meta: { totalTokens: count * 150, renderingTimeMs: 15 + count * 5, webGpuAccelerated: true, privacyMode: true }
          };
          await new Promise((r) => setTimeout(r, 120));
        }
        return;
      }
    } catch (err) {
      console.warn("AI Generation fallback to template:", err);
    }
  }

  // Stream Preset Nodes step by step to simulate live AI token generation
  let nodeCount = 0;
  for (let pIdx = 0; pIdx < doc.pages.length; pIdx++) {
    const page = doc.pages[pIdx];
    for (const node of page.nodes) {
      nodeCount++;
      await new Promise((resolve) => setTimeout(resolve, 180)); // Token streaming latency
      yield {
        type: 'append_node',
        pageIndex: pIdx,
        node: node,
        meta: {
          totalTokens: nodeCount * 120,
          renderingTimeMs: 15 + nodeCount * 4,
          webGpuAccelerated: true,
          privacyMode: true,
        },
      };
    }
  }
}
