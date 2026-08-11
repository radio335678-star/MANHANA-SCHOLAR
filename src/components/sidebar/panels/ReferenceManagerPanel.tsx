import React, { useState } from 'react';
import { BookOpen, Plus, Trash2, Check } from 'lucide-react';
import type { CitationItem, ManthanaDocumentAST } from '../../../types/ast';

interface ReferenceManagerPanelProps {
  ast: ManthanaDocumentAST;
  onUpdateAST: (newAst: ManthanaDocumentAST) => void;
}

export const ReferenceManagerPanel: React.FC<ReferenceManagerPanelProps> = ({
  ast,
  onUpdateAST,
}) => {
  const [references, setReferences] = useState<CitationItem[]>([
    { id: 'ref-1', author: 'Charaka & Sushruta', year: 2024, title: 'Dravyaguna Pharmacology & Swastha Principles', publisher: 'Ayurveda Classical Corpus' },
    { id: 'ref-2', author: 'Sharma et al.', year: 2025, title: 'Client-Accelerated WebGPU Neural Processing in Browser Memory', publisher: 'IEEE Transactions on Web Software' },
  ]);

  const [author, setAuthor] = useState('');
  const [year, setYear] = useState('2026');
  const [title, setTitle] = useState('');

  const handleAddReference = () => {
    if (!author || !title) return;
    const newItem: CitationItem = {
      id: `ref-${Date.now()}`,
      author,
      year: parseInt(year) || 2026,
      title,
    };
    setReferences(prev => [...prev, newItem]);
    setAuthor('');
    setTitle('');
  };

  const handleInsertBibliography = () => {
    const bibText = references.map((r, i) => `[${i + 1}] ${r.author} (${r.year}). "${r.title}". ${r.publisher || 'Academic Publisher'}.`).join('\n\n');

    const newAst = JSON.parse(JSON.stringify(ast)) as ManthanaDocumentAST;
    if (newAst.pages.length === 0) newAst.pages.push({ pageNumber: 1, nodes: [] });
    
    newAst.pages[newAst.pages.length - 1].nodes.push({
      id: `bib-${Date.now()}`,
      type: 'bibliography',
      content: bibText,
      citations: references,
    });

    onUpdateAST(newAst);
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto' }}>
      <div>
        <label className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BookOpen size={14} /> Local PDF Reference Manager (RAG)
        </label>
        <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
          IndexedDB citation catalog for APA/IEEE references and auto-bibliography generation.
        </div>
      </div>

      {/* Add Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--secondary)', padding: '10px', borderRadius: '6px' }}>
        <input
          type="text"
          placeholder="Author(s) (e.g. Smith et al.)"
          value={author}
          onChange={e => setAuthor(e.target.value)}
          style={{ fontSize: '0.8rem', padding: '6px', borderRadius: '4px', border: '1px solid #444', background: '#111', color: '#fff' }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ flex: 1, fontSize: '0.8rem', padding: '6px', borderRadius: '4px', border: '1px solid #444', background: '#111', color: '#fff' }}
          />
          <input
            type="text"
            placeholder="Year"
            value={year}
            onChange={e => setYear(e.target.value)}
            style={{ width: '60px', fontSize: '0.8rem', padding: '6px', borderRadius: '4px', border: '1px solid #444', background: '#111', color: '#fff' }}
          />
        </div>
        <button
          onClick={handleAddReference}
          className="btn btn-primary"
          style={{ justifyContent: 'center', fontSize: '0.75rem', padding: '6px' }}
        >
          <Plus size={14} /> Add Reference
        </button>
      </div>

      {/* Reference List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label className="section-label">Indexed Citations ({references.length})</label>
        {references.map((ref) => (
          <div key={ref.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', borderRadius: '6px', background: 'var(--secondary)', border: '1px solid #333' }}>
            <div style={{ fontSize: '0.78rem', overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{ref.author} ({ref.year})</div>
              <div style={{ opacity: 0.8, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>{ref.title}</div>
            </div>
            <button
              onClick={() => setReferences(prev => prev.filter(r => r.id !== ref.id))}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Insert Bibliography Button */}
      <button
        onClick={handleInsertBibliography}
        className="btn btn-success"
        style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
      >
        <Check size={14} /> Insert APA Bibliography Block
      </button>
    </div>
  );
};
