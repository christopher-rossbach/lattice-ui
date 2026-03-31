import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism.css';
import { useLatticeStore } from '../state/useLatticeStore';
import { makeDualHelpers, HelperFns } from '../helpers/checkHelpers';
import { LatticeStateShape } from '../model/lattice';
import { shallow } from 'zustand/shallow';
import bundledDefaults from '../defaults/initialState';

const defaultSnippet = `const rank2 = nodes.filter((n) => rank(n) === 2);
if (rank2.length === 0) return 'Need at least one node at rank 2';
return null;`;

const defaultFunctionSnippet = `// Return any value; it will show in the results panel.
// helpers and custom helpers are available here.
return nodes.length;`;

type Check = {
  id: string;
  name: string;
  code: string;
  expanded: boolean;
  resultPri: string;
  statusPri: 'pass' | 'fail' | 'info';
  durationMsPri?: number | null;
  resultSec: string;
  statusSec: 'pass' | 'fail' | 'info';
  durationMsSec?: number | null;
};

type CustomFunction = {
  id: string;
  name: string;
  code: string;
  expanded: boolean;
  result: string;
  status: 'info' | 'fail';
  durationMs?: number | null;
};

type StoredState = {
  checks: Check[];
  autoRun: boolean;
  functions: CustomFunction[];
};

type GraphRunResult = {
  status: 'pass' | 'fail' | 'info';
  result: string;
  durationMs: number | null;
};

type RunCheckResult = {
  pri: GraphRunResult;
  sec: GraphRunResult;
};

type RunFunctionResult = {
  status: CustomFunction['status'];
  result: string;
  durationMs: number | null;
};

type CheckerPanelProps = {
  customCodes: string[];
};

type GraphViewController = {
  show: (state: LatticeStateShape) => void;
  reset: () => void;
};

type HelperBundle = HelperFns & {
  pri: HelperFns;
  sec: HelperFns;
  priView: GraphViewController;
  secView: GraphViewController;
};

const STORAGE_KEY = 'lattice-checks-v1';

const coerceStatus = (value: unknown): 'pass' | 'fail' | 'info' => {
  return value === 'pass' || value === 'fail' || value === 'info' ? value : 'info';
};

const makeCheck = (idx: number): Check => ({
  id: `check-${idx}-${Date.now()}`,
  name: `Check ${idx + 1}`,
  code: defaultSnippet,
  expanded: false,
  resultPri: '',
  statusPri: 'info',
  durationMsPri: null,
  resultSec: '',
  statusSec: 'info',
  durationMsSec: null,
});

const makeFunction = (idx: number): CustomFunction => ({
  id: `fn-${idx}-${Date.now()}`,
  name: `Function ${idx + 1}`,
  code: defaultFunctionSnippet,
  expanded: false,
  result: '',
  status: 'info',
  durationMs: null,
});

