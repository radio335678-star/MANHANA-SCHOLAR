import { FileText, Stethoscope, Building, Send, FileUp, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface AIPanelContentProps {
  onGenerate: (template: string, prompt: string) => void;
  isStreaming: boolean;
  streamingProgress: string;
  onFileUpload: (file: File) => void;
  ocrResult: string;
  isOcrProcessing: boolean;
}

export const AIPanelContent = ({
  onGenerate,
  isStreaming,
  streamingProgress,
  onFileUpload,
  ocrResult,
  isOcrProcessing,
}: AIPanelContentProps) => {
  const [activeTemplate, setActiveTemplate] = useState('Blank Document');
  const [prompt, setPrompt] = useState('');

  const templates = [
    { id: 'Blank Document', icon: <FileText size={16} /> },
    { id: 'Research Draft Outline', icon: <Stethoscope size={16} /> },
    { id: 'Executive Memorandum', icon: <Building size={16} /> },
  ];

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto' }}>
      <div>
        <label className="section-label">Templates</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          {templates.map(t => (
            <div
              key={t.id}
              className={`template-card ${activeTemplate === t.id ? 'selected' : ''}`}
              onClick={() => setActiveTemplate(t.id)}
            >
              {t.icon}
              <span>{t.id}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="section-label">Prompt</label>
        <textarea
          className="textarea-field"
          placeholder="Describe your document..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ minHeight: '100px', marginTop: '8px', resize: 'vertical' }}
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={() => onGenerate(activeTemplate, prompt)}
        disabled={isStreaming}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {isStreaming ? (
          <>
            <Loader2 size={16} className="spin" />
            <span>Generating... {streamingProgress}</span>
          </>
        ) : (
          <>
            <Send size={16} />
            <span>Generate Document</span>
          </>
        )}
      </button>

      <div>
        <label className="section-label">Extract Text from File</label>
        <div
          className="template-card"
          style={{ marginTop: '8px', borderStyle: 'dashed', justifyContent: 'center', padding: '24px 16px', flexDirection: 'column' }}
          onClick={() => document.getElementById('ocr-upload')?.click()}
        >
          <input
            id="ocr-upload"
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) onFileUpload(e.target.files[0]);
            }}
          />
          {isOcrProcessing ? (
            <Loader2 size={24} className="spin" />
          ) : (
            <FileUp size={24} className="text-muted" />
          )}
          <div style={{ textAlign: 'center', marginTop: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500 }}>Upload Image or PDF</div>
          </div>
        </div>
        {ocrResult && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted-foreground)', background: 'var(--secondary)', padding: '8px', borderRadius: '4px', maxHeight: '100px', overflowY: 'auto' }}>
            {ocrResult}
          </div>
        )}
      </div>
    </div>
  );
};
