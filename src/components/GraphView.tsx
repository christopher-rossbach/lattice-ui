import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Connection,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  OnEdgesDelete,
  OnNodesDelete,
  OnSelectionChangeFunc,
  Position,
  useReactFlow,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import 'katex/dist/katex.min.css';
import { useLatticeStore } from '../state/useLatticeStore';
import { generateGraphSVG } from '../helpers/exportGraph';
import { exportPDFToServer } from '../helpers/exportApi';
import { getNodeDisplayLabel, joinAtomNames } from '../helpers/nodeLabel';
import { getTextColorForBg } from '../helpers/colorUtils';
import katex from 'katex';

const RANK_GAP = 140;

const FALLBACK_COLOR = '#0f172a';

const renderMath = (text: string): { __html: string } => {
  try {
    // Check if text contains LaTeX delimiters
    if (text.includes('$')) {
      // Replace inline math $...$ with rendered KaTeX
      const rendered = text.replace(/\$([^$]+)\$/g, (match, math) => {
        try {
          return katex.renderToString(math, { throwOnError: false, displayMode: false });
        } catch {
          return match;
        }
      });
      return { __html: rendered };
    }
    // If no math, return as plain text (escaped)
    return { __html: text.replace(/</g, '&lt;').replace(/>/g, '&gt;') };
  } catch {
    return { __html: text.replace(/</g, '&lt;').replace(/>/g, '&gt;') };
  }
};

const CircleNode: React.FC<{ data: { label: string; selected?: boolean; color?: string; mergeSelected?: boolean } }> = ({ data }) => {
  const bgColor = data.color ?? FALLBACK_COLOR;
  const textColor = getTextColorForBg(bgColor);
  
  return (
  <div
    style={{
      width: 72,
      height: 72,
      borderRadius: 9999,
      border: data.mergeSelected
        ? '7px solid #f97316'
        : data.selected
          ? '7px solid #0ea5e9'
          : `2px solid ${bgColor}`,
      background: bgColor,
      color: textColor,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 6px 14px rgba(15,23,42,0.22)',
      position: 'relative',
      padding: '4px 6px',
      textAlign: 'center',
      fontSize: 12,
      lineHeight: 1.2,
      cursor: 'grab',
      pointerEvents: 'auto',
    }}
  >
    <Handle type="source" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
    <span 
      style={{ pointerEvents: 'none', userSelect: 'none' }}
      dangerouslySetInnerHTML={renderMath(data.label || '\u00A0')}
    />
    <Handle type="target" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
  </div>
  );
};

const nodeTypes = { circle: CircleNode };

type ClipboardData = {
  nodes: { id: string; rank: number; x: number }[];
  relations: { from: string; to: string }[];
};

type GraphViewProps = {
  graphId: 'pri' | 'sec';
};

