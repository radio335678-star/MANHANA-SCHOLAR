import React from 'react';
import { X, Heading1, Heading2, Heading3, AlignLeft, Code, Table, Quote, Minus, BookOpen } from 'lucide-react';
import type { ASTNodeType } from '../../types/ast';

interface BlockTypePickerProps {
  onSelect: (type: ASTNodeType) => void;
  onClose: () => void;
  position?: { top: number; left: number };
}

const BLOCK_TYPES: { type: ASTNodeType; icon: React.ReactNode; label: string; desc: string }[] = [
  { type: 'heading1',    icon: <Heading1 size={16} />,  label: 'Heading 1',   desc: 'Large section heading' },
  { type: 'heading2',    icon: <Heading2 size={16} />,  label: 'Heading 2',   desc: 'Medium sub-heading' },
  { type: 'heading3',    icon: <Heading3 size={16} />,  label: 'Heading 3',   desc: 'Small sub-heading' },
  { type: 'paragraph',   icon: <AlignLeft size={16} />, label: 'Paragraph',   desc: 'Body text block' },
  { type: 'callout',     icon: <Quote size={16} />,     label: 'Callout',     desc: 'Highlighted note box' },
  { type: 'codeblock',   icon: <Code size={16} />,      label: 'Code Block',  desc: 'Monospace code snippet' },
  { type: 'shloka',      icon: <BookOpen size={16} />,  label: 'Shloka',      desc: 'Sanskrit verse + translation' },
  { type: 'table',       icon: <Table size={16} />,     label: 'Table',       desc: '3×3 data table' },
  { type: 'divider',     icon: <Minus size={16} />,     label: 'Divider',     desc: 'Horizontal rule' },
];

export const BlockTypePicker: React.FC<BlockTypePickerProps> = ({ onSelect, onClose }) => {
  return (
    <div
      className="slide-up"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '110%',
        transform: 'translateX(-50%)',
        width: '340px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
        zIndex: 30,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground)' }}>Add Block</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ padding: '6px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
        {BLOCK_TYPES.map((bt) => (
          <button
            key={bt.type}
            onClick={() => { onSelect(bt.type); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 12px',
              borderRadius: '8px',
              background: 'none',
              border: '1px solid transparent',
              color: 'var(--foreground)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--secondary)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'none';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
            }}
          >
            <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{bt.icon}</span>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>{bt.label}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', marginTop: '1px' }}>{bt.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
