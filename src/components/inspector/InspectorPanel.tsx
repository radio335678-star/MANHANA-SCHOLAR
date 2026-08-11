import { useState } from 'react';
import { ChevronRight, ChevronLeft, ChevronDown, Download, FileText, Type, Check } from 'lucide-react';
import type { ManthanaDocumentAST, StyleTokens, FontCategory } from '../../types/ast';
import type { CompilationOutput } from '../../services/documentCompiler';
import { DocumentCompilerService } from '../../services/documentCompiler';
import { DEFAULT_STYLE_TOKENS } from '../../services/aiStreamer';
import { UniversalConverterService } from '../../services/converter';

interface InspectorPanelProps {
  ast: ManthanaDocumentAST;
  compilation: CompilationOutput | null;
  onUpdateTokens: (tokens: Partial<StyleTokens>) => void;
}

const FONT_OPTIONS: { id: FontCategory; name: string; preview: string }[] = [
  { id: 'geist-sans', name: 'Geist Sans', preview: 'Aa' },
  { id: 'inter', name: 'Inter', preview: 'Aa' },
  { id: 'noto-sans', name: 'Noto Sans', preview: 'Aa' },
  { id: 'ibm-plex-serif', name: 'IBM Plex Serif', preview: 'Aa' },
  { id: 'dm-serif-display', name: 'DM Serif Display', preview: 'Aa' },
  { id: 'playfair-display', name: 'Playfair Display', preview: 'Aa' },
  { id: 'geist-mono', name: 'Geist Mono', preview: 'Aa' },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', preview: 'Aa' },
  { id: 'noto-serif-devanagari', name: 'Noto Devanagari', preview: 'अ' },
];

