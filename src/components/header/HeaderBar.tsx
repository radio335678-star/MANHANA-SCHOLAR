import { Moon, Sun, Monitor, Command, Maximize2, Minimize2 } from 'lucide-react';

interface HeaderBarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  webGpuActive: boolean;
  renderingTimeMs: number;
  onOpenCommandPalette: () => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
}

export const HeaderBar = ({
  theme,
  onToggleTheme,
  webGpuActive,
  renderingTimeMs,
  onOpenCommandPalette,
  isFocusMode,
  onToggleFocusMode,
}: HeaderBarProps) => {
  return (
    <header className="header" style={{ height: 'var(--header-height)' }}>
      <div className="header-left">
        <div className="logo">
          Q108 Scholar <span className="logo-badge">STUDY ENGINE</span>
        </div>
      </div>

      <div className="header-center">
      </div>

      <div className="header-right">
        <button className="icon-btn" onClick={onToggleFocusMode} title="Toggle Focus Mode (F11)">
          {isFocusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        <button className="btn" onClick={onOpenCommandPalette} style={{ padding: '6px 12px' }}>
          <Command size={14} /> 
          <span style={{ fontSize: '12px', fontWeight: 600 }}>⌘K</span>
        </button>

        <div className="badge badge-accent">
          {renderingTimeMs}ms Engine
        </div>

        <div className={`badge ${webGpuActive ? 'badge-success' : ''}`}>
          <Monitor size={12} style={{ marginRight: '4px' }} />
          {webGpuActive ? 'WebGPU On' : 'CPU Mode'}
        </div>

        <button className="icon-btn" onClick={onToggleTheme} title="Toggle Dark/Light Mode">
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  );
};
