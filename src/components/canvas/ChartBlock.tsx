import React, { useState } from 'react';
import { BarChart2, PieChart as PieIcon, TrendingUp, Edit2, Check } from 'lucide-react';
import type { ASTNode } from '../../types/ast';

interface ChartBlockProps {
  node: ASTNode;
  primaryColor: string;
  paperTheme: 'dark' | 'light';
  onUpdateContent: (nodeId: string, content: string, chartType?: 'bar' | 'line' | 'pie', chartData?: any) => void;
}

export const ChartBlock: React.FC<ChartBlockProps> = ({
  node,
  primaryColor,
  paperTheme,
  onUpdateContent,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>(node.chartType === 'doughnut' ? 'pie' : (node.chartType || 'bar'));
  const [dataJson, setDataJson] = useState(
    JSON.stringify(
      node.chartData || {
        labels: ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'],
        datasets: [{ label: 'Revenue ($M)', data: [12, 19, 28, 45] }],
      },
      null,
      2
    )
  );

  const handleSave = () => {
    try {
      const parsed = JSON.parse(dataJson);
      setIsEditing(false);
      onUpdateContent(node.id, node.content || 'Interactive Data Chart', chartType, parsed);
    } catch (err) {
      alert('Invalid JSON chart data format');
    }
  };

  const chartData = node.chartData || {
    labels: ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'],
    datasets: [{ label: 'Revenue ($M)', data: [12, 19, 28, 45] }],
  };

  const maxVal = Math.max(...(chartData.datasets[0]?.data || [100]), 1);

  return (
    <div
      style={{
        margin: '16px 0',
        padding: '16px',
        borderRadius: '8px',
        border: `1px solid ${paperTheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
        background: paperTheme === 'dark' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(245, 247, 250, 0.6)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {chartType === 'bar' && <BarChart2 size={15} />}
          {chartType === 'line' && <TrendingUp size={15} />}
          {chartType === 'pie' && <PieIcon size={15} />}
          <span>{chartData.datasets[0]?.label || 'Data Chart'} ({chartType})</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['bar', 'line', 'pie'] as const).map(type => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              style={{
                fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid #444',
                background: chartType === type ? primaryColor : 'transparent',
                color: chartType === type ? '#000' : 'inherit', cursor: 'pointer', textTransform: 'capitalize'
              }}
            >
              {type}
            </button>
          ))}
          <button
            onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem',
              padding: '3px 8px', borderRadius: '4px', border: '1px solid #444',
              background: isEditing ? primaryColor : 'transparent',
              color: isEditing ? '#000' : 'inherit', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {isEditing ? <><Check size={12} /> Save</> : <><Edit2 size={12} /> Data</>}
          </button>
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={dataJson}
          onChange={(e) => setDataJson(e.target.value)}
          rows={6}
          style={{
            width: '100%', fontFamily: 'monospace', fontSize: '0.8rem', padding: '8px',
            borderRadius: '4px', border: '1px solid #555', background: '#111', color: '#60a5fa', outline: 'none',
          }}
        />
      ) : (
        <div style={{ padding: '12px 0' }}>
          {chartType === 'bar' && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '140px', padding: '10px 20px', borderBottom: '1px solid #444' }}>
              {chartData.labels.map((lbl, idx) => {
                const val = chartData.datasets[0]?.data[idx] || 0;
                const heightPct = Math.round((val / maxVal) * 100);
                return (
                  <div key={lbl} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '4px', color: primaryColor }}>{val}</div>
                    <div
                      style={{
                        width: '100%', height: `${heightPct}%`, borderRadius: '4px 4px 0 0',
                        background: primaryColor, opacity: 0.85, transition: 'height 0.3s ease',
                      }}
                    />
                    <div style={{ fontSize: '0.7rem', marginTop: '6px', opacity: 0.8, textAlign: 'center', whiteSpace: 'nowrap' }}>{lbl}</div>
                  </div>
                );
              })}
            </div>
          )}

          {chartType === 'line' && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px', padding: '10px', position: 'relative' }}>
              <svg width="100%" height="100%" viewBox="0 0 400 120" style={{ overflow: 'visible' }}>
                <polyline
                  fill="none"
                  stroke={primaryColor}
                  strokeWidth="3"
                  points={chartData.labels.map((_, idx) => {
                    const val = chartData.datasets[0]?.data[idx] || 0;
                    const x = (idx / (chartData.labels.length - 1)) * 360 + 20;
                    const y = 100 - (val / maxVal) * 80;
                    return `${x},${y}`;
                  }).join(' ')}
                />
                {chartData.labels.map((lbl, idx) => {
                  const val = chartData.datasets[0]?.data[idx] || 0;
                  const x = (idx / (chartData.labels.length - 1)) * 360 + 20;
                  const y = 100 - (val / maxVal) * 80;
                  return (
                    <g key={lbl}>
                      <circle cx={x} cy={y} r="5" fill={primaryColor} />
                      <text x={x} y={y - 10} fill={primaryColor} fontSize="10" textAnchor="middle">{val}</text>
                      <text x={x} y="118" fill="currentColor" fontSize="9" opacity="0.8" textAnchor="middle">{lbl}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {chartType === 'pie' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '12px' }}>
              <div style={{ width: 90, height: 90, borderRadius: '50%', background: `conic-gradient(${primaryColor} 0% 45%, #93c5fd 45% 75%, #34d399 75% 100%)` }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}>
                {chartData.labels.map((lbl, idx) => (
                  <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '2px', background: idx === 0 ? primaryColor : idx === 1 ? '#93c5fd' : '#34d399' }} />
                    <span>{lbl}: <b>{chartData.datasets[0]?.data[idx] || 0}</b></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
