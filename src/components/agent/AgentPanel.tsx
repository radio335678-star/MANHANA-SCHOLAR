import { useState } from 'react';
import {
  X, Send, Sparkles, Zap, FileText, Layers, Globe, Grid,
  Bookmark, Minimize2, Maximize2, Loader2, AlertTriangle,
  CheckCircle2, Download, ImagePlus, Terminal,
} from 'lucide-react';
import type { SandboxExecutionResult } from '../../services/e2bSandboxService';

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onPrompt: (prompt: string) => void;
  onQuickAction: (action: string, customPrompt?: string) => void;
  // E2B execution state
  isExecuting: boolean;
  sandboxOutput: SandboxExecutionResult | null;
  onClearOutput: () => void;
  onInsertResult: (pngBase64?: string, text?: string) => void;
}

export const AgentPanel = ({
  isOpen,
  onClose,
  onPrompt,
  onQuickAction,
  isExecuting,
  sandboxOutput,
  onClearOutput,
  onInsertResult,
}: AgentPanelProps) => {
  const [input, setInput] = useState('');

  if (!isOpen) return null;

  const quickActions = [
    { label: 'Summarize', icon: FileText, action: 'Summarize Document', isSandbox: false },
    { label: 'Improve Writing', icon: Zap, action: 'Rewrite in Professional Tone', isSandbox: false },
    { label: 'Add Conclusion', icon: Bookmark, action: 'Generate Conclusion Section', isSandbox: false },
    { label: 'Grammar Check', icon: FileText, action: 'Check Grammar & Spelling', isSandbox: false },
    { label: 'Generate ToC', icon: Layers, action: 'Generate Table of Contents', isSandbox: false },
    { label: 'Translate to Hindi', icon: Globe, action: 'Translate to Devanagari/Hindi', isSandbox: false },
    { label: 'Key Metrics', icon: Grid, action: 'Extract Key Points Grid', isSandbox: false },
    { label: 'Add Citations', icon: Bookmark, action: 'Generate APA Citations', isSandbox: false },
    { label: 'Expand Section', icon: Maximize2, action: 'Elaborate Section Paragraphs', isSandbox: false },
    { label: 'Shorten', icon: Minimize2, action: 'Condense Content', isSandbox: false },
    // E2B sandbox actions
    { label: 'Run Analytics', icon: Terminal, action: 'Execute Data Analytics', isSandbox: true },
    { label: 'Compile Typst', icon: Download, action: 'Compile Typst Paper', isSandbox: true },
  ];

  const hasSandboxOutput = sandboxOutput !== null;
  const hasError = hasSandboxOutput && (sandboxOutput.error || sandboxOutput.stderr);
  const hasStdout = hasSandboxOutput && sandboxOutput.stdout && sandboxOutput.stdout.trim();
  const hasImages = hasSandboxOutput && sandboxOutput.pngImagesBase64.length > 0;

  return (
    <div className="agent-panel" style={{ bottom: '96px', right: '280px', zIndex: 50, maxHeight: '80vh', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
          <Sparkles size={16} color="var(--accent)" /> Ask Agent
          <span style={{
            fontSize: '0.65rem',
            background: isExecuting ? '#1e3a5f' : '#064e3b',
            color: isExecuting ? '#60a5fa' : '#34d399',
            padding: '2px 8px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 500,
            transition: 'all 0.3s ease',
          }}>
            {isExecuting
              ? <><Loader2 size={8} style={{ animation: 'spin 1s linear infinite' }} /> Running in E2B…</>
              : <><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> E2B Sandbox Ready (&lt; 150ms)</>
            }
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Input Area */}
      <textarea
        className="textarea-field"
        placeholder="Ask anything or describe a Python script to run…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isExecuting}
        style={{ minHeight: '80px', marginBottom: '12px', resize: 'none', opacity: isExecuting ? 0.6 : 1 }}
      />

      <button
        className="btn btn-primary"
        disabled={isExecuting || !input.trim()}
        onClick={() => {
          if (input.trim()) {
            onPrompt(input);
            setInput('');
          }
        }}
        style={{ width: '100%', justifyContent: 'center', marginBottom: '16px', opacity: isExecuting ? 0.6 : 1 }}
      >
        {isExecuting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
        {isExecuting ? 'Executing in Sandbox…' : 'Send to Agent'}
      </button>

      {/* === E2B Execution Spinner (full-panel overlay while running) === */}
      {isExecuting && (
        <div style={{
          background: 'var(--secondary)',
          borderRadius: '10px',
          padding: '20px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          border: '1px solid var(--border)',
        }}>
          <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
            Running in E2B MicroVM Sandbox…
            <br />
            <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>Python · Typst · Pandoc · PyMuPDF</span>
          </div>
        </div>
      )}

      {/* === E2B Output Panel === */}
      {hasSandboxOutput && !isExecuting && (
        <div style={{
          background: 'var(--secondary)',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          marginBottom: '16px',
          overflow: 'hidden',
        }}>
          {/* Output Panel Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
              {hasError
                ? <AlertTriangle size={13} color="#f87171" />
                : <CheckCircle2 size={13} color="#34d399" />}
              {hasError ? 'Sandbox Error' : 'Sandbox Output'}
            </div>
            <button
              onClick={onClearOutput}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '0.7rem' }}
            >
              Clear ×
            </button>
          </div>

          {/* Error / Stderr */}
          {hasError && (
            <div style={{
              margin: '10px 14px',
              padding: '10px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '6px',
              fontSize: '0.72rem',
              color: '#f87171',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {sandboxOutput.error || sandboxOutput.stderr}
            </div>
          )}

          {/* Stdout */}
          {hasStdout && (
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Standard Output
              </div>
              <pre style={{
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                background: 'var(--background)',
                borderRadius: '6px',
                padding: '10px',
                margin: 0,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--foreground)',
                maxHeight: '160px',
                overflowY: 'auto',
                border: '1px solid var(--border)',
              }}>
                {sandboxOutput.stdout}
              </pre>
              <button
                className="btn btn-ghost"
                onClick={() => onInsertResult(undefined, sandboxOutput.stdout)}
                style={{ marginTop: '8px', fontSize: '0.72rem', padding: '5px 10px', gap: '5px', display: 'flex', alignItems: 'center' }}
              >
                <ImagePlus size={11} /> Insert Text into Document
              </button>
            </div>
          )}

          {/* PNG Chart Images */}
          {hasImages && (
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Generated Charts ({sandboxOutput.pngImagesBase64.length})
              </div>
              {sandboxOutput.pngImagesBase64.map((png, idx) => (
                <div key={idx} style={{ marginBottom: '12px' }}>
                  <img
                    src={`data:image/png;base64,${png}`}
                    alt={`E2B Chart ${idx + 1}`}
                    style={{
                      width: '100%',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      display: 'block',
                    }}
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() => onInsertResult(png, undefined)}
                    style={{ marginTop: '6px', fontSize: '0.72rem', padding: '5px 10px', gap: '5px', display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center' }}
                  >
                    <ImagePlus size={11} /> Insert Chart into Document
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions Grid */}
      {!isExecuting && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '8px', textTransform: 'uppercase' }}>
            Quick Actions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {quickActions.map(({ label, icon: Icon, action, isSandbox }) => (
              <button
                key={label}
                className="btn btn-ghost"
                style={{
                  fontSize: '11px',
                  padding: '6px',
                  justifyContent: 'flex-start',
                  gap: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  border: isSandbox ? '1px solid rgba(96,165,250,0.25)' : undefined,
                  background: isSandbox ? 'rgba(96,165,250,0.06)' : undefined,
                }}
                onClick={() => onQuickAction(action)}
                title={isSandbox ? `${action} (E2B Sandbox)` : action}
              >
                <Icon size={12} color={isSandbox ? 'var(--accent)' : undefined} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {isSandbox && <span style={{ fontSize: '0.6rem', color: 'var(--accent)', marginLeft: 'auto' }}>E2B</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
