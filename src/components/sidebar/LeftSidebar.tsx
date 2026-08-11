import { useState, useEffect } from 'react';
import { Bot, Map, RefreshCw, History, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import type { ManthanaDocumentAST } from '../../types/ast';
import { AIPanelContent } from './panels/AIPanelContent';
import { ConverterPanelContent } from './panels/ConverterPanelContent';
import { NavigatorPanelContent } from './panels/NavigatorPanelContent';
import { HistoryPanelContent } from './panels/HistoryPanelContent';
import { ReferenceManagerPanel } from './panels/ReferenceManagerPanel';

interface LeftSidebarProps {
  ast: ManthanaDocumentAST;
  currentPage: number;
  onGenerate: (template: string, prompt: string) => void;
  isStreaming: boolean;
  streamingProgress: string;
  onFileUpload: (file: File) => void;
  ocrResult: string;
  isOcrProcessing: boolean;
  onLoadAstToStudio: (ast: ManthanaDocumentAST) => void;
  onJumpToPage: (page: number) => void;
  historyEntries: Array<{id: string; label: string; time: number}>;
  currentHistoryIndex: number;
  onRestoreHistory: (idx: number) => void;
}

export const LeftSidebar = ({
  ast,
  currentPage,
  onGenerate,
  isStreaming,
  streamingProgress,
  onFileUpload,
  ocrResult,
  isOcrProcessing,
  onLoadAstToStudio,
  onJumpToPage,
  historyEntries,
  currentHistoryIndex,
  onRestoreHistory
}: LeftSidebarProps) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'navigator' | 'converter' | 'history' | 'references'>('ai');
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('q108_sidebar_expanded');
    return saved ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('q108_sidebar_expanded', JSON.stringify(isExpanded));
  }, [isExpanded]);

  return (
    <div style={{ display: 'flex', height: '100%', borderRight: '1px solid var(--border)', background: 'var(--card)', zIndex: 10 }}>
      {/* Icon Rail */}
      <div style={{ width: '56px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', borderRight: isExpanded ? '1px solid var(--border)' : 'none', background: 'var(--card)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          <button className={`nav-icon-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => { if (activeTab === 'ai') { setIsExpanded((e: boolean) => !e); } else { setActiveTab('ai'); setIsExpanded(true); } }} title="AI Generation">
            <Bot size={20} />
          </button>
          <button className={`nav-icon-btn ${activeTab === 'navigator' ? 'active' : ''}`} onClick={() => { if (activeTab === 'navigator') { setIsExpanded((e: boolean) => !e); } else { setActiveTab('navigator'); setIsExpanded(true); } }} title="Document Navigator">
            <Map size={20} />
          </button>
          <button className={`nav-icon-btn ${activeTab === 'converter' ? 'active' : ''}`} onClick={() => { if (activeTab === 'converter') { setIsExpanded((e: boolean) => !e); } else { setActiveTab('converter'); setIsExpanded(true); } }} title="Universal Converter">
            <RefreshCw size={20} />
          </button>
          <button className={`nav-icon-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => { if (activeTab === 'history') { setIsExpanded((e: boolean) => !e); } else { setActiveTab('history'); setIsExpanded(true); } }} title="Version History">
            <History size={20} />
          </button>
          <button className={`nav-icon-btn ${activeTab === 'references' ? 'active' : ''}`} onClick={() => { if (activeTab === 'references') { setIsExpanded((e: boolean) => !e); } else { setActiveTab('references'); setIsExpanded(true); } }} title="Reference Manager (RAG)">
            <BookOpen size={20} />
          </button>
        </div>
        <button className="nav-icon-btn" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      {/* Expandable Panel */}
      <div
        style={{
          width: isExpanded ? '280px' : '0px',
          overflow: 'hidden',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--background)'
        }}
      >
        <div style={{ width: '280px', height: '100%', flexShrink: 0 }}>
          {activeTab === 'ai' && (
            <AIPanelContent
              onGenerate={onGenerate}
              isStreaming={isStreaming}
              streamingProgress={streamingProgress}
              onFileUpload={onFileUpload}
              ocrResult={ocrResult}
              isOcrProcessing={isOcrProcessing}
            />
          )}
          {activeTab === 'navigator' && (
            <NavigatorPanelContent
              ast={ast}
              currentPage={currentPage}
              onJumpToPage={onJumpToPage}
            />
          )}
          {activeTab === 'converter' && (
            <ConverterPanelContent
              onLoadAstToStudio={onLoadAstToStudio}
            />
          )}
          {activeTab === 'history' && (
            <HistoryPanelContent
              entries={historyEntries}
              currentIndex={currentHistoryIndex}
              onRestore={onRestoreHistory}
            />
          )}
          {activeTab === 'references' && (
            <ReferenceManagerPanel
              ast={ast}
              onUpdateAST={onLoadAstToStudio}
            />
          )}
        </div>
      </div>
    </div>
  );
};
