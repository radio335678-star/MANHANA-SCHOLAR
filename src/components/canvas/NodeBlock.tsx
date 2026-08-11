import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp, ArrowDown, Trash2, Plus, GripVertical
} from 'lucide-react';
import type { ASTNode, ASTNodeType } from '../../types/ast';
import { FloatingToolbar } from './FloatingToolbar';
import { MathBlock } from './MathBlock';
import { ChartBlock } from './ChartBlock';
import { TrackChangesDiff } from './TrackChangesDiff';

interface NodeBlockProps {
  node: ASTNode;
  primaryColor: string;
  fontSizeBody: number;
  fontSizeH1: number;
  fontSizeH2: number;
  fontSizeH3: number;
  letterSpacing: number;
  lineHeight: number;
  paperTheme: 'dark' | 'light';
  onContentChange: (nodeId: string, content: string) => void;
  onUpdateType: (nodeId: string, type: ASTNodeType, subContent?: string) => void;
  onMoveUp: (nodeId: string) => void;
  onMoveDown: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onAddBelow: (nodeId: string) => void;
  onReorderNodes: (draggedId: string, targetId: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

export const NodeBlock: React.FC<NodeBlockProps> = ({
  node,
  primaryColor,
  fontSizeBody,
  fontSizeH1,
  fontSizeH2,
  fontSizeH3,
  letterSpacing,
  lineHeight,
  paperTheme,
  onContentChange,
  onUpdateType,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAddBelow,
  onReorderNodes,
  isFirst,
  isLast,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingHtml, setIsEditingHtml] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textColor = paperTheme === 'dark' ? '#e8e8e8' : '#0a0a0a';
  const mutedColor = paperTheme === 'dark' ? '#8a8a8a' : '#6a6a6a';
  const borderColor = paperTheme === 'dark' ? '#272727' : '#d8d8d8';

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuFilter, setSlashMenuFilter] = useState('');
  const editableRef = useRef<HTMLElement | null>(null);

  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    const newContent = e.currentTarget.innerText;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onContentChange(node.id, newContent);
    }, 300);
  };

  const handleInput = (e: React.FormEvent<HTMLElement>) => {
    const text = e.currentTarget.innerText;
    
    // Live Markdown Formatting
    if (text === '# ') {
      e.currentTarget.innerText = '';
      onUpdateType(node.id, 'heading1');
      onContentChange(node.id, '');
    } else if (text === '## ') {
      e.currentTarget.innerText = '';
      onUpdateType(node.id, 'heading2');
      onContentChange(node.id, '');
    } else if (text === '### ') {
      e.currentTarget.innerText = '';
      onUpdateType(node.id, 'heading3');
      onContentChange(node.id, '');
    } else if (text === '> ') {
      e.currentTarget.innerText = '';
      onUpdateType(node.id, 'callout');
      onContentChange(node.id, '');
    } else if (text === '``` ') {
      e.currentTarget.innerText = '';
      onUpdateType(node.id, 'codeblock');
      onContentChange(node.id, '');
    } else if (text === '---') {
      e.currentTarget.innerText = '';
      onUpdateType(node.id, 'divider', 'PAGE_BREAK');
      onContentChange(node.id, '');
    } else {
      // Slash Command Trigger
      if (text.startsWith('/')) {
        setShowSlashMenu(true);
        setSlashMenuFilter(text.slice(1).toLowerCase());
      } else {
        setShowSlashMenu(false);
      }
    }
  };

  const SLASH_COMMANDS = [
    { id: 'h1', label: 'Heading 1', type: 'heading1' },
    { id: 'h2', label: 'Heading 2', type: 'heading2' },
    { id: 'h3', label: 'Heading 3', type: 'heading3' },
    { id: 'p', label: 'Paragraph', type: 'paragraph' },
    { id: 'code', label: 'Code Block', type: 'codeblock' },
    { id: 'call', label: 'Callout Box', type: 'callout' },
    { id: 'img', label: 'Image', type: 'image' },
    { id: 'richhtml', label: 'Custom HTML', type: 'richhtml' },
    { id: 'toc', label: 'Table of Contents', type: 'toc' },
    { id: 'footnote', label: 'Footnote', type: 'footnote' },
    { id: 'break', label: 'Page Break', type: 'divider', subContent: 'PAGE_BREAK' },
  ];

  const handleSlashCommandSelect = (type: ASTNodeType, subContent?: string) => {
    setShowSlashMenu(false);
    if (editableRef.current) {
      editableRef.current.innerText = '';
    }
    onUpdateType(node.id, type, subContent);
    onContentChange(node.id, '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (showSlashMenu) {
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const filtered = SLASH_COMMANDS.filter(cmd => cmd.id.includes(slashMenuFilter) || cmd.label.toLowerCase().includes(slashMenuFilter));
        if (filtered.length > 0) {
          handleSlashCommandSelect(filtered[0].type as ASTNodeType, filtered[0].subContent);
        }
      }
    }
  };

  const editableProps = {
    contentEditable: true as const,
    suppressContentEditableWarning: true,
    onBlur: handleBlur,
    onInput: handleInput,
    onKeyDown: handleKeyDown,
    style: { outline: 'none' },
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', closeMenu);
    }
    return () => document.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.id);
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedNodeId = e.dataTransfer.getData('text/plain');
    if (draggedNodeId && draggedNodeId !== node.id) {
      onReorderNodes(draggedNodeId, node.id);
    }
  };

  return (
    <div
      className="node-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        position: 'relative',
        borderRadius: '6px',
        padding: '3px 6px',
        margin: '0 -6px',
        border: `1px solid ${isHovered ? 'rgba(96, 165, 250, 0.3)' : 'transparent'}`,
        transition: 'border-color 0.15s ease',
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 99999,
            background: paperTheme === 'dark' ? '#1c1c1c' : '#ffffff',
            border: `1px solid ${borderColor}`,
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: '0.78rem',
            color: textColor,
            minWidth: '140px',
          }}
          onClick={() => setContextMenu(null)}
        >
          <div
            style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}
            onClick={() => navigator.clipboard.writeText(node.content)}
          >
            📋 Copy Content
          </div>
          <div
            style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center', opacity: isFirst ? 0.4 : 1 }}
            onClick={() => !isFirst && onMoveUp(node.id)}
          >
            ⬆ Move Up
          </div>
          <div
            style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center', opacity: isLast ? 0.4 : 1 }}
            onClick={() => !isLast && onMoveDown(node.id)}
          >
            ⬇ Move Down
          </div>
          <div
            style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}
            onClick={() => onAddBelow(node.id)}
          >
            ➕ Insert Below
          </div>
          <div style={{ height: '1px', background: borderColor, margin: '4px 0' }} />
          <div
            style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center', color: '#ef4444' }}
            onClick={() => onDelete(node.id)}
          >
            🗑 Delete Block
          </div>
        </div>
      )}

      {/* Hover Toolbar */}
      {isHovered && (
        <div
          style={{
            position: 'absolute',
            top: '-12px',
            right: '0',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: paperTheme === 'dark' ? '#141414' : '#ffffff',
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            padding: '3px',
            zIndex: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          <span style={{ fontSize: '0.62rem', color: mutedColor, padding: '0 4px', userSelect: 'none' }}>
            {node.type}
          </span>
          <div style={{ width: 1, height: 14, background: borderColor }} />
          <button title="Move Up" disabled={isFirst} onClick={() => onMoveUp(node.id)} className="node-toolbar-btn" style={{ opacity: isFirst ? 0.3 : 1 }}>
            <ArrowUp size={11} />
          </button>
          <button title="Move Down" disabled={isLast} onClick={() => onMoveDown(node.id)} className="node-toolbar-btn" style={{ opacity: isLast ? 0.3 : 1 }}>
            <ArrowDown size={11} />
          </button>
          <div style={{ width: 1, height: 14, background: borderColor }} />
          <button title="Add Block Below" onClick={() => onAddBelow(node.id)} className="node-toolbar-btn">
            <Plus size={11} />
          </button>
          <button title="Delete Block" onClick={() => onDelete(node.id)} className="node-toolbar-btn danger" style={{ color: '#ef4444' }}>
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* Drag handle (visual only) */}
      {isHovered && (
        <div style={{ position: 'absolute', left: '-18px', top: '50%', transform: 'translateY(-50%)', color: mutedColor, opacity: 0.5 }}>
          <GripVertical size={12} />
        </div>
      )}

      {/* Node Content by type */}
      {node.type === 'heading1' && (
        <h2 className="doc-h1" {...editableProps} ref={(r) => { editableRef.current = r; }} style={{ ...editableProps.style, color: primaryColor, marginBottom: 0, fontSize: `${fontSizeH1}pt`, letterSpacing: `${letterSpacing}em` }}>
          {node.content}
        </h2>
      )}

      {node.type === 'heading2' && (
        <h3 className="doc-h2" {...editableProps} ref={(r) => { editableRef.current = r; }} style={{ ...editableProps.style, color: textColor, marginBottom: 0, fontSize: `${fontSizeH2}pt`, letterSpacing: `${letterSpacing}em` }}>
          {node.content}
        </h3>
      )}

      {node.type === 'heading3' && (
        <h4 {...editableProps} ref={(r) => { editableRef.current = r; }} style={{ ...editableProps.style, fontWeight: 700, color: textColor, fontSize: `${fontSizeH3}pt`, letterSpacing: `${letterSpacing}em` }}>
          {node.content}
        </h4>
      )}

      {node.type === 'paragraph' && (
        <p className="doc-p" {...editableProps} ref={(r) => { editableRef.current = r; }} style={{ ...editableProps.style, fontSize: `${fontSizeBody}pt`, letterSpacing: `${letterSpacing}em`, lineHeight, color: textColor }}>
          {node.content}
        </p>
      )}

      {node.type === 'callout' && (
        <div className="doc-callout" style={{ borderLeftColor: primaryColor, background: paperTheme === 'dark' ? 'rgba(96,165,250,0.05)' : 'rgba(37,99,235,0.05)' }}>
          <div {...editableProps} ref={(r) => { editableRef.current = r; }} style={{ ...editableProps.style, fontSize: '0.82rem', lineHeight: 1.55, color: textColor }}>
            {node.content}
          </div>
        </div>
      )}

      {node.type === 'shloka' && (
        <div className="doc-shloka">
          <span className="doc-shloka-tag" style={{ color: primaryColor }}>
            {node.citationId || 'श्लोकः'}
          </span>
          <div className="doc-shloka-text font-serif-devanagari" {...editableProps} ref={(r) => { editableRef.current = r; }} style={{ ...editableProps.style, color: textColor }}>
            {node.content}
          </div>
          {node.subContent && (
            <div className="doc-shloka-subtext">
              {node.subContent}
            </div>
          )}
        </div>
      )}

      {node.type === 'codeblock' && (
        <pre className="doc-codeblock">
          <code {...editableProps} ref={(r) => { editableRef.current = r; }}>{node.content}</code>
        </pre>
      )}

      {node.type === 'divider' && node.subContent === 'PAGE_BREAK' ? (
        <div style={{ textAlign: 'center', margin: '20px 0', opacity: 0.5, borderTop: '2px dashed #999', paddingTop: '4px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          --- Page Break ---
        </div>
      ) : node.type === 'divider' && (
        <hr style={{ border: 'none', borderTop: `1px solid ${borderColor}`, margin: '4px 0' }} />
      )}

      {node.type === 'table' && node.tableData && (
        <div style={{ overflowX: 'auto' }}>
          <table className="doc-table">
            <tbody>
              {node.tableData.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => {
                    const Tag = cell.isHeader ? 'th' : 'td';
                    return (
                      <Tag key={cIdx} style={{ color: cell.isHeader ? primaryColor : textColor }}>
                        {cell.text}
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {node.type === 'key_value_grid' && node.tableData && (
        <div className="doc-kv-grid">
          {node.tableData.map((row, idx) => (
            <React.Fragment key={idx}>
              <span className="doc-kv-key" style={{ color: primaryColor }}>{row[0]?.text || ''}</span>
              <span className="doc-kv-val" style={{ color: textColor }}>{row[1]?.text || ''}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {node.type === 'richhtml' && (
        <div className="doc-richhtml" style={{ border: `1px dashed ${borderColor}`, padding: '8px', borderRadius: '4px' }}>
          <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={() => setIsEditingHtml(!isEditingHtml)} 
              style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: primaryColor, color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {isEditingHtml ? 'Preview' : 'Edit HTML'}
            </button>
          </div>
          {isEditingHtml ? (
            <textarea
              style={{ width: '100%', minHeight: '100px', fontFamily: 'monospace', fontSize: '0.8rem', padding: '8px', background: paperTheme === 'dark' ? '#111' : '#f9f9f9', color: textColor, border: `1px solid ${borderColor}`, borderRadius: '4px' }}
              defaultValue={node.htmlContent || node.content}
              onBlur={(e) => {
                onContentChange(node.id, e.target.value);
              }}
            />
          ) : (
            <div dangerouslySetInnerHTML={{ __html: node.htmlContent || node.content || '<i>Empty HTML</i>' }} />
          )}
        </div>
      )}

      {node.type === 'image' && (
        <div className="doc-image" style={{ textAlign: 'center' }}>
          <img src={node.imageUrl || node.content || 'https://via.placeholder.com/400x250'} alt={node.imageAlt || 'Document image'} style={{ maxWidth: '100%', borderRadius: '6px' }} />
          {isHovered && (
            <div style={{ marginTop: '8px' }}>
              <input 
                type="text" 
                placeholder="Image URL..." 
                defaultValue={node.imageUrl || node.content}
                onBlur={(e) => onContentChange(node.id, e.target.value)}
                style={{ fontSize: '0.7rem', padding: '4px', width: '80%', border: `1px solid ${borderColor}`, borderRadius: '4px', background: paperTheme === 'dark' ? '#111' : '#fff', color: textColor }}
              />
            </div>
          )}
        </div>
      )}

      {node.type === 'toc' && (
        <div className="doc-toc" style={{ background: paperTheme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', padding: '16px', borderRadius: '6px', border: `1px solid ${borderColor}` }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Table of Contents</h4>
          <div style={{ fontSize: '0.85rem', color: textColor, opacity: 0.8 }}>
            <i>(Table of Contents will be auto-generated on export)</i>
          </div>
        </div>
      )}

      {node.type === 'footnote' && (
        <div className="doc-footnote" style={{ fontSize: '0.75rem', color: mutedColor, marginTop: '12px', display: 'flex', gap: '4px' }}>
          <sup style={{ color: primaryColor }}>[^1]</sup>
          <span {...editableProps} ref={(r) => { editableRef.current = r; }} style={{ ...editableProps.style, flex: 1 }}>{node.content || 'Footnote text...'}</span>
        </div>
      )}

      {node.type === 'math' && (
        <MathBlock
          node={node}
          primaryColor={primaryColor}
          paperTheme={paperTheme}
          onUpdateContent={(id, content) => {
            onContentChange(id, content);
          }}
        />
      )}

      {node.type === 'chart' && (
        <ChartBlock
          node={node}
          primaryColor={primaryColor}
          paperTheme={paperTheme}
          onUpdateContent={(id, content) => {
            onContentChange(id, content);
          }}
        />
      )}

      {node.type === 'bibliography' && (
        <div className="doc-bibliography" style={{ margin: '16px 0', padding: '16px', borderRadius: '8px', border: `1px solid ${borderColor}`, background: paperTheme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.1em' }}>References & Bibliography</h4>
          <pre style={{ fontFamily: 'var(--font-geist)', fontSize: '0.82rem', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0, color: textColor }}>
            {node.content}
          </pre>
        </div>
      )}

      {node.diffStatus === 'proposed' && node.originalContent && (
        <TrackChangesDiff
          originalContent={node.originalContent}
          newContent={node.content}
          primaryColor={primaryColor}
          onAccept={() => {
            onContentChange(node.id, node.content);
          }}
          onReject={() => {
            onContentChange(node.id, node.originalContent || '');
          }}
        />
      )}

      {/* Slash Menu */}
      {showSlashMenu && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            background: paperTheme === 'dark' ? '#1c1c1c' : '#ffffff',
            border: `1px solid ${borderColor}`,
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            maxHeight: '200px',
            overflowY: 'auto',
            minWidth: '200px',
          }}
        >
          {SLASH_COMMANDS.filter(cmd => cmd.id.includes(slashMenuFilter) || cmd.label.toLowerCase().includes(slashMenuFilter)).map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`slash-menu-option ${idx === 0 ? 'active' : ''}`}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                borderRadius: '4px',
                background: idx === 0 ? (paperTheme === 'dark' ? '#333' : '#f0f0f0') : 'transparent',
                color: textColor,
              }}
              onClick={() => handleSlashCommandSelect(cmd.type as ASTNodeType, cmd.subContent)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = paperTheme === 'dark' ? '#333' : '#f0f0f0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ fontWeight: 600 }}>/{cmd.id}</div>
              <div style={{ fontSize: '0.7rem', color: mutedColor }}>{cmd.label}</div>
            </div>
          ))}
        </div>
      )}

      <FloatingToolbar
        onApplyFormat={(format) => {
          if (format.bold) document.execCommand('bold');
          if (format.italic) document.execCommand('italic');
          if (format.underline) document.execCommand('underline');
          if (format.strikethrough) document.execCommand('strikeThrough');
          if (format.color) document.execCommand('foreColor', false, format.color);
          if (format.link) document.execCommand('createLink', false, format.link);
        }}
        onClearFormat={() => {
          document.execCommand('removeFormat');
        }}
      />
    </div>
  );
};
