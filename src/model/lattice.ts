export type Relation = { from: string; to: string };

export type LatticeElement = {
  id: string;
  rank: number;
  color?: string;
  name?: string;
};

export type LatticeStateShape = {
  elements: Record<string, LatticeElement>;
  relations: Relation[];
  positions: Record<string, { x: number }>; // y is derived from rank
};

const DEFAULT_COLOR = '#0f172a';

const greek = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'];
const special = ['★', '◆', '●', '■', '▲', '◇', '○', '□', '△', '♠', '♣', '♥', '♦', '※', '§', '¶'];

export function getElementName(rank: number, index: number): string {
  if (rank === 0) return '⊥';
  if (rank === 1) return `${index + 1}`;
  if (rank === 2) return String.fromCharCode('a'.charCodeAt(0) + (index % 26));
  if (rank === 3) return greek[index % greek.length];
  if (rank === 4) return String.fromCharCode('A'.charCodeAt(0) + (index % 26));
  return special[index % special.length];
}

export function createInitialLattice(): LatticeStateShape {
  const elements: Record<string, LatticeElement> = {
    '⊥': { id: '⊥', rank: 0, color: DEFAULT_COLOR },
    '1': { id: '1', rank: 1, color: DEFAULT_COLOR },
    '2': { id: '2', rank: 1, color: DEFAULT_COLOR },
    '3': { id: '3', rank: 1, color: DEFAULT_COLOR },
    a: { id: 'a', rank: 2, color: DEFAULT_COLOR },
    b: { id: 'b', rank: 2, color: DEFAULT_COLOR },
    c: { id: 'c', rank: 2, color: DEFAULT_COLOR },
    '⊤': { id: '⊤', rank: 3, color: DEFAULT_COLOR },
  };

  const relations: Relation[] = [
    { from: '⊥', to: '1' },
    { from: '⊥', to: '2' },
    { from: '⊥', to: '3' },
    { from: '1', to: 'a' },
    { from: '1', to: 'b' },
    { from: '2', to: 'a' },
    { from: '2', to: 'c' },
    { from: '3', to: 'b' },
    { from: '3', to: 'c' },
    { from: 'a', to: '⊤' },
    { from: 'b', to: '⊤' },
    { from: 'c', to: '⊤' },
  ];

  const positions: Record<string, { x: number }> = {};
  const layers = getLayers({ elements });
  Object.entries(layers).forEach(([rankStr, ids]) => {
    const rank = Number(rankStr);
    ids.forEach((id, idx) => {
      positions[id] = { x: (idx - ids.length / 2) * 140 };
    });
  });

  return { elements, relations, positions };
}

export function getLayers(state: Pick<LatticeStateShape, 'elements'>): Record<number, string[]> {
  const layers: Record<number, string[]> = {};
  Object.values(state.elements).forEach((el) => {
    if (!layers[el.rank]) layers[el.rank] = [];
    layers[el.rank].push(el.id);
  });
  Object.keys(layers).forEach((rank) => {
    layers[Number(rank)].sort();
  });
  return layers;
}

export function maxRank(state: Pick<LatticeStateShape, 'elements'>): number {
  const ranks = Object.values(state.elements).map((e) => e.rank);
  return ranks.length ? Math.max(...ranks) : 0;
}

