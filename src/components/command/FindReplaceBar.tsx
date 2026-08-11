import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUp, ArrowDown, X, RefreshCcw, CheckSquare } from 'lucide-react';
import type { ManthanaDocumentAST } from '../../types/ast';

interface FindReplaceBarProps {
  isOpen: boolean;
  onClose: () => void;
  ast: ManthanaDocumentAST;
  onUpdateAST: (newAst: ManthanaDocumentAST) => void;
}

interface MatchResult {
  nodeId: string;
  pageIndex: number;
  nodeIndex: number;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  isOpen,
  onClose,
  ast,
  onUpdateAST
}) => {
  const [search, setSearch] = useState('');
  const [replace, setReplace] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);

  // Find all matching nodes
  const matches = useMemo(() => {
    if (!search) return [];
    const results: MatchResult[] = [];
    const searchRegex = new RegExp(search, isCaseSensitive ? 'g' : 'gi');
    
    ast.pages.forEach((page, pageIndex) => {
      page.nodes.forEach((node, nodeIndex) => {
        if (node.content && node.content.match(searchRegex)) {
          results.push({ nodeId: node.id, pageIndex, nodeIndex });
        }
      });
    });
    return results;
  }, [search, isCaseSensitive, ast]);

  useEffect(() => {
    if (matches.length > 0 && matchIndex >= matches.length) {
      setMatchIndex(Math.max(0, matches.length - 1));
    }
  }, [matches.length, matchIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleNextMatch = () => {
    if (matches.length > 0) {
      setMatchIndex((matchIndex + 1) % matches.length);
    }
  };

  const handlePrevMatch = () => {
    if (matches.length > 0) {
      setMatchIndex((matchIndex - 1 + matches.length) % matches.length);
    }
  };

  const handleReplace = () => {
    if (matches.length === 0) return;
    const match = matches[matchIndex];
    
    const newAst = { ...ast, pages: [...ast.pages] };
    const page = { ...newAst.pages[match.pageIndex] };
    page.nodes = [...page.nodes];
    const node = { ...page.nodes[match.nodeIndex] };
    
    const regex = new RegExp(search, isCaseSensitive ? '' : 'i');
    node.content = node.content.replace(regex, replace);
    
    page.nodes[match.nodeIndex] = node;
    newAst.pages[match.pageIndex] = page;
    
    onUpdateAST(newAst);
  };

  const handleReplaceAll = () => {
    if (matches.length === 0) return;
    const newAst = { ...ast, pages: [...ast.pages] };
    const searchRegex = new RegExp(search, isCaseSensitive ? 'g' : 'gi');
    
    newAst.pages = newAst.pages.map(page => ({
      ...page,
      nodes: page.nodes.map(node => {
        if (node.content && node.content.match(searchRegex)) {
          return {
            ...node,
            content: node.content.replace(searchRegex, replace)
          };
        }
        return node;
      })
    }));
    
    onUpdateAST(newAst);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '16px',
      right: '16px',
      zIndex: 90,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      width: '320px',
      color: 'var(--foreground)',
      fontFamily: 'var(--font-geist)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Find & Replace</h4>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input 
          type="text" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="Find..." 
          style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleNextMatch(); }}
          autoFocus
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', minWidth: '70px', textAlign: 'center' }}>
          {matches.length > 0 ? `${matchIndex + 1} / ${matches.length}` : '0 / 0'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input 
          type="text" 
          value={replace} 
          onChange={(e) => setReplace(e.target.value)} 
          placeholder="Replace with..." 
          style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
        />
        <button onClick={() => setIsCaseSensitive(!isCaseSensitive)} title="Match Case" style={{ padding: '6px', background: isCaseSensitive ? 'var(--accent-dim)' : 'transparent', color: isCaseSensitive ? 'var(--accent)' : 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', display: 'flex' }}>
          <CheckSquare size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={handlePrevMatch} title="Previous Match" style={{ padding: '6px', background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', display: 'flex' }}>
            <ArrowUp size={14} />
          </button>
          <button onClick={handleNextMatch} title="Next Match" style={{ padding: '6px', background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', display: 'flex' }}>
            <ArrowDown size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={handleReplace} style={{ padding: '6px 12px', background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>
            Replace
          </button>
          <button onClick={handleReplaceAll} style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', gap: '4px', alignItems: 'center' }}>
            <RefreshCcw size={12} /> All
          </button>
        </div>
      </div>
    </div>
  );
};
