import { History, Clock, ArrowLeftCircle } from 'lucide-react';

interface HistoryPanelContentProps {
  entries: Array<{ id: string; label: string; time: number }>;
  currentIndex: number;
  onRestore: (idx: number) => void;
}

export const HistoryPanelContent = ({ entries, currentIndex, onRestore }: HistoryPanelContentProps) => {
  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, paddingBottom: '8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <History size={16} /> Version History
      </h3>

      {entries.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', marginTop: '20px' }}>
          No history yet. Start editing to create snapshots.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
          {/* Vertical line connecting timeline */}
          <div style={{ position: 'absolute', left: '11px', top: '10px', bottom: '10px', width: '2px', background: 'var(--border)', zIndex: 0 }} />
          
          {entries.map((entry, idx) => {
            const isCurrent = idx === currentIndex;
            const date = new Date(entry.time);
            const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

            return (
              <div 
                key={entry.id} 
                style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  position: 'relative', 
                  zIndex: 1,
                  opacity: idx > currentIndex ? 0.5 : 1 // Future states slightly faded
                }}
              >
                {/* Timeline dot */}
                <div 
                  style={{ 
                    width: '24px', 
                    height: '24px', 
                    borderRadius: '50%', 
                    background: isCurrent ? 'var(--webx-beta)' : 'var(--card)', 
                    border: `2px solid ${isCurrent ? 'var(--webx-beta)' : 'var(--border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {isCurrent && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />}
                </div>

                {/* Entry content */}
                <div 
                  className={`template-card ${isCurrent ? 'selected' : ''}`}
                  style={{ flex: 1, flexDirection: 'column', gap: '4px', alignItems: 'flex-start', padding: '10px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{entry.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={10} /> {timeStr}
                    </span>
                  </div>
                  
                  {!isCurrent && (
                    <button 
                      onClick={() => onRestore(idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--webx-beta)',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 0',
                        cursor: 'pointer',
                        marginTop: '4px'
                      }}
                    >
                      <ArrowLeftCircle size={12} /> Restore this version
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
