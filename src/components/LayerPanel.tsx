import React, { useEffect, useMemo, useState } from 'react';
import { useLatticeStore } from '../state/useLatticeStore';
import {
  getLayers, maxRank, LatticeStateShape, LatticeElement, Relation,
} from '../model/lattice';
import { generateGraphSVG } from '../helpers/exportGraph';
import { exportPDFToServer } from '../helpers/exportApi';
import { getNodeDisplayLabel } from '../helpers/nodeLabel';
import bundledDefaults from '../defaults/initialState';
import { collectCurrentDefaults } from '../defaults/exportDefaults';

/**
 * Parse a graph definition in covering relation format.
 * Format: "a<b" means a is covered by b (b is directly above a, rank(b) = rank(a) + 1)
 * The < symbol points from lower to higher rank, like in a Hasse diagram.
 * Empty lines and text after # are ignored.
 */
function parseGraphDefinition(input: string): LatticeStateShape | { error: string } {
  const lines = input.split('\n');
  const relations: Array<{ upper: string; lower: string }> = [];
  const allNodes = new Set<string>();

  for (const line of lines) {
    // Remove comments
    const withoutComment = line.split('#')[0].trim();
    if (!withoutComment) continue;

    // Parse covering relation: lower < upper (lower is covered by upper)
    const match = withoutComment.match(/^(.+)<(.+)$/);
    if (!match) {
      return { error: `Invalid line: "${line}"` };
    }
    const lower = match[1].trim();
    const upper = match[2].trim();
    if (!upper || !lower) {
      return { error: `Empty node name in line: "${line}"` };
    }
    relations.push({ upper, lower });
    allNodes.add(upper);
    allNodes.add(lower);
  }

  if (allNodes.size === 0) {
    return { error: 'No nodes found in input' };
  }

  // Check for self-loops
  for (const { upper, lower } of relations) {
    if (upper === lower) {
      return { error: `Self-loop detected: "${upper}<${upper}" - a node cannot cover itself` };
    }
  }

  // Check for duplicate relations
  const relationSet = new Set<string>();
  for (const { upper, lower } of relations) {
    const key = `${lower}<${upper}`;
    if (relationSet.has(key)) {
      return { error: `Duplicate relation: "${key}" appears more than once` };
    }
    relationSet.add(key);
  }

  // Check for contradictory relations (both a<b and b<a)
  for (const { upper, lower } of relations) {
    const reverse = `${upper}<${lower}`;
    if (relationSet.has(reverse)) {
      return { error: `Contradictory relations: both "${lower}<${upper}" and "${upper}<${lower}" are defined (would create a cycle)` };
    }
  }

  // Compute ranks: nodes that are only covered (never cover) start at rank 0
  // then propagate upward
  const coversMap = new Map<string, Set<string>>(); // node -> set of nodes it covers
  const coveredByMap = new Map<string, Set<string>>(); // node -> set of nodes that cover it

  for (const node of allNodes) {
    coversMap.set(node, new Set());
    coveredByMap.set(node, new Set());
  }

  for (const { upper, lower } of relations) {
    coversMap.get(upper)!.add(lower);
    coveredByMap.get(lower)!.add(upper);
  }

  // Find bottom nodes (covered but don't cover anything)
  const ranks = new Map<string, number>();
  const queue: string[] = [];

  for (const node of allNodes) {
    if (coversMap.get(node)!.size === 0) {
      // This node doesn't cover anything, it's at rank 0
      ranks.set(node, 0);
      queue.push(node);
    }
  }

  // Check if we have any bottom elements
  if (queue.length === 0) {
    return { error: 'No minimal elements found - every node covers something, which implies a cycle' };
  }

  // BFS upward to assign ranks
  while (queue.length > 0) {
    const node = queue.shift()!;
    const nodeRank = ranks.get(node)!;

    for (const upperNode of coveredByMap.get(node)!) {
      const currentRank = ranks.get(upperNode);
      const newRank = nodeRank + 1;

      if (currentRank === undefined || newRank > currentRank) {
        ranks.set(upperNode, newRank);
      }

      // Check if all lower nodes have been processed
      const allLowerProcessed = [...coversMap.get(upperNode)!].every(lower => ranks.has(lower));
      if (allLowerProcessed && !queue.includes(upperNode)) {
        queue.push(upperNode);
      }
    }
  }

  // Check for cycles (nodes without ranks)
  const unrankedNodes: string[] = [];
  for (const node of allNodes) {
    if (!ranks.has(node)) {
      unrankedNodes.push(node);
    }
  }
  if (unrankedNodes.length > 0) {
    if (unrankedNodes.length <= 5) {
      return { error: `Cycle or unreachable nodes detected: ${unrankedNodes.map(n => `"${n}"`).join(', ')} could not be assigned ranks` };
    } else {
      return { error: `Cycle or unreachable nodes detected: ${unrankedNodes.length} nodes could not be assigned ranks (including "${unrankedNodes[0]}", "${unrankedNodes[1]}", ...)` };
    }
  }

  // Validate covering relations: rank difference must be exactly 1
  // If rank(upper) - rank(lower) > 1, there's an intermediate element
  for (const { upper, lower } of relations) {
    const upperRank = ranks.get(upper)!;
    const lowerRank = ranks.get(lower)!;
    const rankDiff = upperRank - lowerRank;

    if (rankDiff !== 1) {
      // Find an intermediate node to give a helpful error
      const intermediates: string[] = [];
      for (const [node, rank] of ranks) {
        if (rank > lowerRank && rank < upperRank) {
          // Check if this node is actually on a path between lower and upper
          intermediates.push(node);
        }
      }
      if (intermediates.length > 0) {
        return {
          error: `Invalid covering: "${lower}<${upper}" spans ${rankDiff} ranks. ` +
            `Node(s) ${intermediates.map(n => `"${n}"`).join(', ')} are in between.`
        };
      } else {
        return {
          error: `Invalid covering: "${lower}<${upper}" has rank difference ${rankDiff} (expected 1).`
        };
      }
    }
  }

  // Build lattice state
  const elements: Record<string, LatticeElement> = {};
  const latticeRelations: Relation[] = [];
  const positions: Record<string, { x: number }> = {};

  const DEFAULT_COLOR = '#0f172a';

  for (const node of allNodes) {
    elements[node] = {
      id: node,
      rank: ranks.get(node)!,
      color: DEFAULT_COLOR,
    };
  }

  for (const { upper, lower } of relations) {
    latticeRelations.push({ from: lower, to: upper });
  }

  // Compute positions: spread nodes horizontally within each rank
  const layers: Record<number, string[]> = {};
  for (const [node, rank] of ranks) {
    if (!layers[rank]) layers[rank] = [];
    layers[rank].push(node);
  }

  for (const rank of Object.keys(layers)) {
    const nodesInRank = layers[Number(rank)].sort();
    nodesInRank.forEach((id, idx) => {
      positions[id] = { x: (idx - nodesInRank.length / 2) * 140 };
    });
  }

  return { elements, relations: latticeRelations, positions };
}

