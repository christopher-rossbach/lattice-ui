import React, { useEffect } from 'react';
import { LayerPanel } from './components/LayerPanel';
import { CheckerPanel } from './components/CheckerPanel';
import { DualGraphView } from './components/DualGraphView';
import { useLatticeStore } from './state/useLatticeStore';
import './App.css';

const App: React.FC = () => {
  const fullscreenGraph = useLatticeStore((s) => s.fullscreenGraph);
  const setFullscreen = useLatticeStore((s) => s.setFullscreen);
  const isFullscreen = fullscreenGraph !== null;

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen, setFullscreen]);

  return (
    <div style={isFullscreen
      ? { position: 'fixed', inset: 0, zIndex: 9999, background: '#f8fafc', padding: 0 }
      : { margin: '0 auto', padding: '16px 8px 48px' }
    }>
      {!isFullscreen && (
        <header style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: 14 }}>L</span>
            <h1 style={{ margin: 0, fontSize: 20, letterSpacing: -0.5 }}>Lattice Builder</h1>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Drag nodes, click to connect, click edges to delete.</p>
          </div>
        </header>
      )}

      <div
        className={isFullscreen ? 'layout-fullscreen' : 'layout-with-sidebar'}
      >
        <div style={{ display: 'grid', gap: 12, height: isFullscreen ? '100%' : undefined }}>
          <DualGraphView />
          {!isFullscreen && <LayerPanel />}
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <CheckerPanel />
        </div>
      </div>
    </div>
  );
};

export default App;
