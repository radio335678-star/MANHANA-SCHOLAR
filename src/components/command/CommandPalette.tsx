import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, FileText, Download, Eye, Bot, ArrowRight, Zap, Layers } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCommand: (cmd: string) => void;
}

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  description?: string;
}

interface CommandGroup {
  label: string;
  icon: React.ReactNode;
  commands: CommandItem[];
}

export const CommandPalette = ({ isOpen, onClose, onCommand }: CommandPaletteProps) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  const groups: CommandGroup[] = [
    {
      label: 'Document',
      icon: <FileText size={13} />,
      commands: [
        { id: 'New Document', label: 'New Document', shortcut: 'Ctrl+N', description: 'Create a blank document', icon: <FileText size={14} /> },
        { id: 'Export as PDF', label: 'Export as PDF', shortcut: 'Ctrl+P', description: 'Download as PDF file', icon: <Download size={14} /> },
        { id: 'Export as DOCX', label: 'Export as DOCX', shortcut: 'Ctrl+D', description: 'Download as Word document', icon: <Download size={14} /> },
        { id: 'Export as Markdown', label: 'Export as Markdown', description: 'Download as .md file', icon: <Download size={14} /> },
        { id: 'Export as HTML', label: 'Export as HTML', description: 'Download as .html file', icon: <Download size={14} /> },
      ]
    },
    {
      label: 'View',
      icon: <Eye size={13} />,
      commands: [
        { id: 'Toggle Sidebar', label: 'Toggle Sidebar', shortcut: 'Ctrl+[', description: 'Show/hide left panel' },
        { id: 'Toggle Inspector', label: 'Toggle Inspector', shortcut: 'Ctrl+]', description: 'Show/hide right panel' },
        { id: 'Toggle Dark/Light Mode', label: 'Toggle Theme', description: 'Switch dark/light mode' },
      ]
    },
    {
      label: 'AI Actions',
      icon: <Bot size={13} />,
      commands: [
        { id: 'Summarize Document', label: 'Summarize Document', icon: <Zap size={14} />, description: 'AI condenses to 3 paragraphs' },
        { id: 'Improve Writing', label: 'Improve Writing', icon: <Zap size={14} />, description: 'Rewrite in professional tone' },
        { id: 'Generate Table of Contents', label: 'Generate Table of Contents', icon: <Layers size={14} />, description: 'Auto-build ToC from headings' },
        { id: 'Grammar Check', label: 'Grammar Check', icon: <Zap size={14} />, description: 'Stream inline corrections' },
        { id: 'Add Conclusion', label: 'Add Conclusion', icon: <Zap size={14} />, description: 'Generate a concluding section' },
      ]
    },
    {
      label: 'Navigate',
      icon: <ArrowRight size={13} />,
      commands: [
        { id: 'Go to Page 1', label: 'Go to Page 1' },
        { id: 'Go to Page 2', label: 'Go to Page 2' },
        { id: 'Go to Page 3', label: 'Go to Page 3' },
      ]
    },
  ];

  const flatCommands = groups
    .flatMap(g => g.commands)
    .filter(c =>
      search === '' ||
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(search.toLowerCase())
    );

  const filteredGroups = search === ''
    ? groups
    : groups.map(g => ({
        ...g,
        commands: g.commands.filter(c =>
          c.label.toLowerCase().includes(search.toLowerCase()) ||
          (c.description || '').toLowerCase().includes(search.toLowerCase())
        )
      })).filter(g => g.commands.length > 0);

  // Scroll selected item into view when index changes
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleSelect = useCallback((cmdId: string) => {
    onCommand(cmdId);
    onClose();
  }, [onCommand, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        setSelectedIndex(prev => (prev + 1) % flatCommands.length);
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setSelectedIndex(prev => (prev - 1 + flatCommands.length) % flatCommands.length);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (flatCommands[selectedIndex]) {
          handleSelect(flatCommands[selectedIndex].id);
        }
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatCommands, selectedIndex, handleSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="command-overlay"
      onClick={onClose}
      style={{ zIndex: 100 }}
    >
      <div
        className="command-palette"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '520px', display: 'flex', flexDirection: 'column' }}
      >
        {/* Search Input */}
        <div className="command-input-row">
          <Search size={18} color="var(--muted-foreground)" />
          <input
            ref={inputRef}
            className="command-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type a command or search..."
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: '11px', padding: '2px 4px', borderRadius: '4px' }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Result count hint */}
        {search && (
          <div style={{ padding: '4px 16px', fontSize: '11px', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>
            {flatCommands.length} result{flatCommands.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Command List */}
        <div
          ref={listRef}
          className="command-list"
          style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}
        >
          {filteredGroups.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
              No commands match "{search}"
            </div>
          )}

          {filteredGroups.map(group => (
            <div key={group.label}>
              {/* Group label */}
              <div
                className="command-group-label"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span style={{ color: 'var(--muted-foreground)' }}>{group.icon}</span>
                {group.label}
              </div>

              {group.commands.map(cmd => {
                const globalIdx = flatCommands.findIndex(fc => fc.id === cmd.id);
                const isSelected = flatCommands[selectedIndex]?.id === cmd.id;
                return (
                  <div
                    key={cmd.id}
                    ref={isSelected ? selectedItemRef : undefined}
                    className={`command-item ${isSelected ? 'selected' : ''}`}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    onClick={() => handleSelect(cmd.id)}
                    style={{
                      background: isSelected ? 'var(--secondary)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    {cmd.icon && (
                      <span style={{ color: 'var(--muted-foreground)', flexShrink: 0, display: 'flex' }}>
                        {cmd.icon}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="command-item-label">{cmd.label}</div>
                      {cmd.description && (
                        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cmd.description}
                        </div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <div className="command-item-shortcut" style={{ flexShrink: 0 }}>
                        {cmd.shortcut.split('+').map((key, i, arr) => (
                          <span key={key}>
                            <kbd style={{ background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', fontFamily: 'var(--font-geist-mono)' }}>
                              {key}
                            </kbd>
                            {i < arr.length - 1 && <span style={{ margin: '0 2px', color: 'var(--muted-foreground)', fontSize: '10px' }}>+</span>}
                          </span>
                        ))}
                      </div>
                    )}
                    {isSelected && (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '10px', flexShrink: 0 }}>↵</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
          <span><kbd style={{ fontFamily: 'var(--font-geist-mono)', fontSize: '10px' }}>↑↓</kbd> Navigate</span>
          <span><kbd style={{ fontFamily: 'var(--font-geist-mono)', fontSize: '10px' }}>↵</kbd> Select</span>
          <span><kbd style={{ fontFamily: 'var(--font-geist-mono)', fontSize: '10px' }}>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
};
