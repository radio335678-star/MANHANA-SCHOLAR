import React, { useState } from 'react';
import { Sparkles, Upload, Bot, Play, CheckCircle2, RefreshCw, Cpu, Layers } from 'lucide-react';
import { TEMPLATE_PRESETS } from '../../services/aiStreamer';
import type { PromptTemplate } from '../../services/aiStreamer';
import type { OCRResult } from '../../services/webgpuAI';

interface AssistantCapsuleProps {
  onGenerate: (prompt: string, templateId?: string) => void;
  isStreaming: boolean;
  streamingProgress: number;
  onFileUpload: (file: File) => void;
  ocrResult: OCRResult | null;
  isOcrProcessing: boolean;
}

export const AssistantCapsule: React.FC<AssistantCapsuleProps> = ({
  onGenerate,
  isStreaming,
  streamingProgress,
  onFileUpload,
  ocrResult,
  isOcrProcessing,
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate>(TEMPLATE_PRESETS[0]);
  const [dragActive, setDragActive] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) {
      onGenerate(selectedTemplate.prompt, selectedTemplate.id);
    } else {
      onGenerate(promptInput, selectedTemplate.id);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div 
      className="glass-panel" 
      style={{ 
        width: '320px', 
        minWidth: '320px', 
        height: '100%', 
        borderRight: '1px solid var(--border)', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Panel Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Bot size={18} color="var(--webx-beta)" />
        <div>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
            AI Assistant & Generator
          </h2>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '1px' }}>
            Prompt-Driven Document Creator
          </p>
        </div>
      </div>

      <div style={{ flex: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Template Gallery */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <Layers size={13} color="var(--webx-beta)" />
            Document Templates
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {TEMPLATE_PRESETS.map((tpl) => {
              const isSelected = selectedTemplate.id === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplate(tpl);
                    setPromptInput(tpl.prompt);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(96, 165, 250, 0.08)' : 'var(--card)',
                    border: `1px solid ${isSelected ? 'var(--webx-beta)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isSelected ? 'var(--webx-beta)' : 'var(--foreground)' }}>
                      {tpl.name}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '2px', lineHeight: 1.3 }}>
                    {tpl.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Prompt Input Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={13} color="var(--webx-beta)" />
            Prompt Document Generator
          </label>

          <textarea
            rows={3}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="e.g. Write an executive research document on Ayurveda Agni..."
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-geist)',
              fontSize: '0.8rem',
              resize: 'none',
              outline: 'none',
            }}
          />

          <button
            type="submit"
            disabled={isStreaming}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: isStreaming ? 'var(--secondary)' : 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: isStreaming ? 'not-allowed' : 'pointer',
              boxShadow: isStreaming ? 'none' : 'var(--webx-glow)',
            }}
          >
            {isStreaming ? (
              <>
                <RefreshCw size={14} className="streaming-indicator" />
                <span>Generating ({Math.round(streamingProgress)}%)...</span>
              </>
            ) : (
              <>
                <Play size={14} fill="currentColor" />
                <span>Generate Document</span>
              </>
            )}
          </button>
        </form>

        {/* Local WebGPU OCR File Dropzone */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <Cpu size={13} color="#10b981" />
            Local Device OCR Text Extractor
          </label>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleFileDrop}
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: dragActive ? 'rgba(16, 185, 129, 0.1)' : 'var(--card)',
              border: `2px dashed ${dragActive ? '#10b981' : 'var(--border)'}`,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.docx,.txt"
              id="file-upload-input-2"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onFileUpload(e.target.files[0]);
                }
              }}
            />
            <label htmlFor="file-upload-input-2" style={{ cursor: 'pointer' }}>
              <Upload size={20} color={isOcrProcessing ? '#10b981' : 'var(--muted-foreground)'} style={{ marginBottom: '4px' }} />
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)' }}>
                {isOcrProcessing ? 'Extracting Text locally...' : 'Drop PDF / Image to OCR'}
              </p>
            </label>
          </div>

          {ocrResult && (
            <div style={{ marginTop: '8px', padding: '10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={12} /> Local OCR Completed
                </span>
              </div>
              <pre style={{ fontSize: '0.65rem', fontFamily: 'var(--font-geist-mono)', color: 'var(--foreground)', whiteSpace: 'pre-wrap', maxHeight: '80px', overflowY: 'auto' }}>
                {ocrResult.extractedText}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
