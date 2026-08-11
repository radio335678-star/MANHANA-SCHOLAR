import React from 'react';
import { Check, X, GitCompare } from 'lucide-react';

interface TrackChangesDiffProps {
  originalContent: string;
  newContent: string;
  onAccept: () => void;
  onReject: () => void;
  primaryColor: string;
}

export const TrackChangesDiff: React.FC<TrackChangesDiffProps> = ({
  originalContent,
  newContent,
  onAccept,
  onReject,
  primaryColor,
}) => {
  return (
    <div
      style={{
        margin: '12px 0',
        padding: '12px 14px',
        borderRadius: '8px',
        border: `1px solid ${primaryColor}`,
        background: 'rgba(96,165,250,0.06)',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <GitCompare size={14} />
          <span>AI Proposed Revision (Track Changes)</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={onAccept}
            title="Accept Revision (Keep new AI text)"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600,
              padding: '3px 10px', borderRadius: '4px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer'
            }}
          >
            <Check size={12} /> Accept
          </button>
          <button
            onClick={onReject}
            title="Reject Revision (Restore original text)"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600,
              padding: '3px 10px', borderRadius: '4px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer'
            }}
          >
            <X size={12} /> Reject
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.85rem', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Red Strikethrough Original Text */}
        <div style={{ color: '#ef4444', textDecoration: 'line-through', opacity: 0.75, background: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
          - {originalContent}
        </div>
        {/* Green Additions New Text */}
        <div style={{ color: '#10b981', fontWeight: 500, background: 'rgba(16,185,129,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
          + {newContent}
        </div>
      </div>
    </div>
  );
};
