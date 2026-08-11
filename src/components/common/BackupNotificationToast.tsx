import React from 'react';
import { HardDriveDownload, FileText, Download, X } from 'lucide-react';

interface BackupNotificationToastProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadMd: () => void;
  onDownloadDocx: () => void;
  editCount: number;
}

export const BackupNotificationToast: React.FC<BackupNotificationToastProps> = ({
  isOpen,
  onClose,
  onDownloadMd,
  onDownloadDocx,
  editCount,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '60px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: '#18181b',
        border: '1px solid #3f3f46',
        borderRadius: '10px',
        padding: '12px 16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        animation: 'slideUp 0.3s ease',
        maxWidth: '380px',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'rgba(96,165,250,0.15)',
          color: '#60a5fa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <HardDriveDownload size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f4f4f5' }}>
          Auto-Saved ({editCount} Edits)
        </div>
        <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '2px' }}>
          Session stored in browser memory. Download local backup?
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button
            onClick={() => { onDownloadDocx(); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600,
              padding: '4px 8px', borderRadius: '4px', border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer'
            }}
          >
            <Download size={12} /> Word .docx
          </button>
          <button
            onClick={() => { onDownloadMd(); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600,
              padding: '4px 8px', borderRadius: '4px', border: '1px solid #52525b', background: '#27272a', color: '#e4e4e7', cursor: 'pointer'
            }}
          >
            <FileText size={12} /> Markdown .md
          </button>
        </div>
      </div>

      <button
        onClick={onClose}
        style={{
          background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
};
