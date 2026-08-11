import { useState } from 'react';
import { RefreshCw, Download, Upload, CheckCircle2, Sparkles, Loader2, Check } from 'lucide-react';
import { UniversalConverterService } from '../../../services/converter';
import type { ConversionFormat, ManthanaDocumentAST } from '../../../types/ast';

interface ConverterPanelContentProps {
  onLoadAstToStudio: (ast: ManthanaDocumentAST) => void;
}

export const ConverterPanelContent = ({ onLoadAstToStudio }: ConverterPanelContentProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<ConversionFormat>('pdf');
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState<string>('');
  const [convertedAst, setConvertedAst] = useState<ManthanaDocumentAST | null>(null);

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
    }
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <RefreshCw size={18} color="var(--webx-beta)" />
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Universal Converter</h3>
      </div>

      <div
        style={{
          padding: '24px 16px',
          borderRadius: '8px',
          background: 'var(--secondary)',
          border: '1px dashed var(--border)',
          textAlign: 'center',
          cursor: 'pointer',
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
        <label htmlFor="converter-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <Upload size={24} color="var(--muted-foreground)" />
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--foreground)' }}>
            {selectedFile ? selectedFile.name : 'Select File'}
          </div>
        </label>
      </div>

      <div>
        <label className="section-label" style={{ marginBottom: '8px', display: 'block' }}>Target Format</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: isSelected ? 'rgba(96, 165, 250, 0.12)' : 'var(--secondary)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  color: isSelected ? 'var(--accent)' : 'var(--foreground)',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{fmt.label}</span>
                {isSelected && <Check size={14} color="var(--accent)" />}
              </button>
            );
          })}
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleConvert}
        disabled={!selectedFile || isConverting}
        style={{
          width: '100%',
          justifyContent: 'center',
          padding: '10px',
          fontSize: '0.82rem',
          fontWeight: 700,
          opacity: !selectedFile || isConverting ? 0.5 : 1,
          cursor: !selectedFile || isConverting ? 'not-allowed' : 'pointer',
        }}
      >
        {isConverting ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
        <span>{isConverting ? 'Converting...' : 'Convert File'}</span>
      </button>

      {resultUrl && (
        <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
            <CheckCircle2 size={14} /> Ready: {resultFileName}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <a
              href={resultUrl}
              download={resultFileName}
              className="btn"
              style={{ background: '#10b981', color: '#fff', border: 'none', justifyContent: 'center' }}
            >
              <Download size={14} /> Download
            </a>
            {convertedAst && (
              <button className="btn" onClick={handleOpenInStudio} style={{ justifyContent: 'center' }}>
                <Sparkles size={14} /> Open in Editor
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
