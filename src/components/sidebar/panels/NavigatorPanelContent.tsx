import { Type, Heading1, Heading2, Heading3, Quote } from 'lucide-react';
import type { ManthanaDocumentAST, ASTNode } from '../../../types/ast';

interface NavigatorPanelContentProps {
  ast: ManthanaDocumentAST;
  currentPage: number;
  onJumpToPage: (page: number) => void;
}

const getNodeIcon = (type: ASTNode['type']) => {
  switch (type) {
    case 'heading1': return <Heading1 size={14} />;
    case 'heading2': return <Heading2 size={14} />;
    case 'heading3': return <Heading3 size={14} />;
    case 'paragraph': return <Type size={14} />;
    case 'callout': return <Quote size={14} />;
    default: return <Type size={14} />;
  }
};

export const NavigatorPanelContent = ({ ast, currentPage, onJumpToPage }: NavigatorPanelContentProps) => {
  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
        Document Map
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {ast.pages.map((page, index) => (
          <div key={`page-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div 
              onClick={() => onJumpToPage(index + 1)}
              style={{ 
                fontSize: '12px', 
                fontWeight: 600, 
                color: currentPage === index + 1 ? 'var(--webx-beta)' : 'var(--muted-foreground)',
                cursor: 'pointer',
                display: 'inline-block',
                padding: '2px 6px',
                borderRadius: '4px',
                background: currentPage === index + 1 ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                alignSelf: 'flex-start'
              }}
            >
              Page {index + 1}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
              {page.nodes.map(node => (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', borderRadius: '4px', fontSize: '12px', color: 'var(--foreground)' }}>
                  <span style={{ color: 'var(--muted-foreground)', display: 'flex' }}>
                    {getNodeIcon(node.type)}
                  </span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.8 }}>
                    {node.content || `[${node.type}]`}
                  </span>
                </div>
              ))}
              {page.nodes.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontStyle: 'italic', paddingLeft: '6px' }}>
                  Empty page
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