const GraphInner: React.FC<GraphViewProps> = ({ graphId }) => {
  const graph = useLatticeStore((s) => graphId === 'pri' ? s.primary : s.secondary);
  const selectedNodes = useLatticeStore((s) => graphId === 'pri' ? s.primarySelectedNodes : s.secondarySelectedNodes);
  const setSelectedNodes = useLatticeStore((s) => s.setSelectedNodes);
  const setFocus = useLatticeStore((s) => s.setFocus);
  const focus = useLatticeStore((s) => s.foc);
  const isFocused = focus === graphId;
  const fullscreenGraph = useLatticeStore((s) => s.fullscreenGraph);
  const setFullscreen = useLatticeStore((s) => s.setFullscreen);
  
  const addNodeWithId = useLatticeStore((s) => s.addNodeWithId);
  const addRelation = useLatticeStore((s) => s.addRelation);
  const removeRelation = useLatticeStore((s) => s.removeRelation);
  const removeElementById = useLatticeStore((s) => s.removeElementById);
  const setNodeX = useLatticeStore((s) => s.setNodeX);
  const setElementName = useLatticeStore((s) => s.setElementName);
  const renameElement = useLatticeStore((s) => s.renameElement);
  const mergeElements = useLatticeStore((s) => s.mergeElements);
  const addLayer = useLatticeStore((s) => s.addLayer);
  const removeLayer = useLatticeStore((s) => s.removeLayer);
  const setColor = useLatticeStore((s) => s.setColor);
  
  const { elements, relations, positions } = graph;
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [message, setMessage] = useState<string>('Ready');
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [lastExportName, setLastExportName] = useState<string>(`lattice-${graphId === 'pri' ? 'primary' : 'secondary'}`);
  const selectedSet = useMemo(() => new Set(selectedNodes || []), [selectedNodes]);
  // Track when we're updating selection to prevent onSelectionChange feedback loop
  const isUpdatingSelectionRef = useRef(false);
  // Track initial positions for multi-node drag
  const dragStartPositionsRef = useRef<Record<string, number>>({});
  // Clipboard for copy-paste
  const clipboardRef = useRef<ClipboardData | null>(null);

  // Wrapper to set selection while preventing feedback loop
  const updateSelection = (ids: string[]) => {
    isUpdatingSelectionRef.current = true;
    setSelectedNodes(ids, graphId);
    queueMicrotask(() => { isUpdatingSelectionRef.current = false; });
  };

  // Generate a unique node ID for pasting using standard naming convention
  const generatePasteId = (originalId: string, rank: number): string => {
    // Use the same naming convention as regular node creation based on rank
    const getElementName = (rank: number, index: number): string => {
      if (rank === 0) return '⊥';
      if (rank === 1) return `${index + 1}`;
      if (rank === 2) return String.fromCharCode('a'.charCodeAt(0) + (index % 26));
      const greek = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'];
      if (rank === 3) return greek[index % greek.length];
      if (rank === 4) return String.fromCharCode('A'.charCodeAt(0) + (index % 26));
      const special = ['★', '◆', '●', '■', '▲', '◇', '○', '□', '△', '♠', '♣', '♥', '♦', '※', '§', '¶'];
      return special[index % special.length];
    };
    
    // Count existing elements at this rank
    const existing = Object.values(elements).filter((e) => e.rank === rank).length;
    let candidate = getElementName(rank, existing);
    let suffix = 1;
    while (elements[candidate]) {
      candidate = `${getElementName(rank, existing)}_${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (!isFocused) return;

      const isCtrl = e.ctrlKey || e.metaKey;

      // Copy: Ctrl+C
      if (isCtrl && e.key === 'c') {
        if (!selectedNodes || selectedNodes.length === 0) return;
        // Don't copy ⊥ or ⊤
        const copyable = selectedNodes.filter((id) => id !== '⊥' && id !== '⊤');
        if (copyable.length === 0) {
          setMessage('Cannot copy ⊥ or ⊤');
          return;
        }
        const copySet = new Set(copyable);
        // Store nodes with their ranks and positions
        const copiedNodes = copyable.map((id) => ({
          id,
          rank: elements[id]?.rank ?? 0,
          x: positions[id]?.x ?? 0,
        }));
        // Store only internal relations (both endpoints in selection)
        const copiedRelations = relations.filter(
          (r) => copySet.has(r.from) && copySet.has(r.to)
        );
        clipboardRef.current = { nodes: copiedNodes, relations: copiedRelations };
        setMessage(`Copied ${copyable.length} node(s)`);
        return;
      }

      // Paste: Ctrl+V
      if (isCtrl && e.key === 'v') {
        const clipboard = clipboardRef.current;
        if (!clipboard || clipboard.nodes.length === 0) {
          setMessage('Nothing to paste');
          return;
        }
        // Track how many nodes we've generated at each rank to avoid name collisions
        const rankCounts: Record<number, number> = {};
        clipboard.nodes.forEach((node) => {
          rankCounts[node.rank] = (rankCounts[node.rank] || 0) + 1;
        });
        
        // Create mapping from old IDs to new IDs
        const idMap: Record<string, string> = {};
        const newIds: string[] = [];
        const rankOffsets: Record<number, number> = {};
        
        clipboard.nodes.forEach((node) => {
          // Track offset for this rank
          if (rankOffsets[node.rank] === undefined) {
            rankOffsets[node.rank] = 0;
          }
          
          // Generate ID with offset to avoid collisions
          const baseCount = Object.values(elements).filter((e) => e.rank === node.rank).length;
          let candidate = generatePasteId(node.id, node.rank);
          
          // If we've already generated IDs for this rank, increment the base
          const getElementName = (rank: number, index: number): string => {
            if (rank === 0) return '⊥';
            if (rank === 1) return `${index + 1}`;
            if (rank === 2) return String.fromCharCode('a'.charCodeAt(0) + (index % 26));
            const greek = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'];
            if (rank === 3) return greek[index % greek.length];
            if (rank === 4) return String.fromCharCode('A'.charCodeAt(0) + (index % 26));
            const special = ['★', '◆', '●', '■', '▲', '◇', '○', '□', '△', '♠', '♣', '♥', '♦', '※', '§', '¶'];
            return special[index % special.length];
          };
          
          const currentIndex = baseCount + rankOffsets[node.rank];
          candidate = getElementName(node.rank, currentIndex);
          let suffix = 1;
          while (elements[candidate] || newIds.includes(candidate)) {
            candidate = `${getElementName(node.rank, currentIndex)}_${suffix}`;
            suffix += 1;
          }
          
          idMap[node.id] = candidate;
          newIds.push(candidate);
          rankOffsets[node.rank]++;
        });
        
        // Create new nodes
        clipboard.nodes.forEach((node) => {
          const newId = idMap[node.id];
          addNodeWithId(newId, node.rank, graphId);
          // Offset position slightly so pasted nodes are visible
          setNodeX(newId, node.x + 50, graphId);
        });
        // Recreate internal relations with new IDs
        clipboard.relations.forEach((rel) => {
          const newFrom = idMap[rel.from];
          const newTo = idMap[rel.to];
          if (newFrom && newTo) {
            addRelation(newFrom, newTo, graphId);
          }
        });
        // Select the newly pasted nodes
        updateSelection(newIds);
        setMessage(`Pasted ${clipboard.nodes.length} node(s)`);
        return;
      }

      if (!selectedNodes || selectedNodes.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        // Never delete zero (⊥) or one (⊤)
        const deletable = selectedNodes.filter((id) => id !== '⊥' && id !== '⊤');
        if (deletable.length === 0) {
          setMessage('Cannot delete ⊥ or ⊤');
          return;
        }
        deletable.forEach((id) => removeElementById(id, graphId));
        setMessage(`Removed node(s)`);
        updateSelection([]);
        setLastSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedNodes, removeElementById, elements, relations, positions, addNodeWithId, addRelation, graphId, isFocused]);

  const topRank = useMemo(() => {
    const ranks = Object.values(elements).map((e) => e.rank);
    return ranks.length ? Math.max(...ranks) : 0;
  }, [elements]);

  const atomLabels = useMemo(() => {
    const lowerMap: Record<string, string[]> = {};
    Object.values(elements).forEach((el) => {
      const lower: string[] = [];
      relations.forEach((r) => {
        if (r.from === el.id && (elements[r.to]?.rank ?? 0) < el.rank) lower.push(r.to);
        if (r.to === el.id && (elements[r.from]?.rank ?? 0) < el.rank) lower.push(r.from);
      });
      lowerMap[el.id] = lower;
    });

    const memo: Record<string, string[]> = {};
    const collect = (id: string): string[] => {
      if (memo[id]) return memo[id];
      const r = elements[id]?.rank;
      if (r === 1) {
        memo[id] = [id];
        return memo[id];
      }
      const atoms = new Set<string>();
      (lowerMap[id] || []).forEach((child) => collect(child).forEach((a) => atoms.add(a)));
      memo[id] = Array.from(atoms).sort();
      return memo[id];
    };

    const labels: Record<string, string> = {};
    Object.keys(elements).forEach((id) => {
      const element = elements[id];
      // Priority: name > atoms > id
      if (element.name) {
        labels[id] = element.name;
      } else {
        const atoms = collect(id);
        labels[id] = atoms.length ? joinAtomNames(atoms) : id;
      }
    });
    return labels;
  }, [elements, relations]);

  const nodes: Node[] = useMemo(() => {
    return Object.values(elements).map((el) => ({
      id: el.id,
      type: 'circle',
      position: { x: positions[el.id]?.x ?? 0, y: (topRank - el.rank) * RANK_GAP },
      data: { label: atomLabels[el.id] ?? el.id, selected: selectedSet.has(el.id), mergeSelected: mergeId === el.id, color: el.color ?? FALLBACK_COLOR },
      draggable: true,
      selected: selectedSet.has(el.id),
    }));
  }, [elements, positions, topRank, selectedSet, mergeId, atomLabels]);

  const edges: Edge[] = useMemo(() => {
    const merged = new Map<string, { a: string; b: string }>();
    relations.forEach((r) => {
      if (r.from === r.to) return;
      const [a, b] = [r.from, r.to].sort();
      merged.set(`${a}||${b}`, { a, b });
    });
    return Array.from(merged.values()).map(({ a, b }) => {
      const aRank = elements[a]?.rank ?? 0;
      const bRank = elements[b]?.rank ?? 0;
      const source = aRank < bRank ? a : b;
      const target = aRank < bRank ? b : a;
      return {
        id: `e-${source}-${target}`,
        source,
        target,
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom,
        type: 'straight',
        style: { stroke: '#0f172a', strokeWidth: 2 },
      } as Edge;
    });
  }, [relations, elements]);

  useEffect(() => {
    if (!nodes.length) return;
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 200 }), 0);
    return () => clearTimeout(t);
  }, [nodes.length, fitView]);

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    addRelation(connection.source, connection.target, graphId);
    addRelation(connection.target, connection.source, graphId);
    setMessage(`Added relation ${connection.source} ↔ ${connection.target}`);
    updateSelection([]);
    setLastSelectedId(null);
  };

  const onEdgesDelete: OnEdgesDelete = (eds) => {
    eds.forEach((e) => {
      if (!e.source || !e.target) return;
      removeRelation(e.source, e.target, graphId);
      removeRelation(e.target, e.source, graphId);
      setMessage(`Removed relation ${e.source} ↔ ${e.target}`);
    });
  };

  const onEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    if (!edge.source || !edge.target) return;
    removeRelation(edge.source, edge.target, graphId);
    removeRelation(edge.target, edge.source, graphId);
    setMessage(`Removed relation ${edge.source} ↔ ${edge.target}`);
  };

  const onNodesDelete: OnNodesDelete = (nds) => {
    // Never delete zero (⊥) or one (⊤)
    const deletable = nds.filter((n) => n.id !== '⊥' && n.id !== '⊤');
    if (deletable.length === 0) {
      setMessage('Cannot delete ⊥ or ⊤');
      return;
    }
    deletable.forEach((n) => removeElementById(n.id, graphId));
    if (deletable.length) setMessage('Removed node(s)');
    if (deletable.some((n) => selectedNodes.includes(n.id))) {
      const next = selectedNodes.filter((id) => !deletable.some((n) => n.id === id));
      updateSelection(next);
    }
  };

  const onSelectionChange: OnSelectionChangeFunc = ({ nodes: selectedFlowNodes }) => {
    // Skip if we triggered this change ourselves
    if (isUpdatingSelectionRef.current) return;
    const ids = selectedFlowNodes.map((n) => n.id).sort();
    const current = [...(selectedNodes || [])].sort();
    // Only update if selection actually changed
    if (ids.length === current.length && ids.every((id, i) => id === current[i])) return;
    updateSelection(ids);
    setLastSelectedId(ids.length === 1 ? ids[0] : null);
    if (ids.length > 0) {
      setMessage(`Selected ${ids.length} node(s)`);
    }
  };

  const onNodeDragStart = (_: React.MouseEvent | React.TouchEvent, node: Node) => {
    // Capture initial positions of all selected nodes (or just the dragged node if not selected)
    const nodesToDrag = selectedSet.has(node.id) ? selectedNodes : [node.id];
    const startPositions: Record<string, number> = {};
    nodesToDrag.forEach((id) => {
      startPositions[id] = positions[id]?.x ?? 0;
    });
    // Also store the dragged node's start position for delta calculation
    startPositions['__draggedNode__'] = node.position.x;
    startPositions['__draggedNodeId__'] = node.id as unknown as number; // hack to store id
    dragStartPositionsRef.current = startPositions;
  };

  const onNodeDrag = (_: React.MouseEvent | React.TouchEvent, node: Node) => {
    const startPositions = dragStartPositionsRef.current;
    const draggedStartX = startPositions['__draggedNode__'] ?? node.position.x;
    const delta = node.position.x - draggedStartX;

    // Move all nodes that were captured at drag start
    Object.entries(startPositions).forEach(([id, startX]) => {
      if (id.startsWith('__')) return; // skip metadata
      setNodeX(id, startX + delta);
    });
  };

  const onNodeDragStop = (_: React.MouseEvent | React.TouchEvent, node: Node) => {
    const startPositions = dragStartPositionsRef.current;
    const draggedStartX = startPositions['__draggedNode__'] ?? node.position.x;
    const delta = node.position.x - draggedStartX;

    // Final position update for all dragged nodes
    Object.entries(startPositions).forEach(([id, startX]) => {
      if (id.startsWith('__')) return; // skip metadata
      setNodeX(id, startX + delta, graphId);
    });
    dragStartPositionsRef.current = {};
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setFocus(graphId);
    
    if (mergeId && mergeId !== node.id) {
      const a = elements[mergeId];
      const b = elements[node.id];
      if (a && b && a.rank === b.rank) {
        mergeElements(mergeId, node.id, graphId);
        setMessage(`Merged ${mergeId} with ${node.id}`);
        setMergeId(null);
        updateSelection([]);
        setLastSelectedId(null);
        return;
      }
      setMessage('Can only merge nodes in the same rank');
      return;
    }

    // Ctrl/Cmd toggles selection
    const isCtrl = (_ as React.MouseEvent).ctrlKey || (_ as React.MouseEvent).metaKey;
    if (isCtrl) {
      if (selectedSet.has(node.id)) {
        updateSelection(selectedNodes.filter((id) => id !== node.id));
        setMessage(`Deselected ${node.id}`);
      } else {
        updateSelection([...selectedNodes, node.id]);
        setMessage(`Selected ${node.id}`);
      }
      setLastSelectedId(node.id);
      return;
    }

    // Shift selects the ideal (all nodes below, including self)
    const isShift = (_ as React.MouseEvent).shiftKey;
    if (isShift) {
      // Compute ideal via BFS going down to lower ranks
      const ideal: string[] = [];
      const visited = new Set<string>();
      const queue = [node.id];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (visited.has(curr)) continue;
        visited.add(curr);
        ideal.push(curr);
        const currRank = elements[curr]?.rank ?? 0;
        // Find all neighbors at lower rank (covered by curr)
        relations.forEach((r) => {
          if (r.from === curr) {
            const targetRank = elements[r.to]?.rank ?? 0;
            if (targetRank < currRank && !visited.has(r.to)) queue.push(r.to);
          }
          if (r.to === curr) {
            const targetRank = elements[r.from]?.rank ?? 0;
            if (targetRank < currRank && !visited.has(r.from)) queue.push(r.from);
          }
        });
      }
      updateSelection(ideal);
      setLastSelectedId(null);
      setMessage(`Selected ideal of ${node.id} (${ideal.length} nodes)`);
      return;
    }

    // Alt selects the filter (all nodes above, including self)
    const isAlt = (_ as React.MouseEvent).altKey;
    if (isAlt) {
      // Compute filter via BFS going up to higher ranks
      const filter: string[] = [];
      const visited = new Set<string>();
      const queue = [node.id];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (visited.has(curr)) continue;
        visited.add(curr);
        filter.push(curr);
        const currRank = elements[curr]?.rank ?? 0;
        // Find all neighbors at higher rank (covering curr)
        relations.forEach((r) => {
          if (r.from === curr) {
            const targetRank = elements[r.to]?.rank ?? 0;
            if (targetRank > currRank && !visited.has(r.to)) queue.push(r.to);
          }
          if (r.to === curr) {
            const targetRank = elements[r.from]?.rank ?? 0;
            if (targetRank > currRank && !visited.has(r.from)) queue.push(r.from);
          }
        });
      }
      updateSelection(filter);
      setLastSelectedId(null);
      setMessage(`Selected filter of ${node.id} (${filter.length} nodes)`);
      return;
    }

    // No Ctrl/Shift: if multiple nodes are selected, connect each to the clicked node
    if (selectedNodes.length > 1 && !selectedSet.has(node.id)) {
      selectedNodes.forEach((id) => {
        if (id === node.id) return;
        addRelation(id, node.id, graphId);
        addRelation(node.id, id, graphId);
      });
      setMessage(`Connected ${selectedNodes.length} node(s) ↔ ${node.id}`);
      updateSelection([]);
      setLastSelectedId(null);
      return;
    }

    // No Ctrl/Shift: if we have a last selected id and it's different, create a relation (old behavior)
    if (lastSelectedId && lastSelectedId !== node.id) {
      addRelation(lastSelectedId, node.id, graphId);
      addRelation(node.id, lastSelectedId, graphId);
      setMessage(`Added relation ${lastSelectedId} ↔ ${node.id}`);
      updateSelection([]);
      setLastSelectedId(null);
      return;
    }

    // Otherwise select this node solely
    updateSelection([node.id]);
    setLastSelectedId(node.id);
    setMessage(`Selected ${node.id}`);
  };

  const onNodeContextMenu = (e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setMergeId(node.id);
    setMessage(`Marked ${node.id} for merge`);
  };

  const onNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    const element = elements[node.id];
    const currentName = element?.name || '';
    const next = prompt('Enter node name (leave empty to show atoms)', currentName);
    if (next === null) return; // User cancelled
    const trimmed = next.trim();
    setElementName(node.id, trimmed || undefined, graphId);
    setMessage(trimmed ? `Set name for ${node.id} to "${trimmed}"` : `Cleared name for ${node.id}`);
  };

  // Use a ref to track double-click timing
  const paneClickTimeRef = useRef<number>(0);
  const DOUBLE_CLICK_DELAY = 300; // milliseconds

  const handlePaneClick = (event: React.MouseEvent) => {
    const now = Date.now();
    const timeSinceLastClick = now - paneClickTimeRef.current;
    
    if (timeSinceLastClick < DOUBLE_CLICK_DELAY) {
      // This is a double-click
      event.preventDefault();
      
      // Use ReactFlow's screenToFlowPosition to convert screen coordinates to flow coordinates
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      
      // Calculate which rank was clicked based on Y position
      // Y position formula: y = (topRank - rank) * RANK_GAP
      // Therefore: rank = topRank - (y / RANK_GAP)
      const calculatedRank = topRank - (position.y / RANK_GAP);
      
      // Add bias to account for node visual size (72px diameter)
      // When clicking on a node, we're likely clicking in its lower half
      let rank = Math.round(calculatedRank + 0.25);
      
      // Clamp to valid range (0 to topRank)
      rank = Math.max(0, Math.min(topRank, rank));
      
      // Generate a unique node ID for this rank
      const getElementName = (rank: number, index: number): string => {
        if (rank === 0) return '⊥';
        if (rank === 1) return `${index + 1}`;
        if (rank === 2) return String.fromCharCode('a'.charCodeAt(0) + (index % 26));
        const greek = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'];
        if (rank === 3) return greek[index % greek.length];
        if (rank === 4) return String.fromCharCode('A'.charCodeAt(0) + (index % 26));
        const special = ['★', '◆', '●', '■', '▲', '◇', '○', '□', '△', '♠', '♣', '♥', '♦', '※', '§', '¶'];
        return special[index % special.length];
      };
      
      const existing = Object.values(elements).filter((e) => e.rank === rank).length;
      let candidate = getElementName(rank, existing);
      let suffix = 1;
      while (elements[candidate]) {
        candidate = `${getElementName(rank, existing)}_${suffix}`;
        suffix += 1;
      }
      
      // Add the node at the clicked X position (center the node on cursor)
      addNodeWithId(candidate, rank, graphId);
      setNodeX(candidate, position.x - 36, graphId); // 36 is half of 72px node width
      updateSelection([candidate]);
      setMessage(`Added node ${candidate} at rank ${rank}`);
      
      // Reset the timer to prevent triple-click issues
      paneClickTimeRef.current = 0;
    } else {
      // Single click - normal behavior
      setFocus(graphId);
      updateSelection([]);
      setLastSelectedId(null);
      setMergeId(null);
      setMessage('Ready');
      
      // Record this click time
      paneClickTimeRef.current = now;
    }
  };

  const rearrange = () => {
    const spacing = 140;

    // If nodes are selected, only rearrange those around their common center
    if (selectedNodes && selectedNodes.length > 0) {
      const validIds = selectedNodes.filter((id) => elements[id]);
      if (validIds.length === 0) return;

      // Separate zero/one from other nodes - they stay at global center (0)
      const specialIds = validIds.filter((id) => id === '⊥' || id === '⊤');
      const regularIds = validIds.filter((id) => id !== '⊥' && id !== '⊤');

      // Position zero/one at global center
      specialIds.forEach((id) => setNodeX(id, 0, graphId));

      // Calculate common center across regular selected nodes
      if (regularIds.length > 0) {
        const commonCenterX = regularIds.reduce((sum, id) => sum + (positions[id]?.x ?? 0), 0) / regularIds.length;

        // Group by rank
        const byRank: Record<number, string[]> = {};
        regularIds.forEach((id) => {
          const el = elements[id];
          if (!byRank[el.rank]) byRank[el.rank] = [];
          byRank[el.rank].push(id);
        });

        // Rearrange each rank around the common center (preserving left-to-right order)
        Object.entries(byRank).forEach(([, ids]) => {
          ids.sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0));
          const center = (ids.length - 1) / 2;
          ids.forEach((id, idx) => {
            const x = commonCenterX + (idx - center) * spacing;
            setNodeX(id, x, graphId);
          });
        });
      }

      setMergeId(null);
      setMessage(`Rearranged ${selectedNodes.length} selected node(s)`);
      return;
    }

    // Otherwise rearrange all nodes (preserving left-to-right order)
    const byRank: Record<number, string[]> = {};
    Object.values(elements).forEach((el) => {
      if (!byRank[el.rank]) byRank[el.rank] = [];
      byRank[el.rank].push(el.id);
    });
    Object.entries(byRank).forEach(([, ids]) => {
      ids.sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0));
      const center = (ids.length - 1) / 2;
      ids.forEach((id, idx) => {
        const x = (idx - center) * spacing;
        setNodeX(id, x, graphId);
      });
    });
    updateSelection([]);
    setMergeId(null);
    setMessage('Rearranged nodes per layer');
  };

  const handleExportSVG = () => {
    const name = prompt('Export name:', lastExportName);
    if (!name) return;

    try {
      const graph = { elements, relations, positions };
      const hasSelection = selectedNodes && selectedNodes.length > 0;
      const exportSet = hasSelection ? new Set(selectedNodes) : null;

      const exportElements = exportSet
        ? Object.values(elements).filter((el) => exportSet.has(el.id))
        : Object.values(elements);

      const exportRelations = exportSet
        ? relations.filter((r) => exportSet.has(r.from) && exportSet.has(r.to))
        : relations;

      const exportTopRank = Math.max(0, ...exportElements.map((el) => el.rank));

      const svgNodes = exportElements.map((el) => ({
        id: el.id,
        x: positions[el.id]?.x ?? 0,
        y: (exportTopRank - el.rank) * RANK_GAP,
        label: getNodeDisplayLabel(el.id, graph),
        color: el.color ?? FALLBACK_COLOR,
      }));

      const svgEdges = exportRelations.map((r) => ({
        source: r.from,
        target: r.to,
      }));

      const svg = generateGraphSVG(svgNodes, svgEdges);
      const pdfFilename = `${name}.pdf`;
      setLastExportName(name);

      exportPDFToServer(pdfFilename, svg).then((response) => {
        if (response.success) {
          const suffix = hasSelection ? ` (${selectedNodes.length} nodes)` : '';
          setMessage(`Exported "${name}" to ${response.path}${suffix}`);
        } else {
          setMessage(`Export failed: ${response.error}`);
        }
      });
    } catch (error) {
      setMessage('Failed to export');
      console.error(error);
    }
  };

  return (
    <div style={{ height: '100%', minHeight: 620, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700 }}>{graphId === 'pri' ? 'Primary' : 'Secondary'} Graph</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => addLayer(graphId)} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>+ Layer</button>
          <button onClick={() => removeLayer(graphId)} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>- Layer</button>
          <button onClick={rearrange} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Rearrange</button>
          <button onClick={handleExportSVG} style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Export</button>
          <button
            onClick={() => setFullscreen(fullscreenGraph === graphId ? null : graphId)}
            style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: fullscreenGraph === graphId ? 700 : 400 }}
          >{fullscreenGraph === graphId ? 'Exit Fullscreen' : 'Fullscreen'}</button>
          <div style={{ color: '#475569', fontSize: 12 }}>Drag nodes • Connect to add edges • Delete to remove</div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 500 }} id={`graph-view-${graphId}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onEdgeClick={onEdgeClick}
          onNodesDelete={onNodesDelete}
          onSelectionChange={onSelectionChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onNodeDrag={onNodeDrag}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={handlePaneClick}
          // Enable selecting nodes by dragging a selection box
          selectNodesOnDrag
          fitView
          fitViewOptions={{ padding: 0.25 }}
          nodesDraggable
          elementsSelectable
          zoomOnDoubleClick={false}
          deleteKeyCode={isFocused ? ['Delete', 'Backspace'] : []}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'straight', style: { stroke: '#0f172a', strokeWidth: 2 } }}
          connectionLineType={ConnectionLineType.Straight}
          minZoom={0.1}
          maxZoom={4}
        >
          <Background gap={24} color="#e2e8f0" />
          <MiniMap pannable zoomable nodeColor={() => '#0f172a'} maskColor="rgba(15,23,42,0.08)" />
          <Controls position="bottom-right" />
        </ReactFlow>
      </div>
    </div>
  );
};

export const GraphView: React.FC<GraphViewProps> = ({ graphId }) => (
  <GraphInner graphId={graphId} />
);
