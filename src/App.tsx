import { useState, useEffect, useCallback } from 'react';
import { HeaderBar } from './components/header/HeaderBar';
import { DocumentCanvas } from './components/canvas/DocumentCanvas';
import { InspectorPanel } from './components/inspector/InspectorPanel';
import { LeftSidebar } from './components/sidebar/LeftSidebar';
import { StatusBar } from './components/statusbar/StatusBar';
import { AgentButton } from './components/agent/AgentButton';
import { AgentPanel } from './components/agent/AgentPanel';
import { CommandPalette } from './components/command/CommandPalette';
import { FindReplaceBar } from './components/command/FindReplaceBar';
import { useDocumentHistory } from './hooks/useDocumentHistory';

import type { ManthanaDocumentAST, StyleTokens } from './types/ast';
import { TEMPLATE_PRESETS, EMPTY_DOCUMENT, streamDocumentAST, generateWithGemini25Flash } from './services/aiStreamer';
import { DocumentCompilerService } from './services/documentCompiler';
import type { CompilationOutput } from './services/documentCompiler';
import { WebGpuAIService } from './services/webgpuAI';
import { BackupNotificationToast } from './components/common/BackupNotificationToast';
import { UniversalConverterService } from './services/converter';
import type { OCRResult } from './services/webgpuAI';
import { E2BSandboxService } from './services/e2bSandboxService';
import type { SandboxExecutionResult } from './services/e2bSandboxService';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [compilation, setCompilation] = useState<CompilationOutput | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamingProgress, setStreamingProgress] = useState<number>(100);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState<boolean>(false);
  const [webGpuActive, setWebGpuActive] = useState<boolean>(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  // E2B Sandbox state
  const [isE2BExecuting, setIsE2BExecuting] = useState(false);
  const [sandboxOutput, setSandboxOutput] = useState<SandboxExecutionResult | null>(null);

  const { ast, setAst, history, currentIndex, restoreSnapshot } = useDocumentHistory(EMPTY_DOCUMENT);

  // Initialize Theme Attribute on Document Root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setIsFocusMode(prev => !prev);
        return;
      }
      
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsFindReplaceOpen(prev => !prev);
      } else if (e.key === '/') {
        e.preventDefault();
        setIsAgentPanelOpen(prev => !prev);
      } else if (e.key === 'p' || e.key === 'P') {
        if (compilation?.pdfBlobUrl) {
          e.preventDefault();
          const a = document.createElement('a');
          a.href = compilation.pdfBlobUrl;
          a.download = `${ast.title}.pdf`;
          a.click();
        }
      } else if (e.key === 'd' || e.key === 'D') {
        if (compilation?.docxBlobUrl) {
          e.preventDefault();
          const a = document.createElement('a');
          a.href = compilation.docxBlobUrl;
          a.download = `${ast.title}.docx`;
          a.click();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [compilation, ast.title]);

  // Hardware Status Check
  useEffect(() => {
    const aiService = WebGpuAIService.getInstance();
    const status = aiService.getHardwareStatus();
    setWebGpuActive(status.webGpu);
  }, []);

  // Re-compile Document AST whenever AST changes
  const recompileDocument = useCallback(async (currentAst: ManthanaDocumentAST) => {
    try {
      const output = await DocumentCompilerService.compileDocument(currentAst);
      setCompilation(output);
    } catch (err) {
      console.error('Document compilation error:', err);
    }
  }, []);

  useEffect(() => {
    recompileDocument(ast);
  }, [ast, recompileDocument]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleGenerate = async (prompt: string, templateName?: string) => {
    setIsStreaming(true);
    setStreamingProgress(0);

    const nameMap: Record<string, string> = {
      'Blank Document': 'blank-doc',
      'Research Draft Outline': 'research-draft',
      'Executive Memorandum': 'executive-summary'
    };
    const templateId = nameMap[templateName || ''] || templateName || 'blank-doc';

    const baseTemplate = TEMPLATE_PRESETS.find((t) => t.id === templateId) || TEMPLATE_PRESETS[0];
    const initialAst: ManthanaDocumentAST = {
      ...JSON.parse(JSON.stringify(baseTemplate.document)),
      title: prompt ? prompt.slice(0, 60) : baseTemplate.document.title,
      pages: [
        {
          pageNumber: 1,
          nodes: [],
        },
      ],
    };

    setAst(initialAst, 'Start Generation');

    let totalNodes = 0;
    const targetNodes = baseTemplate.document.pages.reduce((acc, p) => acc + p.nodes.length, 0);
    let latestAst = initialAst;

    for await (const delta of streamDocumentAST(prompt, templateId)) {
      if (delta.type === 'append_node' && delta.node) {
        totalNodes++;
        const progress = Math.min((totalNodes / Math.max(targetNodes, 1)) * 100, 100);
        setStreamingProgress(progress);

        latestAst = {
          ...latestAst,
          pages: [...latestAst.pages]
        };
        const newPages = latestAst.pages;
        if (!newPages[delta.pageIndex]) {
          newPages[delta.pageIndex] = { pageNumber: delta.pageIndex + 1, nodes: [] };
        }
        newPages[delta.pageIndex].nodes.push(delta.node!);
        latestAst.metadata = {
          ...latestAst.metadata,
          totalTokens: totalNodes * 140,
          renderingTimeMs: Math.round(15 + totalNodes * 3.5),
        };
        
        setAst(latestAst, `Generated node ${totalNodes}`);
      }
    }

    setIsStreaming(false);
    setStreamingProgress(100);
  };

  const handleFileUpload = async (file: File) => {
    setIsOcrProcessing(true);
    try {
      const aiService = WebGpuAIService.getInstance();
      const result = await aiService.performLocalOCR(file);
      setOcrResult(result);

      const newAst = JSON.parse(JSON.stringify(ast));
      if (newAst.pages.length === 0) {
        newAst.pages.push({ pageNumber: 1, nodes: [] });
      }
      newAst.pages[0].nodes.unshift({
        id: `ocr-${Date.now()}`,
        type: result.language.includes('Sanskrit') ? 'shloka' : 'callout',
        citationId: 'WebGPU-OCR',
        content: result.extractedText,
        subContent: `Extracted locally in ${result.processingTimeMs}ms`,
      });
      setAst(newAst, 'OCR Extraction');
    } catch (err) {
      console.error('OCR Error:', err);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const handleUpdateTokens = (newTokens: Partial<StyleTokens>) => {
    setAst({
      ...ast,
      tokens: { ...ast.tokens, ...newTokens },
    }, 'Update Styles');
  };

  const handleCommand = (cmd: string) => {
    if (cmd === 'Export as PDF') {
      if (compilation?.pdfBlobUrl) {
        const a = document.createElement('a');
        a.href = compilation.pdfBlobUrl;
        a.download = `${ast.title}.pdf`;
        a.click();
      }
    } else if (cmd === 'Export as DOCX') {
      if (compilation?.docxBlobUrl) {
        const a = document.createElement('a');
        a.href = compilation.docxBlobUrl;
        a.download = `${ast.title}.docx`;
        a.click();
      }
    } else if (cmd === 'Toggle Dark/Light Mode') {
      handleToggleTheme();
    } else if (cmd === 'Toggle Inspector') {
      // Inspector toggles itself for now
    } else if (cmd === 'Toggle Sidebar') {
      // Sidebar toggles itself for now
    } else {
      handleGenerate(cmd);
    }
  };

  // E2B sandbox actions that route to executePython instead of AI text generation
  const E2B_ACTIONS = ['Execute Data Analytics', 'Compile Typst Paper', 'Extract Tables'];

  const handleAgentQuickAction = async (action: string, customPrompt?: string) => {
    // === E2B SANDBOX BRANCH ===
    if (E2B_ACTIONS.includes(action)) {
      setIsE2BExecuting(true);
      setSandboxOutput(null);
      setIsAgentPanelOpen(true);
      try {
        const code = customPrompt || `print('E2B Sandbox connected. Action: ${action}')`;
        const result = await E2BSandboxService.executePython(code);
        setSandboxOutput(result);
      } catch (err: any) {
        setSandboxOutput({
          stdout: '',
          stderr: err?.message || String(err),
          error: 'E2B execution failed',
          pngImagesBase64: [],
        });
      } finally {
        setIsE2BExecuting(false);
      }
      return;
    }

    // === LOCAL AST MUTATIONS (no API needed) ===
    if (action === 'Generate Table of Contents') {
      const newAst = { ...ast, pages: [...ast.pages] };
      if (!newAst.pages[0]) newAst.pages[0] = { pageNumber: 1, nodes: [] };
      newAst.pages[0].nodes.unshift({ id: `node-toc-${Date.now()}`, type: 'toc', content: '', sourceType: 'ai_text' as const });
      setAst(newAst, 'Add ToC');
      return;
    }
    if (action === 'Extract Key Points Grid') {
      const newAst = { ...ast, pages: [...ast.pages] };
      if (!newAst.pages[0]) newAst.pages[0] = { pageNumber: 1, nodes: [] };
      newAst.pages[0].nodes.push({
        id: `node-grid-${Date.now()}`,
        type: 'key_value_grid',
        content: '',
        sourceType: 'ai_text' as const,
        tableData: [
          [{ text: 'Key Concept', isHeader: true }, { text: 'Description', isHeader: true }],
          [{ text: 'Sample Metric 1' }, { text: 'Value 1' }],
          [{ text: 'Sample Metric 2' }, { text: 'Value 2' }],
        ],
      });
      setAst(newAst, 'Add Key Points Grid');
      return;
    }

    // === AI TEXT BRANCH ===
    const activePageIdx = Math.min(Math.max(currentPage - 1, 0), ast.pages.length - 1);
    const activePage = ast.pages[activePageIdx] || ast.pages[0];
    const pageText = activePage?.nodes.map((n) => n.content).join('\n') || ast.title;

    try {
      setIsStreaming(true);
      setStreamingProgress(30);

      const userQuery = customPrompt || action;
      const systemInst = `You are Q108 Scholar Document Assistant. Perform the requested edit on the provided text section. Return a concise, high-impact result. Prompt: ${userQuery}`;
      const aiResult = await generateWithGemini25Flash(`Target Section Content:\n${pageText}\n\nTask: ${userQuery}`, systemInst);

      const newAst = JSON.parse(JSON.stringify(ast));
      if (!newAst.pages[activePageIdx]) {
        newAst.pages[activePageIdx] = { pageNumber: activePageIdx + 1, nodes: [] };
      }
      newAst.pages[activePageIdx].nodes.push({
        id: `ai-edit-${Date.now()}`,
        type: action.toLowerCase().includes('conclusion') ? 'heading2' : action.toLowerCase().includes('shloka') || action.toLowerCase().includes('translate') ? 'shloka' : 'callout',
        content: aiResult,
        sourceType: 'ai_text' as const,
      });
      setAst(newAst, `AI Action: ${action}`);
    } catch (err) {
      console.warn('AI Quick Action fallback:', err);
      handleGenerate(`Please perform action: ${action}`);
    } finally {
      setIsStreaming(false);
      setStreamingProgress(100);
    }
  };

  // Insert E2B sandbox result (PNG chart or stdout text) into active document page
  const handleInsertE2BResult = (pngBase64?: string, text?: string) => {
    const newAst: typeof ast = JSON.parse(JSON.stringify(ast));
    const activePageIdx = Math.min(Math.max(currentPage - 1, 0), newAst.pages.length - 1);
    if (!newAst.pages[activePageIdx]) {
      newAst.pages[activePageIdx] = { pageNumber: activePageIdx + 1, nodes: [] };
    }
    const page = newAst.pages[activePageIdx];
    if (pngBase64) {
      page.nodes.push({
        id: `e2b-img-${Date.now()}`,
        type: 'image',
        content: 'E2B Generated Chart',
        imageUrl: `data:image/png;base64,${pngBase64}`,
        sourceType: 'e2b_python',
      });
    }
    if (text && text.trim()) {
      page.nodes.push({
        id: `e2b-txt-${Date.now()}`,
        type: 'callout',
        content: text.trim(),
        sourceType: 'e2b_python',
      });
    }
    setAst(newAst, 'Insert E2B Result');
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <HeaderBar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        webGpuActive={webGpuActive}
        renderingTimeMs={compilation?.compilationTimeMs || 24}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isFocusMode={isFocusMode}
        onToggleFocusMode={() => setIsFocusMode(prev => !prev)}
      />

      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {!isFocusMode && (
          <LeftSidebar
            ast={ast}
            currentPage={currentPage}
            onGenerate={(template, p) => handleGenerate(p, template)}
            isStreaming={isStreaming}
            streamingProgress={`${Math.round(streamingProgress)}%`}
            onFileUpload={handleFileUpload}
            ocrResult={ocrResult?.extractedText || ''}
            isOcrProcessing={isOcrProcessing}
            onLoadAstToStudio={(loadedAst) => setAst(loadedAst, 'Load File')}
            onJumpToPage={setCurrentPage}
            historyEntries={history}
            currentHistoryIndex={currentIndex}
            onRestoreHistory={restoreSnapshot}
          />
        )}

        <DocumentCanvas
          ast={ast}
          compilation={compilation}
          isStreaming={isStreaming}
          onUpdateAST={(newAst) => setAst(newAst, 'Canvas Edit')}
        />

        <FindReplaceBar
          isOpen={isFindReplaceOpen}
          onClose={() => setIsFindReplaceOpen(false)}
          ast={ast}
          onUpdateAST={(newAst) => setAst(newAst, 'Find & Replace')}
        />

        {!isFocusMode && (
          <InspectorPanel
            ast={ast}
            compilation={compilation}
            onUpdateTokens={handleUpdateTokens}
          />
        )}
      </main>

      <StatusBar
        ast={ast}
        compilationTimeMs={compilation?.compilationTimeMs || 0}
        webGpuActive={webGpuActive}
      />

      <AgentButton
        isOpen={isAgentPanelOpen}
        onClick={() => setIsAgentPanelOpen(!isAgentPanelOpen)}
      />

      <AgentPanel
        isOpen={isAgentPanelOpen}
        onClose={() => setIsAgentPanelOpen(false)}
        onPrompt={(prompt) => handleGenerate(prompt)}
        onQuickAction={handleAgentQuickAction}
        isExecuting={isE2BExecuting}
        sandboxOutput={sandboxOutput}
        onClearOutput={() => setSandboxOutput(null)}
        onInsertResult={handleInsertE2BResult}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onCommand={handleCommand}
      />

      <BackupNotificationToast
        isOpen={history.length > 1 && history.length % 15 === 0}
        onClose={() => {}}
        editCount={history.length}
        onDownloadMd={() => {
          const md = UniversalConverterService.astToMarkdown(ast);
          const blob = new Blob([md], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${ast.title || 'backup'}.md`; a.click();
        }}
        onDownloadDocx={() => {
          if (compilation?.docxBlobUrl) {
            const a = document.createElement('a'); a.href = compilation.docxBlobUrl; a.download = `${ast.title || 'backup'}.docx`; a.click();
          }
        }}
      />
    </div>
  );
}

export default App;
