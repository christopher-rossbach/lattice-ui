import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { GraphView } from './GraphView';
import { useLatticeStore } from '../state/useLatticeStore';

export const DualGraphView: React.FC = () => {
  const foc = useLatticeStore((s) => s.foc);
  const fullscreenGraph = useLatticeStore((s) => s.fullscreenGraph);
  const isFullscreen = fullscreenGraph !== null;

  const graphContainerStyle = (graphId: 'pri' | 'sec'): React.CSSProperties => {
    const isFocused = foc === graphId;
    const isHidden = isFullscreen && fullscreenGraph !== graphId;

    if (isHidden) return { display: 'none' };

    return {
      flex: 1,
      borderRadius: isFullscreen ? 0 : 16,
      overflow: 'hidden',
      border: isFullscreen ? 'none' : isFocused ? '3px solid #0ea5e9' : '1px solid #e2e8f0',
      background: '#fff',
    };
  };

  return (
    <div style={{ display: 'flex', height: '100%', gap: isFullscreen ? 0 : 8 }}>
      {/* Primary Graph */}
      <div style={graphContainerStyle('pri')}>
        <ReactFlowProvider>
          <GraphView graphId="pri" />
        </ReactFlowProvider>
      </div>

      {/* Secondary Graph */}
      <div style={graphContainerStyle('sec')}>
        <ReactFlowProvider>
          <GraphView graphId="sec" />
        </ReactFlowProvider>
      </div>
    </div>
  );
};
