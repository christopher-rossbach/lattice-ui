import React, { useEffect, useMemo, useState } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism.css';
import { LayerPanel } from './components/LayerPanel';
import { CheckerPanel } from './components/CheckerPanel';
import { DualGraphView } from './components/DualGraphView';
import { useLatticeStore } from './state/useLatticeStore';
import bundledDefaults from './defaults/initialState';
import './App.css';

const STORAGE_KEY = 'lattice-checks-v1';
const defaultCustomHelpers = `// Return an object with any helpers you want to inject.
// These functions will be merged into the built-ins and available in your checks.
// Example:
// return {
//   isEvenRank: (n, rank) => (rank(n) ?? 0) % 2 === 0,
// };
return {};`;

const loadCustomCodes = (): string[] => {
  if (typeof window === 'undefined') return [defaultCustomHelpers];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // First visit: seed from bundled defaults if available
      const bundled = bundledDefaults.checksAndHelpers?.customCodes;
      if (bundled && Array.isArray(bundled) && bundled.length) return bundled;
      return [defaultCustomHelpers];
    }
    const parsed = JSON.parse(raw);
    const stored = Array.isArray(parsed?.customCodes)
      ? parsed.customCodes.filter((c: unknown): c is string => typeof c === 'string')
      : null;
    if (stored && stored.length) return stored;
    if (typeof parsed?.customCode === 'string') return [parsed.customCode]; // migrate old single
    return [defaultCustomHelpers];
  } catch (e) {
    return [defaultCustomHelpers];
  }
};

const App: React.FC = () => {
  const initialCustomCodes = useMemo(() => loadCustomCodes(), []);
  const [customCodes, setCustomCodes] = useState<string[]>(initialCustomCodes);
  const [customExpanded, setCustomExpanded] = useState<boolean[]>(initialCustomCodes.map(() => false));

  const insertTab = (value: string, selectionStart: number, selectionEnd: number) => {
    const insert = '  ';
    const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
    const caret = selectionStart + insert.length;
    return { next, caret };
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const merged = { ...(parsed || {}), customCodes };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
      // ignore persistence errors
    }
  }, [customCodes]);

  const updateCustomCode = (idx: number, value: string) => {
    setCustomCodes((prev) => prev.map((c, i) => (i === idx ? value : c)));
  };

  const addCustomBlock = () => {
    setCustomCodes((prev) => [...prev, defaultCustomHelpers]);
    setCustomExpanded((prev) => [...prev, false]);
  };

  const removeCustomBlock = (idx: number) => {
    setCustomCodes((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setCustomExpanded((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  };

  const toggleCustomBlock = (idx: number) => {
    setCustomExpanded((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  useEffect(() => {
    // Keep expanded flags aligned when length changes externally (e.g., load/migration).
    setCustomExpanded((prev) => {
      if (prev.length === customCodes.length) return prev;
      const next = [...prev];
      while (next.length < customCodes.length) next.push(false);
      while (next.length > customCodes.length) next.pop();
      return next;
    });
  }, [customCodes.length]);

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
      : { maxWidth: 2200, margin: '0 auto', padding: '32px 32px 80px' }
    }>
      {!isFullscreen && (
        <header style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: '#2563eb', color: '#fff', fontWeight: 800 }}>L</span>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.5 }}>Lattice Builder</h1>
              <p style={{ margin: 0, color: '#475569' }}>Drag nodes within their layer, click nodes to connect, click edges to delete.</p>
            </div>
          </div>
        </header>
      )}

      <div style={isFullscreen
        ? { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, height: '100vh', padding: 8 }
        : { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start', height: 'calc(100vh - 200px)' }
      }>
        <div style={{ display: 'grid', gap: 12, height: isFullscreen ? '100%' : undefined }}>
          <DualGraphView />
          {!isFullscreen && <LayerPanel />}
        </div>
        <div style={{ display: 'grid', gap: 12, height: '100%', overflowY: 'auto', paddingRight: 8 }}>
          <CheckerPanel customCodes={customCodes} />
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Custom helper functions</div>
              <button onClick={addCustomBlock} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>+ Add block</button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {customCodes.map((code, idx) => (
                <div key={`custom-block-${idx}`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#f8fafc', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => toggleCustomBlock(idx)} style={{ padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>{customExpanded[idx] ? '▾' : '▸'}</button>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>Helper block {idx + 1}</div>
                    </div>
                    {customCodes.length > 1 && (
                      <button onClick={() => removeCustomBlock(idx)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #b91c1c', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Remove</button>
                    )}
                  </div>
                  {customExpanded[idx] && (
                    <>
                      <Editor
                        value={code}
                        onValueChange={(val) => updateCustomCode(idx, val)}
                        onKeyDown={(e) => {
                          // Ctrl+Enter to trigger re-evaluation (requires running checks or a refresh)
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            // Custom helpers are evaluated when checks run, so trigger a visual indicator
                            const el = e.currentTarget as HTMLTextAreaElement;
                            el.style.outline = '2px solid #2563eb';
                            setTimeout(() => { el.style.outline = ''; }, 300);
                            return;
                          }
                          if (e.key !== 'Tab') return;
                          e.preventDefault();
                          const { selectionStart = 0, selectionEnd = 0, value } = e.currentTarget as HTMLTextAreaElement;
                          const { next, caret } = insertTab(value, selectionStart, selectionEnd);
                          updateCustomCode(idx, next);
                          requestAnimationFrame(() => {
                            const el = document.getElementById(`custom-${idx}`) as HTMLTextAreaElement | null;
                            if (!el) return;
                            el.selectionStart = caret;
                            el.selectionEnd = caret;
                          });
                        }}
                        highlight={(val) => {
                          const lang =
                            Prism.languages.typescript ||
                            Prism.languages.javascript ||
                            Prism.languages.clike ||
                            Prism.languages.markup;
                          if (!lang) return val;
                          try {
                            return Prism.highlight(val, lang, 'typescript');
                          } catch (err) {
                            return val;
                          }
                        }}
                        padding={12}
                        textareaId={`custom-${idx}`}
                        textareaClassName="checker-textarea"
                        style={{ width: '100%', minHeight: 180, fontFamily: 'monospace', fontSize: 13, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a' }}
                      />
                      <div style={{ color: '#475569', fontSize: 12 }}>Return an object; its properties merge into built-in helpers. Each block sees helpers from previous blocks.</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