const loadStored = (): StoredState => {
  const fallback = { checks: [makeCheck(0)], autoRun: false, functions: [makeFunction(0)] };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // First visit: seed from bundled defaults if available
      const bd = bundledDefaults.checksAndHelpers;
      if (bd && Array.isArray(bd.checks) && bd.checks.length) {
        return {
          checks: bd.checks.map((c, idx) => ({
            ...makeCheck(idx),
            id: c.id,
            name: c.name,
            code: c.code,
          })),
          autoRun: bd.autoRun ?? false,
          functions: Array.isArray(bd.functions) && bd.functions.length
            ? bd.functions.map((f, idx) => ({
                ...makeFunction(idx),
                id: f.id,
                name: f.name,
                code: f.code,
              }))
            : [makeFunction(0)],
        };
      }
      return fallback;
    }
    const parsed = JSON.parse(raw) as StoredState;
    if (!parsed || !Array.isArray(parsed.checks)) return fallback;
    const checks = parsed.checks.map((c, idx) => {
      const legacy = c as Partial<Check> & { status?: string; durationMs?: number };
      const statusPri = coerceStatus(legacy.statusPri ?? legacy.status);
      const statusSec = coerceStatus(legacy.statusSec ?? legacy.status);
      const durationMsPri = typeof legacy.durationMsPri === 'number' ? legacy.durationMsPri : typeof legacy.durationMs === 'number' ? legacy.durationMs : null;
      const durationMsSec = typeof legacy.durationMsSec === 'number' ? legacy.durationMsSec : typeof legacy.durationMs === 'number' ? legacy.durationMs : null;
      return {
        id: legacy.id ?? `check-${idx}-${Date.now()}`,
        name: legacy.name ?? `Check ${idx + 1}`,
        code: legacy.code ?? defaultSnippet,
        expanded: legacy.expanded ?? false,
        resultPri: '',
        statusPri,
        durationMsPri,
        resultSec: '',
        statusSec,
        durationMsSec,
      } satisfies Check;
    });
    const autoRun = typeof parsed.autoRun === 'boolean' ? parsed.autoRun : false;
    const functions = Array.isArray(parsed.functions)
      ? parsed.functions.map((f, idx) => {
        const status: CustomFunction['status'] = f.status === 'fail' ? 'fail' : 'info';
        const durationMs = typeof f.durationMs === 'number' ? f.durationMs : null;
        return {
          id: f.id ?? `fn-${idx}-${Date.now()}`,
          name: f.name ?? `Function ${idx + 1}`,
          code: f.code ?? defaultFunctionSnippet,
          expanded: f.expanded ?? false,
          result: '',
          status,
          durationMs,
        } satisfies CustomFunction;
      })
      : [makeFunction(0)];
    return { checks, autoRun, functions };
  } catch (e) {
    return fallback;
  }
};