export const InspectorPanel = ({ ast, compilation, onUpdateTokens }: InspectorPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [openSections, setOpenSections] = useState<string[]>(['typography', 'colors', 'layout', 'export']);

  const tokens = { ...DEFAULT_STYLE_TOKENS, ...(ast?.tokens || {}) };

  const toggleSection = (section: string) => {
    setOpenSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const handleExportPdf = () => {
    if (compilation?.pdfBlobUrl) {
      const a = document.createElement('a');
      a.href = compilation.pdfBlobUrl;
      a.download = `${ast?.title || 'document'}.pdf`;
      a.click();
    }
  };

  const handleExportDocx = () => {
    if (compilation?.docxBlobUrl) {
      const a = document.createElement('a');
      a.href = compilation.docxBlobUrl;
      a.download = `${ast?.title || 'document'}.docx`;
      a.click();
    }
  };

  const handleExportMd = () => {
    const markdown = UniversalConverterService.astToMarkdown(ast);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ast?.title || 'document'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHtml = () => {
    if (compilation?.htmlPreview) {
      const blob = new Blob([compilation.htmlPreview], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ast?.title || 'document'}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportEpub = () => {
    const blob = DocumentCompilerService.generateEpub(ast);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ast?.title || 'document'}.epub`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPptx = () => {
    const blob = DocumentCompilerService.generatePptx(ast);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ast?.title || 'document'}.pptx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const colors = ['#000000', '#2563eb', '#16a34a', '#dc2626', '#4f46e5', '#db2777', '#ca8a04', '#0891b2'];

  return (
    <div style={{ position: 'relative', height: '100%', zIndex: 10 }}>
      {/* Toggle Button when collapsed */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            position: 'absolute',
            left: '-28px',
            top: '16px',
            width: '28px',
            height: '28px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRight: 'none',
            borderRadius: '8px 0 0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            color: 'var(--foreground)'
          }}
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div
        style={{
          width: isExpanded ? '260px' : '0px',
          overflow: 'hidden',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border)',
          height: '100%'
        }}
      >
        <div style={{ width: '260px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Properties</h3>
            <button
              onClick={() => setIsExpanded(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Typography */}
            <div className="accordion-section">
              <div className="accordion-trigger" onClick={() => toggleSection('typography')}>
                <span>Typography</span>
                {openSections.includes('typography') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {openSections.includes('typography') && (
                <div className="accordion-content">
                  <label className="section-label">Font Family</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    {FONT_OPTIONS.map(f => {
                      const isSelected = tokens.fontFamily === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => onUpdateTokens({ fontFamily: f.id })}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: isSelected ? 'rgba(96, 165, 250, 0.12)' : 'var(--secondary)',
                            border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            color: isSelected ? 'var(--accent)' : 'var(--foreground)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Type size={13} style={{ opacity: isSelected ? 1 : 0.6 }} />
                            <span style={{
                              fontSize: '0.8rem',
                              fontWeight: isSelected ? 700 : 500,
                              fontFamily: f.id === 'geist-mono' ? 'var(--font-geist-mono)'
                                : f.id === 'noto-serif-devanagari' ? 'var(--font-noto-devanagari)'
                                : f.id === 'ibm-plex-serif' ? 'var(--font-ibm-plex-serif)'
                                : f.id === 'dm-serif-display' ? 'var(--font-dm-serif)'
                                : f.id === 'playfair-display' ? 'var(--font-playfair)'
                                : f.id === 'jetbrains-mono' ? 'var(--font-jetbrains)'
                                : f.id === 'noto-sans' ? 'var(--font-noto-sans)'
                                : f.id === 'inter' ? 'var(--font-inter)'
                                : 'var(--font-geist)',
                            }}>
                              {f.name}
                            </span>
                          </div>
                          {isSelected && <Check size={14} color="var(--accent)" />}
                        </button>
                      );
                    })}
                  </div>

                  <label className="section-label">HEADING SIZES</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: '10px' }}>H1 {tokens.fontSizeH1}
                      <input type="range" min="16" max="48" value={tokens.fontSizeH1} onChange={e => onUpdateTokens({ fontSizeH1: parseInt(e.target.value, 10) })} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: '10px' }}>H2 {tokens.fontSizeH2}
                      <input type="range" min="12" max="32" value={tokens.fontSizeH2} onChange={e => onUpdateTokens({ fontSizeH2: parseInt(e.target.value, 10) })} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: '10px' }}>H3 {tokens.fontSizeH3}
                      <input type="range" min="10" max="24" value={tokens.fontSizeH3} onChange={e => onUpdateTokens({ fontSizeH3: parseInt(e.target.value, 10) })} />
                    </label>
                  </div>

                  <label className="section-label">Body Font Size ({tokens.fontSizeBody})</label>
                  <input
                    type="range"
                    min="8"
                    max="16"
                    value={tokens.fontSizeBody}
                    onChange={(e) => onUpdateTokens({ fontSizeBody: parseInt(e.target.value, 10) })}
                    style={{ width: '100%', marginBottom: '12px' }}
                  />

                  <label className="section-label">Line Height ({tokens.lineHeight})</label>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={tokens.lineHeight}
                    onChange={(e) => onUpdateTokens({ lineHeight: parseFloat(e.target.value) })}
                    style={{ width: '100%', marginBottom: '12px' }}
                  />

                  <label className="section-label">Letter Spacing ({((tokens.letterSpacing || 0) * 1000).toFixed(0)}‰)</label>
                  <input
                    type="range"
                    min="0"
                    max="0.15"
                    step="0.01"
                    value={tokens.letterSpacing || 0}
                    onChange={(e) => onUpdateTokens({ letterSpacing: parseFloat(e.target.value) })}
                    style={{ width: '100%', marginBottom: '12px' }}
                  />

                  <label className="section-label">Para Spacing ({tokens.paragraphSpacing})</label>
                  <input
                    type="range"
                    min="0.25"
                    max="3.0"
                    step="0.25"
                    value={tokens.paragraphSpacing || 1}
                    onChange={(e) => onUpdateTokens({ paragraphSpacing: parseFloat(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
            </div>

            {/* Colors */}
            <div className="accordion-section">
              <div className="accordion-trigger" onClick={() => toggleSection('colors')}>
                <span>Colors</span>
                {openSections.includes('colors') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {openSections.includes('colors') && (
                <div className="accordion-content">
                  <label className="section-label">Primary Color</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {colors.map(color => (
                      <div
                        key={color}
                        onClick={() => onUpdateTokens({ primaryColor: color })}
                        style={{
                          height: '24px',
                          borderRadius: '4px',
                          background: color,
                          cursor: 'pointer',
                          border: tokens.primaryColor === color ? '2px solid var(--foreground)' : '1px solid var(--border)'
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Page Layout */}
            <div className="accordion-section">
              <div className="accordion-trigger" onClick={() => toggleSection('layout')}>
                <span>Page Layout</span>
                {openSections.includes('layout') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {openSections.includes('layout') && (
                <div className="accordion-content">
                  <label className="section-label">Page Size</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    {['A4', 'Letter', 'A3'].map(size => (
                      <button
                        key={size}
                        onClick={() => onUpdateTokens({ pageSize: size as any })}
                        style={{
                          flex: 1, padding: '4px', fontSize: '12px',
                          border: tokens.pageSize === size ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: tokens.pageSize === size ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                          color: 'var(--foreground)', borderRadius: '4px', cursor: 'pointer'
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>

                  <label className="section-label">Columns</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    {[1, 2, 3].map(cols => (
                      <button
                        key={cols}
                        onClick={() => onUpdateTokens({ columns: cols as any })}
                        style={{
                          flex: 1, padding: '4px', fontSize: '12px',
                          border: tokens.columns === cols ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: tokens.columns === cols ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                          color: 'var(--foreground)', borderRadius: '4px', cursor: 'pointer'
                        }}
                      >
                        {cols}
                      </button>
                    ))}
                  </div>

                  <label className="section-label">Header Text</label>
                  <input
                    type="text"
                    className="textarea-field"
                    value={tokens.headerText || ''}
                    onChange={(e) => onUpdateTokens({ headerText: e.target.value })}
                    style={{ height: '32px', marginBottom: '12px' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={!!tokens.showPageNumbers}
                      onChange={(e) => onUpdateTokens({ showPageNumbers: e.target.checked })}
                    />
                    Show Page Numbers
                  </label>
                  
                  {tokens.showPageNumbers && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      {['left', 'center', 'right'].map(pos => (
                        <button
                          key={pos}
                          onClick={() => onUpdateTokens({ pageNumberPosition: pos as any })}
                          style={{
                            flex: 1, padding: '4px', fontSize: '12px', textTransform: 'capitalize',
                            border: tokens.pageNumberPosition === pos ? '1px solid var(--accent)' : '1px solid var(--border)',
                            background: tokens.pageNumberPosition === pos ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                            color: 'var(--foreground)', borderRadius: '4px', cursor: 'pointer'
                          }}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="section-label">Watermark Text</label>
                  <input
                    type="text"
                    className="textarea-field"
                    value={tokens.watermarkText || ''}
                    onChange={(e) => onUpdateTokens({ watermarkText: e.target.value })}
                    style={{ height: '32px', marginBottom: '12px' }}
                  />

                  {!!tokens.watermarkText && (
                    <>
                      <label className="section-label">Watermark Opacity ({tokens.watermarkOpacity}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={tokens.watermarkOpacity || 8}
                        onChange={(e) => onUpdateTokens({ watermarkOpacity: parseInt(e.target.value, 10) })}
                        style={{ width: '100%', marginBottom: '12px' }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Export */}
            <div className="accordion-section">
              <div className="accordion-trigger" onClick={() => toggleSection('export')}>
                <span>Export</span>
                {openSections.includes('export') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {openSections.includes('export') && (
                <div className="accordion-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button className="btn btn-success" onClick={handleExportPdf} style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Download size={14} /> PDF
                    </div>
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>
                      {compilation ? Math.round(compilation.pdfSizeBytes / 1024) : 0} KB
                    </span>
                  </button>
                  <button className="btn btn-ghost" onClick={handleExportDocx} style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} /> DOCX
                    </div>
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>
                      {compilation ? Math.round(compilation.docxSizeBytes / 1024) : 0} KB
                    </span>
                  </button>
                  <button className="btn btn-ghost" onClick={handleExportMd} style={{ justifyContent: 'flex-start' }}>
                    <FileText size={14} /> Markdown
                  </button>
                  <button className="btn btn-ghost" onClick={handleExportHtml} style={{ justifyContent: 'flex-start' }}>
                    <FileText size={14} /> HTML
                  </button>
                  <button className="btn btn-ghost" onClick={handleExportEpub} style={{ justifyContent: 'flex-start' }}>
                    <Download size={14} /> EPUB
                  </button>
                  <button className="btn btn-ghost" onClick={handleExportPptx} style={{ justifyContent: 'flex-start' }}>
                    <Download size={14} /> PPTX
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

