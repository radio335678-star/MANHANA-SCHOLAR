import React, { useState } from 'react';
import { RefreshCw, Download, Upload, CheckCircle2, ArrowRight, X, Sparkles } from 'lucide-react';
import { UniversalConverterService } from '../../services/converter';
import type { ConversionFormat, ManthanaDocumentAST } from '../../types/ast';

interface ConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadAstToStudio: (ast: ManthanaDocumentAST) => void;
}

export const ConverterModal: React.FC<ConverterModalProps> = ({
  isOpen,
  onClose,
  onLoadAstToStudio,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<ConversionFormat>('pdf');
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState<string>('');
  const [convertedAst, setConvertedAst] = useState<ManthanaDocumentAST | null>(null);

  if (!isOpen) return null;

  const handleConvert = async () => {
    if (!selectedFile) return;
    setIsConverting(true);
    try {
      const res = await UniversalConverterService.convertFile(selectedFile, targetFormat);
      setResultUrl(res.url);
      setResultFileName(res.fileName);
      if (res.ast) setConvertedAst(res.ast);
    } catch (err) {
      console.error('Conversion failed:', err);
    } finally {
      setIsConverting(false);
    }
  };

  const handleOpenInStudio = () => {
    if (convertedAst) {
      onLoadAstToStudio(convertedAst);
      onClose();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-panel" style={{ width: '520px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--card)', padding: '24px', position: 'relative' }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <RefreshCw size={22} color="var(--webx-beta)" />
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--foreground)' }}>
              Universal Document Converter
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              Client-Side File Converter (PDF ↔ DOCX ↔ MD)
            </p>
          </div>
        </div>

        {/* Upload Box */}
        <div
          style={{
            padding: '20px',
            borderRadius: '12px',
            background: 'var(--secondary)',
            border: '2px dashed var(--border)',
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: '16px',
          }}
        >
          <input
            type="file"
            accept=".pdf,.docx,.md,.txt"
            id="converter-file-input"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                setSelectedFile(e.target.files[0]);
                setResultUrl(null);
              }
            }}
          />
          <label htmlFor="converter-file-input" style={{ cursor: 'pointer' }}>
            <Upload size={28} color="var(--webx-beta)" style={{ marginBottom: '8px' }} />
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>
              {selectedFile ? selectedFile.name : 'Select or Drop PDF, DOCX, or Markdown File'}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
              {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : 'Zero Server Upload • Local Device Execution'}
            </p>
          </label>
        </div>

        {/* Target Format Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'block', marginBottom: '8px' }}>
            Select Target Output Format
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { id: 'pdf', label: 'PDF Document' },
              { id: 'docx', label: 'Word DOCX' },
              { id: 'md', label: 'Markdown' },
              { id: 'html', label: 'HTML Web' },
            ].map((fmt) => {
              const isSelected = targetFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  onClick={() => setTargetFormat(fmt.id as ConversionFormat)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(96, 165, 250, 0.15)' : 'var(--secondary)',
                    border: `1px solid ${isSelected ? 'var(--webx-beta)' : 'var(--border)'}`,
                    color: isSelected ? 'var(--webx-beta)' : 'var(--foreground)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  {fmt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleConvert}
            disabled={!selectedFile || isConverting}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '10px',
              background: !selectedFile || isConverting ? 'var(--secondary)' : 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: !selectedFile || isConverting ? 'not-allowed' : 'pointer',
            }}
          >
            {isConverting ? <RefreshCw size={16} className="streaming-indicator" /> : <ArrowRight size={16} />}
            <span>{isConverting ? 'Converting Document...' : 'Convert Document Now'}</span>
          </button>
        </div>

        {/* Conversion Result Download & Open in Studio */}
        {resultUrl && (
          <div style={{ marginTop: '16px', padding: '14px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> Conversion Successful: {resultFileName}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <a
                href={resultUrl}
                download={resultFileName}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  background: '#10b981',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Download size={14} />
                <span>Download Converted File</span>
              </a>

              {convertedAst && (
                <button
                  onClick={handleOpenInStudio}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Sparkles size={14} color="var(--webx-beta)" />
                  <span>Open in Editor</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
