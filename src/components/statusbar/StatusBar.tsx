import type { ManthanaDocumentAST } from '../../types/ast';

interface StatusBarProps {
  ast: ManthanaDocumentAST;
  compilationTimeMs: number;
  webGpuActive: boolean;
  viewHint?: string;
}

export const StatusBar = ({ ast, compilationTimeMs, webGpuActive, viewHint = 'Print Mode' }: StatusBarProps) => {
  const pages = ast?.pages || [];
  const totalPages = pages.length > 0 ? pages.length : 1;
  
  let wordCount = 0;
  pages.forEach(p => {
    (p.nodes || []).forEach(n => {
      if (n?.content) {
        const words = n.content.trim().split(/\s+/).filter(Boolean);
        wordCount += words.length;
      }
    });
  });

  const tokens = Math.round(wordCount * 1.3);

  return (
    <div className="statusbar" style={{ zIndex: 10 }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <span>Pages: {totalPages}</span>
        <span style={{ opacity: 0.4 }}>•</span>
        <span>Words: {wordCount}</span>
        <span style={{ opacity: 0.4 }}>•</span>
        <span>Tokens: {tokens}</span>
      </div>

      <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>
        {viewHint}
      </div>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <span className="badge badge-accent">Compiled: {compilationTimeMs}ms</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: webGpuActive ? '#3b82f6' : '#10b981' }} />
          <span>{webGpuActive ? 'WebGPU Active' : 'CPU Rendering'}</span>
        </div>
        <span style={{ opacity: 0.7 }}>Ctrl+K for commands</span>
      </div>
    </div>
  );
};