const SAVES_KEY = 'lattice-saves-v1';

type SavedEntry = { name: string; state: LatticeStateShape };

const loadSaved = (): SavedEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVES_KEY);
    if (!raw) {
      // First visit: seed from bundled defaults if available
      if (bundledDefaults.savedLattices && Array.isArray(bundledDefaults.savedLattices)) {
        const seeded = bundledDefaults.savedLattices
          .filter((e) => typeof e?.name === 'string' && e?.state?.elements && e?.state?.relations && e?.state?.positions)
          .sort((a, b) => a.name.localeCompare(b.name));
        persistSaved(seeded);
        return seeded;
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => typeof e?.name === 'string' && e?.state?.elements && e?.state?.relations && e?.state?.positions)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    return [];
  }
};

const persistSaved = (entries: SavedEntry[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVES_KEY, JSON.stringify(entries));
  } catch (e) {
    // ignore
  }
};

export const LayerPanel: React.FC = () => {
  const primary = useLatticeStore((s) => s.primary);
  const secondary = useLatticeStore((s) => s.secondary);
  const foc = useLatticeStore((s) => s.foc);
  const loadSample = useLatticeStore((s) => s.loadSample);
  const [message, setMessage] = useState<string>('');
  const [saveNames, setSaveNames] = useState<{ pri: string; sec: string }>({ pri: '', sec: '' });
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string>('');
  const [hoverPreview, setHoverPreview] = useState<{ title: string; subtitle?: string; state: LatticeStateShape } | null>(null);
  const [importText, setImportText] = useState<string>('');

  useEffect(() => {
    const entries = loadSaved();
    setSavedEntries(entries);
    if (entries[0]) setSelectedSavedId(entries[0].name);
  }, []);

  const activeGraph = foc === 'pri' ? primary : secondary;
  const currentSummary = useMemo(() => ({
    elements: activeGraph.elements,
    relations: activeGraph.relations,
    positions: activeGraph.positions,
  }), [activeGraph.elements, activeGraph.positions, activeGraph.relations]);

  const summarize = (state: LatticeStateShape) => {
    const stateLayers = getLayers({ elements: state.elements });
    const ranks = Object.keys(stateLayers)
      .map((r) => Number(r))
      .sort((a, b) => b - a);
    return {
      nodeCount: Object.keys(state.elements).length,
      relationCount: state.relations.length,
      maxRank: maxRank({ elements: state.elements }),
      ranks,
    };
  };

  const buildPreviewLayout = (state: LatticeStateShape) => {
    const summary = summarize(state);
    const nodes = Object.values(state.elements);
    if (nodes.length === 0) return { nodes: [], edges: [] as Array<{ x1: number; y1: number; x2: number; y2: number }> };

    const rankGap = 36;
    const ranksDesc = summary.ranks.length ? summary.ranks : [0];
    const maxRankValue = summary.maxRank;
    const posX = (id: string) => state.positions[id]?.x ?? 0;

    const xs = nodes.map((n) => posX(n.id));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const spanX = Math.max(1, maxX - minX);
    const scaleX = 160 / spanX;

    const nodePoints = nodes.map((n) => {
      const x = (posX(n.id) - minX) * scaleX + 20;
      const y = (maxRankValue - n.rank) * rankGap + 12;
      return { id: n.id, x, y, color: n.color ?? '#0f172a' };
    });

    const pointMap = new Map(nodePoints.map((p) => [p.id, p]));
    const edges = state.relations
      .map((r) => {
        const from = pointMap.get(r.from);
        const to = pointMap.get(r.to);
        if (!from || !to) return null;
        return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
      })
      .filter((e): e is { x1: number; y1: number; x2: number; y2: number } => Boolean(e));

    return { nodes: nodePoints, edges };
  };

  const handleSave = (graphId: 'pri' | 'sec') => {
    const name = saveNames[graphId].trim();
    if (!name) {
      setMessage('Enter a name to save');
      return;
    }
    const graph = graphId === 'pri' ? primary : secondary;
    const entry: SavedEntry = {
      name,
      state: {
        elements: graph.elements,
        relations: graph.relations,
        positions: graph.positions,
      },
    };
    const filtered = savedEntries.filter((e) => e.name !== name);
    const next = [...filtered, entry].sort((a, b) => a.name.localeCompare(b.name));
    setSavedEntries(next);
    persistSaved(next);
    setSelectedSavedId(name);
    
    // Automatically export as SVG to server with the same name
    try {
      const svgNodes = Object.values(graph.elements).map((el) => {
        const y = (Math.max(...Object.values(graph.elements).map((e) => e.rank)) - el.rank) * 140;
        return {
          id: el.id,
          x: graph.positions[el.id]?.x ?? 0,
          y,
          label: getNodeDisplayLabel(el.id, graph),
          color: el.color ?? '#0f172a',
        };
      });

      const svgEdges = graph.relations.map((r) => ({
        source: r.from,
        target: r.to,
      }));

      const svg = generateGraphSVG(svgNodes, svgEdges);
      const pdfFilename = `${name}.pdf`;
      
      // Export PDF to server - send SVG content which will be converted to vector PDF
      exportPDFToServer(pdfFilename, svg).then((response) => {
        if (response.success) {
          setMessage(`Saved "${name}" • Exported to ${response.path}`);
        } else {
          setMessage(`Saved "${name}" (export failed: ${response.error})`);
        }
      });
    } catch (error) {
      console.error('Error exporting SVG:', error);
      setMessage(`Saved "${name}" (export failed)`);
    }
  };

  const handleLoad = (entry: SavedEntry, graphId: 'pri' | 'sec') => {
    loadSample(entry.state, graphId);
    setSelectedSavedId(entry.name);
    setSaveNames((prev) => ({ ...prev, [graphId]: entry.name }));
    setMessage(`Loaded "${entry.name}" into ${graphId === 'pri' ? 'primary' : 'secondary'} graph`);
  };

  const handleImport = (graphId: 'pri' | 'sec') => {
    if (!importText.trim()) {
      setMessage('Import error: No input provided');
      return;
    }
    try {
      const result = parseGraphDefinition(importText);
      if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') {
        setMessage(`Import error: ${result.error}`);
        return;
      }
      const state = result as LatticeStateShape;
      loadSample(state, graphId);
      setMessage(`Imported graph with ${Object.keys(state.elements).length} nodes into ${graphId === 'pri' ? 'primary' : 'secondary'} graph`);
    } catch (e) {
      console.error('Import failed:', e);
      setMessage(`Import error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>Lattice Manager</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => {
              const json = collectCurrentDefaults();
              navigator.clipboard.writeText(json).then(() => {
                setMessage('Defaults JSON copied to clipboard. Paste into src/defaults/initialState.ts');
              }).catch(() => {
                // Fallback: download as file
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'initialState.json';
                a.click();
                URL.revokeObjectURL(url);
                setMessage('Defaults JSON downloaded as initialState.json');
              });
            }}
            style={{ ...buttonStyles.secondary, fontSize: 11, padding: '4px 8px' }}
          >
            Export as defaults
          </button>
          <button
            onClick={() => {
              const ok = window.confirm('This will resets your stored graphs, custom checks, helpers and function. Are you sure you want to continue?');
              if (!ok) return;
              try {
                window.localStorage.removeItem('lattice-state-v1-primary');
                window.localStorage.removeItem('lattice-state-v1-secondary');
                window.localStorage.removeItem('lattice-saves-v1');
                window.localStorage.removeItem('lattice-checks-v1');
              } catch {}
              window.location.reload();
            }}
            style={{ ...buttonStyles.danger, fontSize: 11, padding: '4px 8px' }}
          >
            Reset everything to defaults
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
        <div style={{ ...panelStyles.card, minHeight: 420 }}>
          <div style={panelStyles.cardTitle}>Save / Load</div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Primary graph</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={saveNames.pri}
                  onChange={(e) => setSaveNames((prev) => ({ ...prev, pri: e.target.value }))}
                  placeholder="Save name"
                  style={{ ...panelStyles.input, flex: 1, minWidth: 0 }}
                />
                <button onClick={() => handleSave('pri')} style={buttonStyles.secondary}>Save</button>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Secondary graph</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={saveNames.sec}
                  onChange={(e) => setSaveNames((prev) => ({ ...prev, sec: e.target.value }))}
                  placeholder="Save name"
                  style={{ ...panelStyles.input, flex: 1, minWidth: 0 }}
                />
                <button onClick={() => handleSave('sec')} style={buttonStyles.secondary}>Save</button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 10, maxHeight: 300, overflowY: 'auto' }}>
            {savedEntries.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>No saved lattices yet.</div>
            )}
            {savedEntries.map((entry, idx) => (
              <div
                key={entry.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderTopLeftRadius: idx === 0 ? 10 : 0,
                  borderTopRightRadius: idx === 0 ? 10 : 0,
                  borderBottomLeftRadius: idx === savedEntries.length - 1 ? 10 : 0,
                  borderBottomRightRadius: idx === savedEntries.length - 1 ? 10 : 0,
                  border: selectedSavedId === entry.name ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  marginBottom: -1,
                  position: 'relative',
                  zIndex: selectedSavedId === entry.name ? 2 : 1,
                  background: selectedSavedId === entry.name ? '#eff6ff' : '#fff',
                }}
                onMouseEnter={() => setHoverPreview({ title: entry.name, subtitle: 'Saved lattice', state: entry.state })}
                onMouseLeave={() => setHoverPreview(null)}
              >
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{entry.name}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleLoad(entry, 'pri')} style={buttonStyles.secondary}>Load → Pri</button>
                  <button onClick={() => handleLoad(entry, 'sec')} style={buttonStyles.secondary}>Load → Sec</button>
                  <button
                    onClick={() => {
                      const next = savedEntries.filter((e) => e.name !== entry.name);
                      setSavedEntries(next);
                      persistSaved(next);
                      if (selectedSavedId === entry.name) {
                        setSelectedSavedId(next[0]?.name ?? '');
                      }
                      setMessage(`Removed saved graph "${entry.name}"`);
                    }}
                    style={buttonStyles.ghostDanger}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateRows: 'auto 1fr' }}>
          <div style={panelStyles.card}>
            <div style={panelStyles.cardTitle}>Import from Text</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
              Format: <code>a&lt;b</code> means b covers a. Lines with # are comments.
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`# Example:\n0<a\n0<c\na<b\nc<b`}
              style={{
                ...panelStyles.input,
                minHeight: 120,
                fontFamily: 'monospace',
                fontSize: 12,
                resize: 'vertical',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => handleImport('pri')} style={buttonStyles.secondary}>Import → Pri</button>
              <button onClick={() => handleImport('sec')} style={buttonStyles.secondary}>Import → Sec</button>
            </div>
          </div>

          <div style={panelStyles.card}>
            <div style={panelStyles.cardTitle}>Preview</div>
            {(() => {
              const preview = hoverPreview ?? { title: 'Current graph', subtitle: 'Live state', state: currentSummary };
              const summary = summarize(preview.state);
              const layout = buildPreviewLayout(preview.state);
              return (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{preview.title}</div>
                    {preview.subtitle && <div style={{ color: '#64748b', fontSize: 12 }}>{preview.subtitle}</div>}
                  </div>
                  <svg viewBox="0 0 200 200" style={{ width: '100%', height: 160, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}>
                    {layout.edges.map((e, idx) => (
                      <line key={idx} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#cbd5e1" strokeWidth={1.2} />
                    ))}
                    {layout.nodes.map((n) => (
                      <circle key={n.id} cx={n.x} cy={n.y} r={5} fill={n.color} opacity={0.9} />
                    ))}
                  </svg>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#0f172a' }}>
                    <div><strong>{summary.nodeCount}</strong> nodes</div>
                    <div><strong>{summary.relationCount}</strong> relations</div>
                    <div><strong>{summary.maxRank}</strong> max rank</div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {message && <div style={{ color: '#0f172a', background: '#e0f2fe', border: '1px solid #bae6fd', padding: 8, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>{message}</div>}
    </div>
  );
};

const buttonStyles = {
  secondary: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #cbd5f5',
    background: '#fff',
    color: '#2563eb',
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
  primary: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #2563eb',
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
  danger: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #ef4444',
    background: '#ef4444',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
  ghostDanger: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #fecaca',
    background: '#fff1f2',
    color: '#b91c1c',
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
};

const panelStyles = {
  card: {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 12,
    background: '#f8fafc',
    display: 'grid',
    gap: 8,
  } as React.CSSProperties,
  cardTitle: {
    fontWeight: 700,
    color: '#0f172a',
  } as React.CSSProperties,
  input: {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#fff',
    minWidth: 120,
  } as React.CSSProperties,
};