export function nextElementName(state: LatticeStateShape, rank: number): string {
  const existing = Object.values(state.elements).filter((e) => e.rank === rank).length;
  let candidate = getElementName(rank, existing);
  let suffix = 1;
  while (state.elements[candidate]) {
    candidate = `${getElementName(rank, existing)}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function addElement(state: LatticeStateShape, rank: number): LatticeStateShape {
  if (rank <= 0) return state;
  const top = maxRank(state);
  // Prevent adding alongside the unique top element at the highest rank.
  if (rank === top && state.elements['⊤']?.rank === top) return state;
  if (rank > top) return state;
  const id = nextElementName(state, rank);
  const elements = { ...state.elements, [id]: { id, rank, color: DEFAULT_COLOR } };
  const positions = { ...state.positions, [id]: { x: 0 } };
  return { ...state, elements, positions };
}

export function addElementWithId(state: LatticeStateShape, id: string, rank: number): LatticeStateShape {
  if (rank < 0) return state;
  if (state.elements[id]) return state; // ID already exists
  const top = maxRank(state);
  // Prevent adding alongside the unique top element at the highest rank (unless it's ⊤ itself).
  if (rank === top && state.elements['⊤']?.rank === top && id !== '⊤') return state;
  if (rank > top + 1) return state; // Can only add one layer above current max
  const elements = { ...state.elements, [id]: { id, rank, color: DEFAULT_COLOR } };
  const positions = { ...state.positions, [id]: { x: 0 } };
  return { ...state, elements, positions };
}

export function removeElement(state: LatticeStateShape, rank: number): LatticeStateShape {
  const ids = Object.values(state.elements)
    .filter((e) => e.rank === rank)
    .map((e) => e.id)
    .sort();
  if (ids.length === 0) return state;
  const removeId = ids[ids.length - 1];
  if (removeId === '⊤') return state;
  const elements = { ...state.elements };
  delete elements[removeId];
  const relations = state.relations.filter((r) => r.from !== removeId && r.to !== removeId);
  const positions = { ...state.positions };
  delete positions[removeId];
  return { ...state, elements, relations, positions };
}

export function removeElementById(state: LatticeStateShape, id: string): LatticeStateShape {
  if (id === '⊤') return state;
  if (!state.elements[id]) return state;
  const elements = { ...state.elements };
  delete elements[id];
  const relations = state.relations.filter((r) => r.from !== id && r.to !== id);
  const positions = { ...state.positions };
  delete positions[id];
  return { ...state, elements, relations, positions };
}

export function addRelation(state: LatticeStateShape, from: string, to: string): LatticeStateShape {
  if (from === to) return state;
  if (!state.elements[from] || !state.elements[to]) return state;
  if (state.relations.some((r) => r.from === from && r.to === to)) return state;
  return { ...state, relations: [...state.relations, { from, to }] };
}

export function removeRelation(state: LatticeStateShape, from: string, to: string): LatticeStateShape {
  return { ...state, relations: state.relations.filter((r) => !(r.from === from && r.to === to)) };
}

export function renameElement(state: LatticeStateShape, id: string, nextId: string): LatticeStateShape {
  const trimmed = nextId.trim();
  if (!state.elements[id]) return state;
  if (!trimmed) return state;
  if (trimmed === id) return state;
  if (state.elements[trimmed]) return state;
  if (id === '⊥' || id === '⊤') return state; // keep distinguished top/bottom

  const el = state.elements[id];
  const elements = { ...state.elements, [trimmed]: { ...el, id: trimmed } };
  delete elements[id];

  const relations = state.relations.map((r) => ({
    from: r.from === id ? trimmed : r.from,
    to: r.to === id ? trimmed : r.to,
  }));

  const positions = { ...state.positions, [trimmed]: state.positions[id] ?? { x: 0 } };
  delete positions[id];

  return { ...state, elements, relations, positions };
}

export function setElementColor(state: LatticeStateShape, id: string, color: string): LatticeStateShape {
  if (!state.elements[id]) return state;
  const elements = { ...state.elements, [id]: { ...state.elements[id], color } };
  return { ...state, elements };
}

export function setElementName(state: LatticeStateShape, id: string, name?: string): LatticeStateShape {
  if (!state.elements[id]) return state;
  const element = { ...state.elements[id] };
  if (name) {
    element.name = name;
  } else {
    delete element.name;
  }
  const elements = { ...state.elements, [id]: element };
  return { ...state, elements };
}

export function mergeElements(state: LatticeStateShape, keepId: string, dropId: string): LatticeStateShape {
  if (keepId === dropId) return state;
  const keep = state.elements[keepId];
  const drop = state.elements[dropId];
  if (!keep || !drop) return state;
  if (keep.rank !== drop.rank) return state;
  if (dropId === '⊥' || dropId === '⊤') return state;

  const elements = { ...state.elements };
  delete elements[dropId];

  const color = keep.color ?? drop.color;
  elements[keepId] = { ...keep, color };

  const relSet = new Map<string, Relation>();
  state.relations.forEach((r) => {
    const from = r.from === dropId ? keepId : r.from;
    const to = r.to === dropId ? keepId : r.to;
    if (from === to) return;
    const key = `${from}||${to}`;
    if (!relSet.has(key)) relSet.set(key, { from, to });
  });

  const positions = { ...state.positions };
  delete positions[dropId];

  return { ...state, elements, relations: Array.from(relSet.values()), positions };
}

export function addLayer(state: LatticeStateShape): LatticeStateShape {
  const currentTop = maxRank(state);
  const intermediateRank = currentTop;
  const newTopRank = currentTop + 1;

  // Find the current top element (⊤ or whatever is at the highest rank)
  const currentTopElements = Object.values(state.elements).filter((el) => el.rank === currentTop);

  // Move current top elements up by 1 rank
  const elements: Record<string, LatticeElement> = {};
  Object.values(state.elements).forEach((el) => {
    if (el.rank === currentTop) {
      elements[el.id] = { ...el, rank: el.rank + 1 };
    } else {
      elements[el.id] = { ...el };
    }
  });

  // Create a new intermediate element at the current top rank
  const newElementName = nextElementName(state, intermediateRank);
  elements[newElementName] = {
    id: newElementName,
    rank: intermediateRank,
    color: DEFAULT_COLOR,
  };

  // Update relations:
  // 1. Remove all relations that pointed to OR from the old top elements
  const oldTopIds = currentTopElements.map(el => el.id);
  let relations = state.relations.filter((r) => !oldTopIds.includes(r.to) && !oldTopIds.includes(r.from));

  // 2. Add new relations pointing to the intermediate element (redirecting the old connections that pointed to top)
  state.relations.forEach((r) => {
    if (oldTopIds.includes(r.to)) {
      relations.push({ from: r.from, to: newElementName });
    }
  });

  // 3. Add new relations from the intermediate element (redirecting the old connections from top)
  state.relations.forEach((r) => {
    if (oldTopIds.includes(r.from)) {
      relations.push({ from: newElementName, to: r.to });
    }
  });

  // 4. Add relations from new intermediate element to the moved top elements
  currentTopElements.forEach((el) => {
    relations.push({ from: newElementName, to: el.id });
  });

  // Keep positions
  const positions = { ...state.positions };
  return { ...state, elements, relations, positions };
}

export function removeLayer(state: LatticeStateShape): LatticeStateShape {
  const currentTop = maxRank(state);
  if (currentTop <= 1) return state;

  // Remove the second highest layer (currentTop - 1)
  const layerToRemove = currentTop - 1;

  const elements: Record<string, LatticeElement> = {};
  const positions = { ...state.positions };
  
  Object.values(state.elements).forEach((el) => {
    if (el.rank === layerToRemove) {
      // Delete elements at the layer being removed
      delete positions[el.id];
    } else if (el.rank > layerToRemove) {
      // Move all elements above the removed layer down by one rank
      elements[el.id] = { ...el, rank: el.rank - 1 };
    } else {
      // Keep elements below the removed layer as is
      elements[el.id] = el;
    }
  });

  const relations = state.relations.filter((r) => elements[r.from] && elements[r.to]);
  return { ...state, elements, relations, positions };
}

export function setNodeX(state: LatticeStateShape, id: string, x: number): LatticeStateShape {
  if (!state.elements[id]) return state;
  return { ...state, positions: { ...state.positions, [id]: { x } } };
}

// ============================================================================
// Geometric Lattice Generators
// ============================================================================

/**
 * Helper function to position elements in a generated lattice.
 * Distributes elements evenly across horizontal space within each rank.
 */
function positionLatticeElements(elements: Record<string, LatticeElement>): Record<string, { x: number }> {
  const positions: Record<string, { x: number }> = {};
  const layers = getLayers({ elements });
  
  Object.entries(layers).forEach(([rankStr, ids]) => {
    ids.forEach((id, idx) => {
      positions[id] = { x: (idx - ids.length / 2) * 120 };
    });
  });
  
  return positions;
}

/**
 * Generate Boolean lattice B_n (power set of {1,2,...,n}).
 * 
 * The Boolean lattice represents all subsets of an n-element set,
 * ordered by inclusion. It has 2^n elements and height n.
 * 
 * @param n - Number of base elements (1-5 for reasonable visualization)
 * @returns Standalone Boolean lattice
 */
export function generateBooleanLattice(n: number): LatticeStateShape {
  if (n < 1 || n > 5) n = 3; // Limit to reasonable size
  
  const elements: Record<string, LatticeElement> = {};
  const relations: Relation[] = [];
  
  // Generate all subsets
  const subsets: number[][] = [[]];
  for (let i = 1; i <= n; i++) {
    const len = subsets.length;
    for (let j = 0; j < len; j++) {
      subsets.push([...subsets[j], i]);
    }
  }
  
  // Create elements (use set notation for labels)
  subsets.forEach((subset) => {
    const id = subset.length === 0 ? '∅' : `{${subset.join(',')}}`;
    elements[id] = {
      id,
      rank: subset.length,
      color: DEFAULT_COLOR,
    };
  });
  
  // Create covering relations (a covers b if |a| = |b| + 1 and b ⊂ a)
  subsets.forEach((a) => {
    subsets.forEach((b) => {
      if (a.length === b.length + 1) {
        // Check if b ⊂ a
        if (b.every(x => a.includes(x))) {
          const idA = a.length === 0 ? '∅' : `{${a.join(',')}}`;
          const idB = b.length === 0 ? '∅' : `{${b.join(',')}}`;
          relations.push({ from: idB, to: idA });
        }
      }
    });
  });
  
  // Position elements
  const positions = positionLatticeElements(elements);
  
  return { elements, relations, positions };
}

/**
 * Generate Partition lattice Π_n (all partitions of {1,2,...,n}).
 * 
 * The partition lattice represents all ways to partition an n-element set,
 * ordered by refinement. This is a non-distributive geometric lattice.
 * 
 * @param n - Number of elements to partition (2-4 for reasonable visualization)
 * @returns Standalone partition lattice
 */
export function generatePartitionLattice(n: number): LatticeStateShape {
  if (n < 2 || n > 4) n = 3; // Limit to reasonable size
  
  const elements: Record<string, LatticeElement> = {};
  const relations: Relation[] = [];
  
  // Generate all partitions
  const partitions: number[][][] = [];
  
  function generatePartitionsHelper(arr: number[], current: number[][]): void {
    if (arr.length === 0) {
      partitions.push(current.map(p => [...p]).sort((a, b) => a[0] - b[0]));
      return;
    }
    
    const [first, ...rest] = arr;
    
    // Add to existing parts
    for (let i = 0; i < current.length; i++) {
      const newCurrent = current.map((p, idx) => idx === i ? [...p, first] : [...p]);
      generatePartitionsHelper(rest, newCurrent);
    }
    
    // Create new part
    generatePartitionsHelper(rest, [...current, [first]]);
  }
  
  generatePartitionsHelper(Array.from({ length: n }, (_, i) => i + 1), []);
  
  // Create elements (use partition notation)
  partitions.forEach((partition) => {
    const id = partition.map(p => p.join(',')).join('|');
    const rank = n - partition.length; // Rank = n - numBlocks (discrete=0, trivial=n-1)
    elements[id] = {
      id,
      rank,
      color: DEFAULT_COLOR,
    };
  });
  
  // Create covering relations (π covers σ if π has one more block)
  partitions.forEach((pi) => {
    partitions.forEach((sigma) => {
      if (sigma.length === pi.length + 1) {
        // Check if sigma refines pi (sigma has one more split)
        // σ refines π if we can merge two blocks of σ to get π
        let canMerge = false;
        for (let i = 0; i < sigma.length; i++) {
          for (let j = i + 1; j < sigma.length; j++) {
            const merged = sigma.filter((_, idx) => idx !== i && idx !== j);
            merged.push([...sigma[i], ...sigma[j]].sort((a, b) => a - b));
            merged.sort((a, b) => a[0] - b[0]);
            
            const mergedStr = merged.map(p => p.join(',')).join('|');
            const piStr = pi.map(p => p.join(',')).join('|');
            if (mergedStr === piStr) {
              canMerge = true;
              break;
            }
          }
          if (canMerge) break;
        }
        
        if (canMerge) {
          const idPi = pi.map(p => p.join(',')).join('|');
          const idSigma = sigma.map(p => p.join(',')).join('|');
          relations.push({ from: idSigma, to: idPi });
        }
      }
    });
  });
  
  // Position elements
  const positions = positionLatticeElements(elements);
  
  return { elements, relations, positions };
}


/**
 * Merge a generated lattice into the existing state.
 * 
 * The generated lattice's bottom element (⊥) is merged with the existing bottom,
 * and the generated top element (⊤) is renamed to avoid conflicts. Layers are
 * added to ensure the existing ⊤ remains at the highest rank.
 * 
 * @param state - The current lattice state
 * @param generated - The generated lattice to merge
 * @returns Updated lattice state with merged elements
 */
export function addGeneratedLattice(state: LatticeStateShape, generated: LatticeStateShape): LatticeStateShape {
  let currentState = state;
  const currentMaxRank = maxRank(state);
  const generatedMaxRank = maxRank(generated);
  
  const generatedBottom = Object.values(generated.elements).find(e => e.rank === 0);
  if (!generatedBottom) return state;
  
  // Ensure existing ⊤ is above generated lattice by adding layers
  while (maxRank(currentState) < generatedMaxRank + 1) {
    currentState = addLayer(currentState);
  }
  
  const elements = { ...currentState.elements };
  const positions = { ...currentState.positions };
  let relations = [...currentState.relations];
  
  // Calculate X-offset: position new elements to the right of existing ones
  const existingXValues = Object.values(currentState.positions).map(p => p.x);
  const maxX = existingXValues.length > 0 ? Math.max(...existingXValues) : 0;
  
  const generatedXValues = Object.values(generated.positions).map(p => p.x);
  const minGeneratedX = generatedXValues.length > 0 ? Math.min(...generatedXValues) : 0;
  
  const offsetX = maxX - minGeneratedX + 150;
  
  // Map generated IDs to new unique IDs
  const idMap: Record<string, string> = {};
  let idCounter = 1;
  
  Object.values(generated.elements).forEach((el) => {
    // Map generated bottom to existing ⊥
    if (el.rank === 0) {
      idMap[el.id] = '⊥';
      return;
    }
    
    // Generate unique ID (rename ⊤ to avoid conflicts)
    let newId = el.id;
    if (newId === '⊤' || newId.includes('⊤')) {
      newId = `T_${idCounter}`;
      idCounter++;
    }
    
    while (elements[newId]) {
      newId = `${el.id}_${idCounter}`;
      idCounter++;
    }
    
    idMap[el.id] = newId;
    
    elements[newId] = {
      ...el,
      id: newId,
      rank: el.rank,
    };
    
    const baseX = generated.positions[el.id]?.x || 0;
    positions[newId] = { x: baseX + offsetX };
  });
  
  // Add relations with mapped IDs
  generated.relations.forEach((rel) => {
    const fromId = idMap[rel.from];
    const toId = idMap[rel.to];
    
    if (!fromId || !toId) return;
    
    const exists = relations.some(r => r.from === fromId && r.to === toId);
    if (!exists) {
      relations.push({ from: fromId, to: toId });
    }
  });
  
  return { ...currentState, elements, relations, positions };
}

// ============================================================================
// Subspace Lattice L_n(F_q)
// ============================================================================

/** Modular subtraction in F_p. */
function modSub(a: number, b: number, p: number): number {
  return ((a - b) % p + p) % p;
}

/** Modular multiplication in F_p. */
function modMul(a: number, b: number, p: number): number {
  return (a * b) % p;
}

/**
 * Represents a subspace by its RREF basis matrix (k rows × n cols).
 * Each row is an array of length n with values in {0, ..., q-1}.
 */
type SubspaceInfo = {
  id: string;
  dim: number;
  rref: number[][]; // k×n matrix rows
};

/**
 * Generate a canonical string ID for a subspace given its RREF.
 * - dim 0: "0"
 * - dim n (full space): "F^n"
 * - otherwise: angle-bracket notation like ⟨100,010⟩ (F_2) or ⟨1·0·2,0·1·0⟩ (larger fields)
 */
function subspaceId(rref: number[][], n: number, q: number): string {
  if (rref.length === 0) return '0';
  if (rref.length === n) return `F^${n}`;
  if (q <= 2) {
    // compact notation without separators
    const rows = rref.map(r => r.join(''));
    return `⟨${rows.join(',')}⟩`;
  }
  // use dot separators for readability
  const rows = rref.map(r => r.join('·'));
  return `⟨${rows.join(',')}⟩`;
}

/**
 * Enumerate all k-element subsets of {0, 1, ..., n-1}.
 */
function kSubsets(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  if (k > n) return [];
  const result: number[][] = [];
  function recurse(start: number, current: number[]) {
    if (current.length === k) { result.push([...current]); return; }
    for (let i = start; i < n; i++) {
      current.push(i);
      recurse(i + 1, current);
      current.pop();
    }
  }
  recurse(0, []);
  return result;
}

/**
 * Enumerate all subspaces of F_q^n by generating every valid RREF matrix.
 */
function enumerateSubspaces(n: number, q: number): SubspaceInfo[] {
  const subspaces: SubspaceInfo[] = [];

  // dim 0: zero subspace
  subspaces.push({ id: subspaceId([], n, q), dim: 0, rref: [] });

  for (let k = 1; k <= n; k++) {
    // For each choice of k pivot columns
    for (const pivots of kSubsets(n, k)) {
      const pivotSet = new Set(pivots);

      // Identify free positions: for each non-pivot column j and row i,
      // the entry is free iff pivots[i] < j (column is right of row's pivot).
      const freePositions: Array<{ row: number; col: number }> = [];
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < n; j++) {
          if (!pivotSet.has(j) && pivots[i] < j) {
            freePositions.push({ row: i, col: j });
          }
        }
      }

      // Enumerate all F_q assignments to free positions
      const totalAssignments = Math.pow(q, freePositions.length);
      for (let a = 0; a < totalAssignments; a++) {
        // Build the RREF matrix
        const matrix: number[][] = Array.from({ length: k }, () => new Array(n).fill(0));

        // Set pivots
        for (let i = 0; i < k; i++) {
          matrix[i][pivots[i]] = 1;
        }

        // Set free entries from the assignment number
        let remaining = a;
        for (const { row, col } of freePositions) {
          matrix[row][col] = remaining % q;
          remaining = Math.floor(remaining / q);
        }

        subspaces.push({
          id: subspaceId(matrix, n, q),
          dim: k,
          rref: matrix,
        });
      }
    }
  }

  return subspaces;
}

/**
 * Check if subspace V (given by RREF) is contained in subspace W (given by RREF).
 * Reduces each basis vector of V against W's RREF. If all reduce to zero, V ⊆ W.
 */
function isContainedIn(smaller: number[][], larger: number[][], n: number, q: number): boolean {
  // Find pivot columns of larger
  const pivotCols: number[] = [];
  for (const row of larger) {
    for (let j = 0; j < n; j++) {
      if (row[j] !== 0) { pivotCols.push(j); break; }
    }
  }

  for (const vec of smaller) {
    const v = [...vec];
    for (let i = 0; i < larger.length; i++) {
      const pivotCol = pivotCols[i];
      if (v[pivotCol] !== 0) {
        const factor = v[pivotCol]; // pivot is 1, so factor = v[pivotCol]
        for (let j = 0; j < n; j++) {
          v[j] = modSub(v[j], modMul(factor, larger[i][j], q), q);
        }
      }
    }
    // Check if v is zero
    if (v.some(x => x !== 0)) return false;
  }
  return true;
}

/**
 * Generate the subspace lattice L_n(F_q).
 *
 * Elements: all subspaces of F_q^n, ordered by inclusion.
 * Atoms: 1-dimensional subspaces (lines through the origin).
 *
 * @param n - Dimension of the vector space (1-4)
 * @param q - Prime field size (2, 3, 5, or 7)
 * @returns Standalone subspace lattice
 */
export function generateSubspaceLattice(n: number, q: number): LatticeStateShape {
  if (n < 1 || n > 4) n = 3;
  if (![2, 3, 5, 7].includes(q)) q = 2;

  const subspaces = enumerateSubspaces(n, q);
  const elements: Record<string, LatticeElement> = {};
  const relations: Relation[] = [];

  // Create elements
  for (const s of subspaces) {
    elements[s.id] = { id: s.id, rank: s.dim, color: DEFAULT_COLOR };
  }

  // Compute covering relations: dim(W) = dim(V) + 1 and V ⊂ W
  const byDim = new Map<number, SubspaceInfo[]>();
  for (const s of subspaces) {
    if (!byDim.has(s.dim)) byDim.set(s.dim, []);
    byDim.get(s.dim)!.push(s);
  }

  for (let k = 0; k < n; k++) {
    const lowerList = byDim.get(k) ?? [];
    const upperList = byDim.get(k + 1) ?? [];
    for (const lower of lowerList) {
      for (const upper of upperList) {
        if (isContainedIn(lower.rref, upper.rref, n, q)) {
          relations.push({ from: lower.id, to: upper.id });
        }
      }
    }
  }

  const positions = positionLatticeElements(elements);
  return { elements, relations, positions };
}

// ============================================================================
// Graphic Lattice M(G) — Lattice of flats of the cycle matroid
// ============================================================================

export type GraphType = 'Kn' | 'Cn' | 'Kmn' | 'Pn';

/**
 * Build an edge list for a predefined graph type.
 * Returns vertices (1-indexed) and edges as [u, v] pairs.
 */
function buildGraph(graphType: GraphType, params: number[]): { vertices: number[]; edges: [number, number][] } {
  switch (graphType) {
    case 'Kn': {
      const n = Math.max(3, Math.min(params[0] ?? 4, 5));
      const vertices = Array.from({ length: n }, (_, i) => i + 1);
      const edges: [number, number][] = [];
      for (let i = 1; i <= n; i++)
        for (let j = i + 1; j <= n; j++)
          edges.push([i, j]);
      return { vertices, edges };
    }
    case 'Cn': {
      const n = Math.max(3, Math.min(params[0] ?? 5, 7));
      const vertices = Array.from({ length: n }, (_, i) => i + 1);
      const edges: [number, number][] = [];
      for (let i = 1; i < n; i++) edges.push([i, i + 1]);
      edges.push([n, 1]);
      return { vertices, edges };
    }
    case 'Kmn': {
      const m = Math.max(2, Math.min(params[0] ?? 2, 3));
      const nn = Math.max(2, Math.min(params[1] ?? 3, 4));
      const vertices = Array.from({ length: m + nn }, (_, i) => i + 1);
      const edges: [number, number][] = [];
      for (let i = 1; i <= m; i++)
        for (let j = m + 1; j <= m + nn; j++)
          edges.push([i, j]);
      return { vertices, edges };
    }
    case 'Pn': {
      const n = Math.max(3, Math.min(params[0] ?? 5, 7));
      const vertices = Array.from({ length: n }, (_, i) => i + 1);
      const edges: [number, number][] = [];
      for (let i = 1; i < n; i++) edges.push([i, i + 1]);
      return { vertices, edges };
    }
  }
}

/**
 * Check if a set of vertices induces a connected subgraph.
 * Uses BFS/DFS on the subgraph restricted to the given vertex set.
 */
function isConnected(block: number[], adjacency: Map<number, Set<number>>): boolean {
  if (block.length <= 1) return true;
  const blockSet = new Set(block);
  const visited = new Set<number>();
  const queue = [block[0]];
  visited.add(block[0]);
  while (queue.length > 0) {
    const v = queue.shift()!;
    for (const u of adjacency.get(v) ?? []) {
      if (blockSet.has(u) && !visited.has(u)) {
        visited.add(u);
        queue.push(u);
      }
    }
  }
  return visited.size === block.length;
}

/**
 * Canonical string ID for a partition of vertices.
 * Blocks are sorted internally and then by first element.
 * Format: {1,2}{3}{4}
 */
function partitionId(partition: number[][]): string {
  const sorted = partition
    .map(b => [...b].sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
  return sorted.map(b => `{${b.join(',')}}`).join('');
}

/**
 * Enumerate all partitions of vertices where each block induces
 * a connected subgraph of G. These correspond to flats of M(G).
 * Uses BFS starting from the discrete partition.
 */
function enumerateConnectedPartitions(
  vertices: number[],
  adjacency: Map<number, Set<number>>
): { id: string; partition: number[][]; rank: number }[] {
  const n = vertices.length;
  const results = new Map<string, { partition: number[][]; rank: number }>();

  // Start with discrete partition
  const discrete = vertices.map(v => [v]);
  const discreteId = partitionId(discrete);
  results.set(discreteId, { partition: discrete, rank: 0 });

  const queue = [discrete];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Try merging every pair of blocks that share an edge
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        // Check if blocks i and j are adjacent (share an edge in G)
        let hasEdge = false;
        outer:
        for (const u of current[i]) {
          for (const v of current[j]) {
            if (adjacency.get(u)?.has(v)) { hasEdge = true; break outer; }
          }
        }
        if (!hasEdge) continue;

        // Merge blocks i and j
        const merged = [...current[i], ...current[j]];

        // The merged block is necessarily connected since both original blocks
        // are connected and share an edge. But verify for safety.
        if (!isConnected(merged, adjacency)) continue;

        const newPartition = current.filter((_, idx) => idx !== i && idx !== j);
        newPartition.push(merged);

        const id = partitionId(newPartition);
        if (!results.has(id)) {
          const rank = n - newPartition.length;
          results.set(id, { partition: newPartition, rank });
          queue.push(newPartition);
        }
      }
    }
  }

  return Array.from(results.entries()).map(([id, { partition, rank }]) => ({
    id, partition, rank,
  }));
}

/**
 * Generate the lattice of flats of the graphic matroid M(G).
 *
 * Flats correspond to partitions of V where each block induces
 * a connected subgraph of G. Rank = |V| - number_of_blocks.
 *
 * @param graphType - Predefined graph type ('Kn', 'Cn', 'Kmn', 'Pn')
 * @param params - Parameters for the graph type (e.g., [4] for K_4)
 * @returns Standalone graphic lattice
 */
export function generateGraphicLattice(graphType: GraphType, params: number[]): LatticeStateShape {
  const { vertices, edges } = buildGraph(graphType, params);

  // Build adjacency map
  const adjacency = new Map<number, Set<number>>();
  for (const v of vertices) adjacency.set(v, new Set());
  for (const [u, v] of edges) {
    adjacency.get(u)!.add(v);
    adjacency.get(v)!.add(u);
  }

  const flats = enumerateConnectedPartitions(vertices, adjacency);

  const elements: Record<string, LatticeElement> = {};
  const relations: Relation[] = [];

  for (const flat of flats) {
    elements[flat.id] = { id: flat.id, rank: flat.rank, color: DEFAULT_COLOR };
  }

  // Covering relations: σ covers π iff σ has one fewer block (rank + 1)
  // and σ is obtained by merging exactly two blocks of π
  const byRank = new Map<number, typeof flats>();
  for (const flat of flats) {
    if (!byRank.has(flat.rank)) byRank.set(flat.rank, []);
    byRank.get(flat.rank)!.push(flat);
  }

  const maxR = vertices.length - 1;
  for (let r = 0; r < maxR; r++) {
    const lowerFlats = byRank.get(r) ?? [];
    const upperFlats = byRank.get(r + 1) ?? [];

    for (const lower of lowerFlats) {
      for (const upper of upperFlats) {
        // upper covers lower iff upper is obtained by merging exactly 2 blocks of lower
        // upper has one fewer block. Check: every block of upper is either
        // a block of lower or the union of exactly 2 blocks of lower.
        const lowerBlocks = lower.partition.map(b => new Set(b));
        const upperBlocks = upper.partition.map(b => new Set(b));

        let mergeCount = 0;
        let valid = true;

        for (const ub of upperBlocks) {
          // Find which lower blocks are subsets of this upper block
          const matching = lowerBlocks.filter(lb => [...lb].every(v => ub.has(v)));
          if (matching.length === 1 && matching[0].size === ub.size) {
            // Unchanged block
          } else if (matching.length === 2 && matching[0].size + matching[1].size === ub.size) {
            mergeCount++;
          } else {
            valid = false;
            break;
          }
        }

        if (valid && mergeCount === 1) {
          relations.push({ from: lower.id, to: upper.id });
        }
      }
    }
  }

  const positions = positionLatticeElements(elements);
  return { elements, relations, positions };
}

// ============================================================================
// Projective Geometry PG(n, q)
// ============================================================================

/**
 * Generate the projective geometry PG(n, q).
 *
 * PG(n, q) is the lattice of subspaces of the (n+1)-dimensional vector space
 * over F_q. Equivalent to L_{n+1}(F_q).
 *
 * Atoms: projective points (1-dim subspaces)
 * Number of atoms: (q^{n+1} - 1) / (q - 1)
 *
 * @param n - Projective dimension (1-3)
 * @param q - Prime field size (2, 3, 5, or 7)
 * @returns Standalone projective geometry lattice
 */
export function generateProjectiveGeometry(n: number, q: number): LatticeStateShape {
  if (n < 1 || n > 3) n = 2;
  if (![2, 3, 5, 7].includes(q)) q = 2;
  return generateSubspaceLattice(n + 1, q);
}
