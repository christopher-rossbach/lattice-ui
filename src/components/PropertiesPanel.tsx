import React, { useMemo } from 'react';
import { useLatticeStore } from '../state/useLatticeStore';
import { getLayers, maxRank } from '../model/lattice';

export const PropertiesPanel: React.FC = () => {
  const foc = useLatticeStore((s) => s.foc);
  const graph = useLatticeStore((s) => foc === 'pri' ? s.primary : s.secondary);
  const { elements, relations } = graph;
  const layers = useMemo(() => getLayers({ elements }), [elements]);
  const layerCount = Object.keys(layers).length;
  const top = maxRank({ elements });

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Properties</div>
      <div style={{ display: 'grid', gap: 6, color: '#0f172a', fontSize: 14 }}>
        <div>📊 Elements: {Object.keys(elements).length}</div>
        <div>🔗 Relations: {relations.length}</div>
        <div>🧭 Layers: {layerCount}</div>
        <div>⬆️ Top rank: {top}</div>
      </div>
      <div style={{ marginTop: 12, color: '#475569', fontSize: 13 }}>
        {Object.keys(layers)
          .map((r) => Number(r))
          .sort((a, b) => a - b)
          .map((rank) => (
            <div key={rank}>Rank {rank}: {layers[rank].join(', ')}</div>
          ))}
      </div>
    </div>
  );
};