export const CheckerPanel: React.FC<CheckerPanelProps> = ({ customCodes }) => {
  const { primary, secondary, foc } = useLatticeStore(
    (s) => ({
      primary: s.primary,
      secondary: s.secondary,
      foc: s.foc,
    }),
    shallow,
  );
  const graph = foc === 'pri' ? primary : secondary;
  const setColor = useLatticeStore((s) => s.setColor);
  const addNodeWithId = useLatticeStore((s) => s.addNodeWithId);
  const addRelationStore = useLatticeStore((s) => s.addRelation);
  const removeRelationStore = useLatticeStore((s) => s.removeRelation);
  const loadSample = useLatticeStore((s) => s.loadSample);
  const resetSample = useLatticeStore((s) => s.resetSample);
  const selected = useLatticeStore(
    (s) => (s.foc === 'pri' ? s.primarySelectedNodes : s.secondarySelectedNodes),
    shallow,
  );

  const stored = useMemo(() => loadStored(), []);
  const [checks, setChecks] = useState<Check[]>(stored.checks);
  const [autoRun, setAutoRun] = useState<boolean>(stored.autoRun);
  const [functions, setFunctions] = useState<CustomFunction[]>(stored.functions);

  // Prevent infinite loops: skip autoRun when we're already executing checks/functions
  const isExecutingRef = useRef(false);
  const pendingAutoRunRef = useRef(false);

  const elementCounts = useMemo(() => ({
    pri: Object.keys(primary.elements).length,
    sec: Object.keys(secondary.elements).length,
  }), [primary.elements, secondary.elements]);
  const relationCounts = useMemo(() => ({
    pri: primary.relations.length,
    sec: secondary.relations.length,
  }), [primary.relations, secondary.relations]);

  const handleCodeKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
    itemId: string,
    textareaId: string,
    updater: (id: string, code: string) => void,
    runner?: (id: string) => void,
  ) => {
    // Ctrl+Enter to run
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && runner) {
      e.preventDefault();
      runner(itemId);
      return;
    }
    // Tab to indent
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const textarea = e.currentTarget as HTMLTextAreaElement;
    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? 0;
    const value = (textarea.value ?? '') as string;
    const insert = '  ';
    const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
    const caret = selectionStart + insert.length;
    updater(itemId, next);
    requestAnimationFrame(() => {
      const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
      if (!el) return;
      el.selectionStart = caret;
      el.selectionEnd = caret;
    });
  };

  const buildHelpers = (graphId: 'pri' | 'sec', selectedNodes: string[], start: number) => {
    const state = useLatticeStore.getState();
    const graphState = graphId === 'pri' ? state.primary : state.secondary;
    const nodes = Object.keys(graphState.elements);

    const dualHelpers = makeDualHelpers(
      () => {
        const current = useLatticeStore.getState().primary;
        return { elements: current.elements, relations: current.relations };
      },
      () => {
        const current = useLatticeStore.getState().secondary;
        return { elements: current.elements, relations: current.relations };
      },
      {
        setColorFn: (id, color) => setColor(id, color, 'pri'),
        addNodeFn: (id, rank) => addNodeWithId(id, rank, 'pri'),
        connectFn: (a, b) => {
          addRelationStore(a, b, 'pri');
          addRelationStore(b, a, 'pri');
        },
        disconnectFn: (a, b) => {
          removeRelationStore(a, b, 'pri');
          removeRelationStore(b, a, 'pri');
        },
      },
      {
        setColorFn: (id, color) => setColor(id, color, 'sec'),
        addNodeFn: (id, rank) => addNodeWithId(id, rank, 'sec'),
        connectFn: (a, b) => {
          addRelationStore(a, b, 'sec');
          addRelationStore(b, a, 'sec');
        },
        disconnectFn: (a, b) => {
          removeRelationStore(a, b, 'sec');
          removeRelationStore(b, a, 'sec');
        },
      },
    );

    const viewControllers: { priView: GraphViewController; secView: GraphViewController } = {
      priView: {
        show: (state) => loadSample(state, 'pri'),
        reset: () => resetSample('pri'),
      },
      secView: {
        show: (state) => loadSample(state, 'sec'),
        reset: () => resetSample('sec'),
      },
    };

    const activeHelpers = graphId === 'pri' ? dualHelpers.pri : dualHelpers.sec;
    const base: HelperBundle = {
      ...activeHelpers,
      pri: dualHelpers.pri,
      sec: dualHelpers.sec,
      ...viewControllers,
    };
    let customHelpers: Record<string, unknown> = {};
    const blocks = customCodes && customCodes.length ? customCodes : [''];
    for (let i = 0; i < blocks.length; i += 1) {
      const code = blocks[i];
      if (!code || !code.trim()) continue;
      try {
        const currentHelpers = { ...base, ...customHelpers } as Record<string, unknown>;
        const currentEntries = Object.entries(currentHelpers);
        const buildArgNames = ['helpers', 'nodes', 'selected', ...currentEntries.map(([k]) => k)];
        const buildArgValues = [currentHelpers, nodes, selectedNodes || [], ...currentEntries.map(([, v]) => v)];
        const build = new Function(...buildArgNames, code) as (...args: unknown[]) => Record<string, unknown>;
        const maybe = build(...buildArgValues);
        if (maybe && typeof maybe === 'object') customHelpers = { ...customHelpers, ...(maybe as Record<string, unknown>) };
      } catch (err) {
        const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
        return { error: `Custom helpers block ${i + 1} error: ${(err as Error).message}`, durationMs } as const;
      }
    }

    const helpers = { ...base, ...customHelpers } as HelperBundle & Record<string, unknown>;
    return { helpers } as const;
  };

  const runCheckForGraph = (check: Check, graphId: 'pri' | 'sec'): GraphRunResult => {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const state = useLatticeStore.getState();
    const graphState = graphId === 'pri' ? state.primary : state.secondary;
    const nodes = Object.keys(graphState.elements);
    const selectedNodes = graphId === 'pri' ? state.primarySelectedNodes : state.secondarySelectedNodes;
    try {
      const built = buildHelpers(graphId, selectedNodes, start);
      if ('error' in built) return { status: 'fail', result: built.error ?? 'Custom helpers block error', durationMs: built.durationMs ?? null };
      const helpers = built.helpers;

      const helperEntries = Object.entries(helpers);
      const argNames = ['nodes', 'selected', 'helpers', ...helperEntries.map(([k]) => k)];
      const argValues = [nodes, selectedNodes || [], helpers, ...helperEntries.map(([, v]) => v)];

      const fn = new Function(...argNames, check.code) as (...args: unknown[]) => unknown;

      const output = fn(...argValues);

      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;

      if (output === null || output === undefined) return { status: 'pass', result: 'OK', durationMs };
      if (typeof output === 'string') return { status: 'fail', result: output, durationMs };
      const pretty = JSON.stringify(output, null, 2) ?? 'undefined';
      return { status: 'info', result: pretty, durationMs };
    } catch (err) {
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
      return { status: 'fail', result: `Error: ${(err as Error).message}`, durationMs };
    }
  };

  const runCheck = (check: Check): RunCheckResult => {
    return {
      pri: runCheckForGraph(check, 'pri'),
      sec: runCheckForGraph(check, 'sec'),
    };
  };

  const runFunctionBlock = (fnBlock: CustomFunction): RunFunctionResult => {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const nodes = Object.keys(graph.elements);
    try {
      const built = buildHelpers(foc, selected || [], start);
      if ('error' in built) return { status: 'fail', result: built.error ?? 'Custom helpers block error', durationMs: built.durationMs ?? null };
      const helpers = built.helpers;

      const helperEntries = Object.entries(helpers);
      const argNames = ['nodes', 'selected', 'helpers', ...helperEntries.map(([k]) => k)];
      const argValues = [nodes, selected || [], helpers, ...helperEntries.map(([, v]) => v)];

      const fn = new Function(...argNames, fnBlock.code) as (...args: unknown[]) => unknown;
      const output = fn(...argValues);
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;

      if (typeof output === 'string') return { status: 'info', result: output, durationMs };
      const pretty = JSON.stringify(output, null, 2) ?? 'undefined';
      return { status: 'info', result: pretty, durationMs };
    } catch (err) {
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
      return { status: 'fail', result: `Error: ${(err as Error).message}`, durationMs };
    }
  };

  const handleRunAll = () => {
    isExecutingRef.current = true;
    setChecks((prev) => prev.map((c) => {
      const { pri, sec } = runCheck(c);
      return {
        ...c,
        statusPri: pri.status,
        resultPri: pri.result,
        durationMsPri: pri.durationMs,
        statusSec: sec.status,
        resultSec: sec.result,
        durationMsSec: sec.durationMs,
      };
    }));
    isExecutingRef.current = false;
  };

  useEffect(() => {
    if (!autoRun) return;
    if (isExecutingRef.current) {
      // Mark that auto-run is pending and will execute after current function completes
      pendingAutoRunRef.current = true;
      return;
    }
    isExecutingRef.current = true;
    setChecks((prev) => prev.map((c) => {
      const { pri, sec } = runCheck(c);
      return {
        ...c,
        statusPri: pri.status,
        resultPri: pri.result,
        durationMsPri: pri.durationMs,
        statusSec: sec.status,
        resultSec: sec.result,
        durationMsSec: sec.durationMs,
      };
    }));
    isExecutingRef.current = false;
  }, [primary, secondary, autoRun]);

  const handleRunOne = (id: string) => {
    isExecutingRef.current = true;
    setChecks((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const { pri, sec } = runCheck(c);
      return {
        ...c,
        statusPri: pri.status,
        resultPri: pri.result,
        durationMsPri: pri.durationMs,
        statusSec: sec.status,
        resultSec: sec.result,
        durationMsSec: sec.durationMs,
      };
    }));
    isExecutingRef.current = false;
  };

  const handleRunFunction = (id: string) => {
    isExecutingRef.current = true;
    pendingAutoRunRef.current = false;
    setFunctions((prev) => prev.map((f) => {
      if (f.id !== id) return f;
      const { status, result, durationMs } = runFunctionBlock(f);
      return { ...f, status, result, durationMs };
    }));
    isExecutingRef.current = false;
    
    // Run pending auto-checks after custom function completes
    if (autoRun && pendingAutoRunRef.current) {
      pendingAutoRunRef.current = false;
      setTimeout(() => {
        if (isExecutingRef.current) return;
        isExecutingRef.current = true;
        setChecks((prev) => prev.map((c) => {
          const { pri, sec } = runCheck(c);
          return {
            ...c,
            statusPri: pri.status,
            resultPri: pri.result,
            durationMsPri: pri.durationMs,
            statusSec: sec.status,
            resultSec: sec.result,
            durationMsSec: sec.durationMs,
          };
        }));
        isExecutingRef.current = false;
      }, 0);
    }
  };

  const handleRunAllFunctions = () => {
    isExecutingRef.current = true;
    pendingAutoRunRef.current = false;
    setFunctions((prev) => prev.map((f) => {
      const { status, result, durationMs } = runFunctionBlock(f);
      return { ...f, status, result, durationMs };
    }));
    isExecutingRef.current = false;
    
    // Run pending auto-checks after all custom functions complete
    if (autoRun && pendingAutoRunRef.current) {
      pendingAutoRunRef.current = false;
      setTimeout(() => {
        if (isExecutingRef.current) return;
        isExecutingRef.current = true;
        setChecks((prev) => prev.map((c) => {
          const { pri, sec } = runCheck(c);
          return {
            ...c,
            statusPri: pri.status,
            resultPri: pri.result,
            durationMsPri: pri.durationMs,
            statusSec: sec.status,
            resultSec: sec.result,
            durationMsSec: sec.durationMs,
          };
        }));
        isExecutingRef.current = false;
      }, 0);
    }
  };

  const addCheck = () => setChecks((prev) => [...prev, makeCheck(prev.length)]);
  const updateName = (id: string, name: string) => setChecks((prev) => prev.map((c) => c.id === id ? { ...c, name } : c));
  const updateCode = (id: string, code: string) => setChecks((prev) => prev.map((c) => c.id === id ? { ...c, code } : c));
  const toggle = (id: string) => setChecks((prev) => prev.map((c) => c.id === id ? { ...c, expanded: !c.expanded } : c));
  const move = (id: string, delta: number) => setChecks((prev) => {
    const idx = prev.findIndex((c) => c.id === id);
    if (idx < 0) return prev;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= prev.length) return prev;
    const next = [...prev];
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item);
    return next;
  });
  const deleteCheck = (id: string) => setChecks((prev) => {
    if (prev.length <= 1) return prev;
    return prev.filter((c) => c.id !== id);
  });

  const addFunction = () => setFunctions((prev) => [...prev, makeFunction(prev.length)]);
  const updateFunctionName = (id: string, name: string) => setFunctions((prev) => prev.map((f) => f.id === id ? { ...f, name } : f));
  const updateFunctionCode = (id: string, code: string) => setFunctions((prev) => prev.map((f) => f.id === id ? { ...f, code } : f));
  const toggleFunction = (id: string) => setFunctions((prev) => prev.map((f) => f.id === id ? { ...f, expanded: !f.expanded } : f));
  const moveFunction = (id: string, delta: number) => setFunctions((prev) => {
    const idx = prev.findIndex((f) => f.id === id);
    if (idx < 0) return prev;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= prev.length) return prev;
    const next = [...prev];
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item);
    return next;
  });
  const deleteFunction = (id: string) => setFunctions((prev) => {
    if (prev.length <= 1) return prev;
    return prev.filter((f) => f.id !== id);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const toStore = {
        ...(parsed || {}),
        checks: checks.map((c) => ({
          ...c,
          resultPri: '',
          statusPri: 'info' as const,
          durationMsPri: null,
          resultSec: '',
          statusSec: 'info' as const,
          durationMsSec: null,
        })),
        autoRun,
        functions: functions.map((f) => ({ ...f, result: '', status: 'info' as const })),
      } as Record<string, unknown>;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      // ignore persistence errors
    }
  }, [checks, autoRun, functions]);

  const statusStyle = (status: 'pass' | 'fail' | 'info'): React.CSSProperties => {
    if (status === 'pass') return { color: '#15803d', fontWeight: 700 };
    if (status === 'fail') return { color: '#b91c1c', fontWeight: 700 };
    return { color: '#475569', fontWeight: 700 };
  };

  const badgeStyle = (status: 'pass' | 'fail' | 'info'): React.CSSProperties => {
    if (status === 'pass') return { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' };
    if (status === 'fail') return { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' };
    return { background: '#e2e8f0', color: '#334155', border: '1px solid #cbd5e1' };
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
        <strong>Available Helpers:</strong> rank, covers, coveredBy, lt, gt, leq, geq, sup, inf, cup, cap, minus, isSubset, setEquals, one, zero, color, setColor, colors, addNode, connect, disconnect, atoms, ideal, filter, coAtoms, subsets, fromSetSystem, clearCaches, nodes, getAllNodes, pri, sec, priView, secView, helpers, selected + defined custom functions
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>Custom Checks</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} /> Auto-run
          </label>
          <button onClick={handleRunAll} style={buttonStyles.primary}>Run all</button>
          <button onClick={addCheck} style={buttonStyles.secondary}>+ Add</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {checks.map((check) => (
          <div key={check.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }} onClick={() => toggle(check.id)}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ ...badgeStyle(check.statusPri), padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>{check.statusPri.toUpperCase()}</span>
                  <span style={{ ...badgeStyle(check.statusSec), padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>{check.statusSec.toUpperCase()}</span>
                </div>
                <span style={{ fontWeight: 700, flex: 1 }}>{check.name}</span>
                {(typeof check.durationMsPri === 'number' || typeof check.durationMsSec === 'number') && (
                  <span style={{ color: '#475569', fontSize: 12 }}>
                    ({typeof check.durationMsPri === 'number' ? check.durationMsPri.toFixed(1) : '—'} ms • {typeof check.durationMsSec === 'number' ? check.durationMsSec.toFixed(1) : '—'} ms)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); handleRunOne(check.id); }} style={{ ...buttonStyles.primary, padding: '6px 10px', fontSize: 12 }}>Run</button>
                <span style={{ color: '#475569', fontSize: 12, cursor: 'pointer' }} onClick={() => toggle(check.id)}>{check.expanded ? '▾' : '▸'}</span>
              </div>
            </div>
            {check.expanded && (
              <div style={{ padding: '0 12px 12px 12px', display: 'grid', gap: 8 }}>
                <input
                  value={check.name}
                  onChange={(e) => updateName(check.id, e.target.value)}
                  placeholder="Check name"
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontWeight: 600, color: '#0f172a' }}
                />
                <Editor
                  value={check.code}
                  onValueChange={(code) => updateCode(check.id, code)}
                  highlight={(code) => {
                    const lang =
                      Prism.languages.typescript ||
                      Prism.languages.javascript ||
                      Prism.languages.clike ||
                      Prism.languages.markup;
                    if (!lang) return code;
                    try {
                      return Prism.highlight(code, lang, 'typescript');
                    } catch (err) {
                      return code;
                    }
                  }}
                  padding={10}
                  textareaId={`checker-${check.id}`}
                  textareaClassName="checker-textarea"
                  onKeyDown={(e) => handleCodeKeyDown(e, check.id, `checker-${check.id}`, updateCode, handleRunOne)}
                  style={{ width: '100%', minHeight: 160, fontFamily: 'monospace', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#0f172a' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#475569', fontSize: 12 }}>
                    <span>Return null/undefined to pass; return a string to fail.</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => move(check.id, -1)} style={buttonStyles.secondary}>↑</button>
                    <button onClick={() => move(check.id, 1)} style={buttonStyles.secondary}>↓</button>
                    {checks.length > 1 && (
                      <button onClick={() => deleteCheck(check.id)} style={{ ...buttonStyles.secondary, borderColor: '#b91c1c', background: '#b91c1c', color: '#fff' }}>Delete</button>
                    )}
                    <button onClick={() => handleRunOne(check.id)} style={buttonStyles.primary}>Run</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Primary result</div>
                    <pre style={{ margin: 0, background: '#0f172a', color: '#e2e8f0', padding: 10, borderRadius: 10, fontSize: 12, minHeight: 60, overflowX: 'auto', ...statusStyle(check.statusPri) }}>{check.resultPri || 'Result will appear here'}</pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Secondary result</div>
                    <pre style={{ margin: 0, background: '#0f172a', color: '#e2e8f0', padding: 10, borderRadius: 10, fontSize: 12, minHeight: 60, overflowX: 'auto', ...statusStyle(check.statusSec) }}>{check.resultSec || 'Result will appear here'}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>Custom Functions</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleRunAllFunctions} style={buttonStyles.primary}>Run all</button>
          <button onClick={addFunction} style={buttonStyles.secondary}>+ Add</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {functions.map((fn) => (
          <div key={fn.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }} onClick={() => toggleFunction(fn.id)}>
                <span style={{ ...badgeStyle(fn.status), padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>{fn.status.toUpperCase()}</span>
                <span style={{ fontWeight: 700 }}>{fn.name}</span>
                {typeof fn.durationMs === 'number' && (
                  <span style={{ color: '#475569', fontSize: 12 }}>({fn.durationMs.toFixed(1)} ms)</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); handleRunFunction(fn.id); }} style={{ ...buttonStyles.primary, padding: '6px 10px', fontSize: 12 }}>Run</button>
                <span style={{ color: '#475569', fontSize: 12, cursor: 'pointer' }} onClick={() => toggleFunction(fn.id)}>{fn.expanded ? '▾' : '▸'}</span>
              </div>
            </div>
            {fn.expanded && (
              <div style={{ padding: '0 12px 12px 12px', display: 'grid', gap: 8 }}>
                <input
                  value={fn.name}
                  onChange={(e) => updateFunctionName(fn.id, e.target.value)}
                  placeholder="Function name"
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontWeight: 600, color: '#0f172a' }}
                />
                <Editor
                  value={fn.code}
                  onValueChange={(code) => updateFunctionCode(fn.id, code)}
                  highlight={(code) => {
                    const lang =
                      Prism.languages.typescript ||
                      Prism.languages.javascript ||
                      Prism.languages.clike ||
                      Prism.languages.markup;
                    if (!lang) return code;
                    try {
                      return Prism.highlight(code, lang, 'typescript');
                    } catch (err) {
                      return code;
                    }
                  }}
                  padding={10}
                  textareaId={`function-${fn.id}`}
                  textareaClassName="checker-textarea"
                  onKeyDown={(e) => handleCodeKeyDown(e, fn.id, `function-${fn.id}`, updateFunctionCode, handleRunFunction)}
                  style={{ width: '100%', minHeight: 160, fontFamily: 'monospace', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#0f172a' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#475569', fontSize: 12 }}>
                    <span>Returns are displayed; no pass/fail.</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => moveFunction(fn.id, -1)} style={buttonStyles.secondary}>↑</button>
                    <button onClick={() => moveFunction(fn.id, 1)} style={buttonStyles.secondary}>↓</button>
                    {functions.length > 1 && (
                      <button onClick={() => deleteFunction(fn.id)} style={{ ...buttonStyles.secondary, borderColor: '#b91c1c', background: '#b91c1c', color: '#fff' }}>Delete</button>
                    )}
                    <button onClick={() => handleRunFunction(fn.id)} style={buttonStyles.primary}>Run</button>
                  </div>
                </div>
                <pre style={{ margin: 0, background: '#0f172a', color: '#e2e8f0', padding: 10, borderRadius: 10, fontSize: 12, minHeight: 60, overflowX: 'auto', ...statusStyle(fn.status) }}>{fn.result || 'Result will appear here'}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const buttonStyles = {
  primary: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #2563eb',
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
  secondary: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #0f172a',
    background: '#0f172a',
    color: '#e2e8f0',
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
};

export default CheckerPanel;
