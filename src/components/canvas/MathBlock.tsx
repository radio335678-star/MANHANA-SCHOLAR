import React, { useState } from 'react';
import { Sigma, Edit2, Check } from 'lucide-react';
import type { ASTNode } from '../../types/ast';

interface MathBlockProps {
  node: ASTNode;
  primaryColor: string;
  paperTheme: 'dark' | 'light';
  onUpdateContent: (nodeId: string, content: string, mathLatex?: string) => void;
}

export const MathBlock: React.FC<MathBlockProps> = ({
  node,
  primaryColor,
  paperTheme,
  onUpdateContent,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [latex, setLatex] = useState(node.mathLatex || node.content || '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}');

  const handleSave = () => {
    setIsEditing(false);
    onUpdateContent(node.id, latex, latex);
  };

  // Helper to format clean display equation HTML/SVG
  const renderMathFormula = (eq: string) => {
    // If KaTeX is loaded on window, use it
    if ((window as any).katex) {
      try {
        return <span dangerouslySetInnerHTML={{ __html: (window as any).katex.renderToString(eq, { displayMode: true }) }} />;
      } catch (err) {
        console.warn("KaTeX render error:", err);
      }
    }

    // Clean fallback styled math formula renderer
    return (
      <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.25rem', fontStyle: 'italic', letterSpacing: '0.05em' }}>
        {eq}
      </div>
    );
  };

  return (
    <div
      style={{
        margin: '16px 0',
        padding: '16px',
        borderRadius: '8px',
        border: `1px solid ${paperTheme === 'dark' ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.15)'}`,
        background: paperTheme === 'dark' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(240, 246, 255, 0.5)',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <Sigma size={14} />
          <span>LaTeX Equation</span>
        </div>
        <button
          onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem',
            padding: '3px 8px', borderRadius: '4px', border: '1px solid #444',
            background: isEditing ? primaryColor : 'transparent',
            color: isEditing ? '#000' : 'inherit', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {isEditing ? <><Check size={12} /> Save Formula</> : <><Edit2 size={12} /> Edit LaTeX</>}
        </button>
      </div>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            rows={2}
            placeholder="Type LaTeX math formula (e.g. \frac{-b \pm \sqrt{b^2-4ac}}{2a})"
            style={{
              width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', padding: '8px',
              borderRadius: '4px', border: '1px solid #555', background: '#111', color: '#60a5fa', outline: 'none',
            }}
          />
          <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>
            Tip: Standard LaTeX syntax like <code>\sum_{'{i=1}'}^{'{n}'} x_i</code>, <code>\frac{'{a}'}{'{b}'}</code>, <code>\sqrt{'{x}'}</code> is supported.
          </div>
        </div>
      ) : (
        <div
          onDoubleClick={() => setIsEditing(true)}
          style={{ textAlign: 'center', padding: '12px 0', cursor: 'pointer' }}
          title="Double-click to edit LaTeX formula"
        >
          {renderMathFormula(latex)}
        </div>
      )}
    </div>
  );
};
