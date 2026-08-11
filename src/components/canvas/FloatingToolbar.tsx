import { useState, useEffect, useRef } from 'react';
import { Bold, Italic, Underline, Strikethrough, Link, Palette, X } from 'lucide-react';
import type { RichSpan } from '../../types/ast';

interface FloatingToolbarProps {
  onApplyFormat: (format: Partial<RichSpan>) => void;
  onClearFormat: () => void;
}

export const FloatingToolbar = ({ onApplyFormat, onClearFormat }: FloatingToolbarProps) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [linkMode, setLinkMode] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
        setPos(null);
        setLinkMode(false);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setPos({
        top: rect.top + window.scrollY - 48,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  if (!pos) return null;

  const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#000000'];

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        background: '#1c1c1c',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '4px 6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.1s ease',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolBtn title="Bold" onClick={() => onApplyFormat({ bold: true })}><Bold size={13} /></ToolBtn>
      <ToolBtn title="Italic" onClick={() => onApplyFormat({ italic: true })}><Italic size={13} /></ToolBtn>
      <ToolBtn title="Underline" onClick={() => onApplyFormat({ underline: true })}><Underline size={13} /></ToolBtn>
      <ToolBtn title="Strikethrough" onClick={() => onApplyFormat({ strikethrough: true })}><Strikethrough size={13} /></ToolBtn>
      <div style={{ width: '1px', height: '16px', background: '#333', margin: '0 2px' }} />
      <div style={{ position: 'relative' }}>
        <ToolBtn title="Text Color" onClick={() => setColorPickerOpen(o => !o)}>
          <Palette size={13} />
        </ToolBtn>
        {colorPickerOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            marginTop: '4px', background: '#1c1c1c', border: '1px solid #333',
            borderRadius: '8px', padding: '8px', display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', zIndex: 10000,
          }}>
            {COLORS.map(color => (
              <div
                key={color}
                onClick={() => { onApplyFormat({ color }); setColorPickerOpen(false); }}
                style={{ width: 18, height: 18, borderRadius: '4px', background: color, cursor: 'pointer', border: '1px solid #555' }}
              />
            ))}
          </div>
        )}
      </div>
      {linkMode ? (
        <>
          <input
            type="text"
            placeholder="https://"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #555', background: '#111', color: '#e8e8e8', outline: 'none', width: '120px' }}
            onKeyDown={e => { if (e.key === 'Enter') { onApplyFormat({ link: inputUrl }); setLinkMode(false); setInputUrl(''); } }}
          />
          <ToolBtn title="Cancel" onClick={() => setLinkMode(false)}><X size={13} /></ToolBtn>
        </>
      ) : (
        <ToolBtn title="Add Link" onClick={() => setLinkMode(true)}><Link size={13} /></ToolBtn>
      )}
      <div style={{ width: '1px', height: '16px', background: '#333', margin: '0 2px' }} />
      <ToolBtn title="Clear Formatting" onClick={onClearFormat} style={{ color: '#ef4444' }}><X size={13} /></ToolBtn>
    </div>
  );
};

const ToolBtn = ({ children, onClick, title, style }: { children: React.ReactNode; onClick: () => void; title: string; style?: React.CSSProperties }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26, borderRadius: '5px',
      background: 'transparent', border: 'none',
      color: '#e8e8e8', cursor: 'pointer',
      transition: 'background 0.1s',
      ...style,
    }}
    onMouseEnter={e => (e.currentTarget.style.background = '#333')}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
  >
    {children}
  </button>
);
