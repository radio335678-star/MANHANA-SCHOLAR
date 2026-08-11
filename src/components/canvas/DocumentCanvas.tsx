import React, { useState } from 'react';
import { ZoomIn, ZoomOut, FileText, Code, Eye, ChevronLeft, ChevronRight, Moon, Sun, Sparkles, Columns } from 'lucide-react';
import type { ManthanaDocumentAST } from '../../types/ast';
import type { CompilationOutput } from '../../services/documentCompiler';
import { DEFAULT_STYLE_TOKENS } from '../../services/aiStreamer';
import { BlockNoteCanvas } from './BlockNoteCanvas';

interface DocumentCanvasProps {
  ast: ManthanaDocumentAST;
  compilation: CompilationOutput | null;
  isStreaming: boolean;
  onUpdateAST: (updated: ManthanaDocumentAST) => void;
}

export const DocumentCanvas: React.FC<DocumentCanvasProps> = ({
  ast,
  compilation,
  isStreaming,
  onUpdateAST,
}) => {
  const [viewMode, setViewMode] = useState<'dom' | 'pdf' | 'json'>('dom');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [paperTheme, setPaperTheme] = useState<'dark' | 'light'>('light');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isSplitView, setIsSplitView] = useState<boolean>(false);

  const tokens = { ...DEFAULT_STYLE_TOKENS, ...(ast?.tokens || {}) };
  const totalPages = compilation?.totalPages || ast?.pages?.length || 1;
  const currentPageData = ast?.pages?.find((p) => p.pageNumber === currentPage) || ast?.pages?.[0];


  // --- Zoom Helpers ---
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 15, 175));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 15, 50));

  // Word count helper
  const wordCount = (ast?.pages || [])
    .flatMap((p) => p.nodes)
    .map((n) => n.content)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

  const VIEW_MODES = [
    { id: 'dom' as const, label: 'Editor', icon: <Eye size={13} /> },
    { id: 'pdf' as const, label: 'PDF View', icon: <FileText size={13} /> },
    { id: 'json' as const, label: 'AST JSON', icon: <Code size={13} /> },
  ];

  return (
    <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--background)', overflow: 'hidden' }}>
      {/* Canvas Toolbar */}
      <div
        className="glass-panel"
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        {/* View Mode Switcher */}
        <div style={{ display: 'flex', gap: '2px', background: 'var(--secondary)', padding: '3px', borderRadius: '8px' }}>
          {VIEW_MODES.map((vm) => (
            <button
              key={vm.id}
              onClick={() => setViewMode(vm.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 11px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === vm.id ? 'var(--card)' : 'transparent',
                color: viewMode === vm.id ? 'var(--accent)' : 'var(--muted-foreground)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-geist)',
                transition: 'all 0.15s',
                boxShadow: viewMode === vm.id ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {vm.icon}
              {vm.label}
            </button>
          ))}
        </div>

        {/* Page Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn-icon"
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage <= 1}
            style={{ opacity: currentPage <= 1 ? 0.35 : 1 }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-geist-mono)', color: 'var(--foreground)', minWidth: '80px', textAlign: 'center' }}>
            Page {currentPage} / {totalPages}
          </span>
          <button
            className="btn-icon"
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage >= totalPages}
            style={{ opacity: currentPage >= totalPages ? 0.35 : 1 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Split View & Zoom Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className={`icon-btn ${isSplitView ? 'active' : ''}`}
              onClick={() => setIsSplitView((prev) => !prev)}
              title="Toggle Split View (Canvas + Live Web Preview)"
              style={{
                fontSize: '0.75rem',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: isSplitView ? 'var(--accent-dim)' : 'transparent',
                color: isSplitView ? 'var(--accent)' : 'var(--foreground)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
              }}
            >
              <Code size={13} />
              Split View
            </button>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            <button className="icon-btn" onClick={handleZoomOut} title="Zoom Out">
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-geist-mono)', width: '38px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              {zoomLevel}%
            </span>
            <button className="icon-btn" onClick={handleZoomIn} title="Zoom In">
              <ZoomIn size={14} />
            </button>
          </div>

          {/* Paper Theme Toggle */}
          <button
            className="btn-icon"
            onClick={() => setIsSplitView((s) => !s)}
            title="Toggle Split View"
            style={{ color: isSplitView ? 'var(--accent)' : 'var(--muted-foreground)' }}
          >
            <Columns size={14} />
          </button>

          <button
            className="btn-icon"
            onClick={() => setPaperTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={`Switch to ${paperTheme === 'dark' ? 'Light' : 'Dark'} Paper`}
          >
            {paperTheme === 'dark' ? <Moon size={14} color="var(--accent)" /> : <Sun size={14} color="#f59e0b" />}
          </button>
        </div>
      </div>

      {/* Canvas Scroll Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '32px 20px 60px',
          background: paperTheme === 'dark' ? '#060606' : '#d1d5db',
        }}
      >
        <div
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease',
            display: 'flex',
            gap: '32px',
          }}
        >
          {/* === INTERACTIVE EDITOR VIEW === */}
          {(viewMode === 'dom' || isSplitView) && currentPageData && (
            <div
              className={`doc-paper ${paperTheme === 'dark' ? 'doc-paper-dark' : 'doc-paper-light'}`}
              style={{
                position: 'relative',
                padding: `${tokens.marginTopMm ?? tokens.marginMm ?? 15}mm ${tokens.marginMm ?? 15}mm ${tokens.marginBottomMm ?? tokens.marginMm ?? 15}mm ${tokens.marginMm ?? 15}mm`,
              }}
            >
              {tokens.watermarkText && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-45deg)',
                  fontSize: '8rem',
                  fontWeight: 900,
                  color: paperTheme === 'dark' ? '#ffffff' : '#000000',
                  opacity: (tokens.watermarkOpacity || 10) / 100,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  zIndex: 0
                }}>
                  {tokens.watermarkText}
                </div>
              )}
              {/* Header Bar */}
              {tokens.headerText && (
                <div className="doc-header-line">{tokens.headerText}</div>
              )}

              {/* Title & Meta (Page 1 only) */}
              {currentPage === 1 && (
                <div style={{ marginBottom: '28px' }}>
                  <h1
                    className="doc-title"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => onUpdateAST({ ...ast, title: e.currentTarget.innerText.trim() })}
                    style={{ outline: 'none', color: tokens.primaryColor }}
                  >
                    {ast.title}
                  </h1>
                  {ast.subtitle && (
                    <p
                      className="doc-subtitle"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => onUpdateAST({ ...ast, subtitle: e.currentTarget.innerText.trim() })}
                      style={{ outline: 'none' }}
                    >
                      {ast.subtitle}
                    </p>
                  )}
                  <div className="doc-meta">
                    <span>Author: {ast.author}</span>
                    <span>·</span>
                    <span>{ast.date}</span>
                    <span>·</span>
                    <span>{wordCount} words</span>
                  </div>
                  <hr className="doc-divider" />
                </div>
              )}

              {/* Streaming Skeleton */}
              {isStreaming && currentPageData.nodes.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="skeleton" style={{ height: '22px', width: '60%' }} />
                  <div className="skeleton" style={{ height: '14px', width: '100%' }} />
                  <div className="skeleton" style={{ height: '14px', width: '90%' }} />
                  <div className="skeleton" style={{ height: '14px', width: '80%' }} />
                  <div className="skeleton" style={{ height: '20px', width: '45%', marginTop: '8px' }} />
                  <div className="skeleton" style={{ height: '14px', width: '100%' }} />
                  <div className="skeleton" style={{ height: '14px', width: '75%' }} />
                </div>
              )}

              {/* BlockNote Production Editor Canvas */}
              <BlockNoteCanvas
                ast={ast}
                onUpdateAST={onUpdateAST}
                paperTheme={paperTheme}
              />

              {/* Page Footer */}
              {tokens.showPageNumbers && (
                <div className="doc-footer">
                  Page {currentPage} of {totalPages} · Q108 Scholar
                </div>
              )}
            </div>
          )}

          {/* === PDF VIEW === */}
          {(viewMode === 'pdf' || isSplitView) && (
            <div style={{ width: '794px', minHeight: '1123px', background: '#fff', borderRadius: '3px', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
              {compilation?.pdfBlobUrl ? (
                <iframe
                  src={compilation.pdfBlobUrl}
                  title="PDF Preview"
                  style={{ width: '100%', height: '1123px', border: 'none', borderRadius: '3px' }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#64748b' }}>
                  <Sparkles size={32} className="streaming-indicator" style={{ marginBottom: '12px' }} />
                  <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Compiling PDF…</p>
                </div>
              )}
            </div>
          )}

          {/* === AST JSON VIEW === */}
          {viewMode === 'json' && !isSplitView && (
            <div style={{ width: '794px', minHeight: '600px', background: '#050505', color: '#60a5fa', padding: '24px', borderRadius: '8px', border: '1px solid #1e1e1e', fontFamily: 'var(--font-geist-mono)', fontSize: '0.75rem', overflowX: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
              <pre style={{ margin: 0 }}>{JSON.stringify(ast, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


