import { LatticeStateShape, getLayers, LatticeElement, Relation } from '../model/lattice';

export type MutationFns = {
  setColorFn?: (id: string, color: string) => void;
  addNodeFn?: (id: string, rank: number) => void;
  connectFn?: (a: string, b: string) => void;
  disconnectFn?: (a: string, b: string) => void;
};

export type HelperFns = {
  rank: (node: string) => number | undefined;
  neighbors: (node: string) => string[];
  covers: (node: string) => string[];
  coveredBy: (node: string) => string[];
  lt: (a: string, b: string) => boolean;
  gt: (a: string, b: string) => boolean;
  leq: (a: string, b: string) => boolean;
  geq: (a: string, b: string) => boolean;
  sup: (...items: Array<string | string[]>) => string | undefined;
  inf: (...items: Array<string | string[]>) => string | undefined;
  cup: (...sets: Array<string[] | string[][]>) => string[] | string[][];
  cap: (...sets: Array<string[] | string[][]>) => string[] | string[][];
  minus: (a: string[] | string[][], b: string[] | string[][]) => string[] | string[][];
  isSubset: (a: string[] | string[][], b: string[] | string[][]) => boolean;
  setEquals: (a: string[] | string[][], b: string[] | string[][]) => boolean;
  one: (() => string | undefined) | (string | undefined);
  zero: (() => string | undefined) | (string | undefined);
  color: (node: string) => string | undefined;
  setColor: (node: string, color: string) => void;
  addNode: (id: string, rank: number) => void;
  connect: (a: string, b: string) => void;
  disconnect: (a: string, b: string) => void;
  atoms: (...nodes: Array<string | string[]>) => string[];
  ideal: (node: string) => string[];
  filter: (node: string) => string[];
  coAtoms: (node: string) => string[];
  subsets: (arr: string[]) => string[][];
  fromSetSystem: (sets: string[][]) => LatticeStateShape & HelperFns;
  colors: string[];
  clearCaches: () => void;
  getAllNodes: () => string[];
  nodes: string[]; // alias for getAllNodes()
};

export type DualHelperFns = {
  pri: HelperFns;
  sec: HelperFns;
};

export function makeHelpers(
  graph: Pick<LatticeStateShape, 'elements' | 'relations'> | (() => Pick<LatticeStateShape, 'elements' | 'relations'>),
  mutations?: MutationFns,
): HelperFns {
  const getGraph = () => {
    return typeof graph === 'function' ? graph() : graph;
  };

  const rank = (node: string) => getGraph().elements[node]?.rank;
  
  const getAllNodes = () => Object.keys(getGraph().elements);

  // Treat relations as undirected: mirror every edge so traversal is symmetric even if data is stored one-way.
  const getUndirected = () => getGraph().relations.flatMap((r) => [r, { from: r.to, to: r.from }]);

  const neighbors = (node: string) => {
    const seen = new Set<string>();
    getUndirected().forEach((r) => {
      if (r.from === node) seen.add(r.to);
      if (r.to === node) seen.add(r.from);
    });
    return Array.from(seen);
  };

  // Treat edges as undirected but orient by rank: lower -> higher for covers, higher -> lower for coveredBy.
  const covers = (node: string) => {
    const r = rank(node);
    if (r === undefined) return [];
    return neighbors(node).filter((n) => {
      const nr = rank(n);
      return nr !== undefined && nr > r;
    });
  };

  const coveredBy = (node: string) => {
    const r = rank(node);
    if (r === undefined) return [];
    return neighbors(node).filter((n) => {
      const nr = rank(n);
      return nr !== undefined && nr < r;
    });
  };

  // Memoized ancestor/descendant closures to speed up order queries and sup/inf.
  const ancestorMap: Record<string, Set<string>> = {};
  const descendantsMap: Record<string, Set<string>> = {};

  // Clear all caches when graph structure changes
  const clearCaches = () => {
    Object.keys(ancestorMap).forEach(key => delete ancestorMap[key]);
    Object.keys(descendantsMap).forEach(key => delete descendantsMap[key]);
  };

  const computeAncestors = (node: string): Set<string> => {
    if (ancestorMap[node]) return ancestorMap[node];
    const seen = new Set<string>();
    const stack = [...coveredBy(node)];
    while (stack.length) {
      const cur = stack.pop() as string;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (ancestorMap[cur]) {
        ancestorMap[cur].forEach((p) => seen.add(p));
        continue;
      }
      coveredBy(cur).forEach((p) => stack.push(p));
    }
    ancestorMap[node] = seen;
    return seen;
  };

  const computeDescendants = (node: string): Set<string> => {
    if (descendantsMap[node]) return descendantsMap[node];
    const seen = new Set<string>();
    const stack = [...covers(node)];
    while (stack.length) {
      const cur = stack.pop() as string;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (descendantsMap[cur]) {
        descendantsMap[cur].forEach((c) => seen.add(c));
        continue;
      }
      covers(cur).forEach((c) => stack.push(c));
    }
    descendantsMap[node] = seen;
    return seen;
  };

  // In this orientation, edges point upward (lower -> higher). Use ancestors to decide order.
  const lt = (a: string, b: string) => computeAncestors(b).has(a);
  const gt = (a: string, b: string) => computeAncestors(a).has(b);
  const leq = (a: string, b: string) => a === b || lt(a, b);
  const geq = (a: string, b: string) => a === b || gt(a, b);

  const flattenArgs = (items: Array<string | string[]>) => {
    if (items.length === 1 && Array.isArray(items[0])) return items[0] as string[];
    return items as string[];
  };

  const sup = (...items: Array<string | string[]>): string | undefined => {
    const list = flattenArgs(items);
    if (list.length === 0) return getZero();
    const candidates = getAllNodes().filter((n) => list.every((x) => x === n || computeAncestors(n).has(x)));
    const minimals = candidates.filter((n) => !candidates.some((m) => m !== n && computeAncestors(n).has(m)));
    return minimals.length === 1 ? minimals[0] : undefined;
  };

  const inf = (...items: Array<string | string[]>): string | undefined => {
    const list = flattenArgs(items);
    if (list.length === 0) return undefined;
    const candidates = getAllNodes().filter((n) => list.every((x) => x === n || computeAncestors(x).has(n)));
    const maximals = candidates.filter((n) => !candidates.some((m) => m !== n && computeAncestors(m).has(n)));
    return maximals.length === 1 ? maximals[0] : undefined;
  };

  const uniq = (items: string[]) => Array.from(new Set(items));

  const normalizeSet = (items: string[]) => Array.from(new Set(items)).sort();

  const isSetCollection = (value: string[] | string[][]): value is string[][] =>
    Array.isArray(value) && value.every((item) => Array.isArray(item));

  const areAllSetCollections = (collections: Array<string[] | string[][]>): collections is string[][][] =>
    collections.every((collection) => isSetCollection(collection));

  const buildSetCollectionMap = (collection: string[][]) => {
    const map = new Map<string, string[]>();
    collection.forEach((subset) => {
      const normalized = normalizeSet(subset);
      map.set(normalized.join('||'), normalized);
    });
    return map;
  };

  const cup = (...rawSets: Array<string[] | string[][]>) => {
    if (areAllSetCollections(rawSets)) {
      const unique = new Map<string, string[]>();
      rawSets.forEach((collection) => {
        collection.forEach((subset) => {
          const normalized = normalizeSet(subset);
          const key = normalized.join('||');
          if (!unique.has(key)) unique.set(key, normalized);
        });
      });
      return Array.from(unique.values());
    }

    const bag = new Set<string>();
    rawSets.forEach((s) => (s as string[]).forEach((item) => bag.add(item)));
    return Array.from(bag);
  };

  const cap = (...rawSets: Array<string[] | string[][]>) => {
    if (rawSets.length === 0) return [];

    if (areAllSetCollections(rawSets)) {
      const [first, ...rest] = rawSets.map((collection) => buildSetCollectionMap(collection));
      const intersection: string[][] = [];
      first.forEach((subset, key) => {
        if (rest.every((map) => map.has(key))) intersection.push(subset);
      });
      return intersection;
    }

    const [first, ...rest] = rawSets.map((set) => normalizeSet(set as string[]));
    return first.filter((item) => rest.every((s) => s.includes(item)));
  };

  const minus = (a: string[] | string[][], b: string[] | string[][]) => {
    if (isSetCollection(a) && isSetCollection(b)) {
      const exclude = new Set(buildSetCollectionMap(b).keys());
      const result: string[][] = [];
      a.forEach((subset) => {
        const normalized = normalizeSet(subset);
        const key = normalized.join('||');
        if (!exclude.has(key)) result.push(normalized);
      });
      return result;
    }

    const exclude = new Set(normalizeSet(b as string[]));
    return normalizeSet(a as string[]).filter((item) => !exclude.has(item));
  };

  const isSubset = (a: string[] | string[][], b: string[] | string[][]) => {
    if (isSetCollection(a) && isSetCollection(b)) {
      const superset = new Set(buildSetCollectionMap(b).keys());
      return a.every((subset) => superset.has(normalizeSet(subset).join('||')));
    }

    const superset = new Set(normalizeSet(b as string[]));
    return normalizeSet(a as string[]).every((item) => superset.has(item));
  };

  const setEquals = (a: string[] | string[][], b: string[] | string[][]) => {
    if (isSetCollection(a) && isSetCollection(b)) {
      const mapA = buildSetCollectionMap(a);
      const mapB = buildSetCollectionMap(b);
      if (mapA.size !== mapB.size) return false;
      for (const key of mapA.keys()) {
        if (!mapB.has(key)) return false;
      }
      return true;
    }

    const normA = normalizeSet(a as string[]);
    const normB = normalizeSet(b as string[]);
    if (normA.length !== normB.length) return false;
    return normA.every((item, idx) => item === normB[idx]);
  };

  const color = (node: string) => getGraph().elements[node]?.color;
  const setColor = (node: string, c: string) => {
    if (mutations?.setColorFn) {
      mutations.setColorFn(node, c);
      return;
    }

    // Fallback: mutate the backing graph directly if it's an object
    if (typeof graph !== 'function') {
      const g = graph;
      if (g.elements[node]) {
        g.elements[node] = { ...g.elements[node], color: c };
      }
    }
  };
  const addNode = (id: string, r: number) => {
    if (mutations?.addNodeFn) {
      mutations.addNodeFn(id, r);
      clearCaches();
    }
  };
  const connect = (a: string, b: string) => {
    if (mutations?.connectFn) {
      mutations.connectFn(a, b);
      clearCaches();
    }
  };
  const disconnect = (a: string, b: string) => {
    if (mutations?.disconnectFn) {
      mutations.disconnectFn(a, b);
      clearCaches();
    }
  };

  const atoms = (...nodes: Array<string | string[]>) => {
    const list = flattenArgs(nodes);
    const atomSet = new Set<string>();
    list.forEach((node) => {
      getAllNodes().filter((n) => rank(n) === 1 && leq(n, node)).forEach((a) => atomSet.add(a));
    });
    return Array.from(atomSet);
  };
  const ideal = (node: string) => getAllNodes().filter((n) => leq(n, node));
  const filter = (node: string) => getAllNodes().filter((n) => leq(node, n));
  const coAtoms = (node: string) => {
    const r = rank(node);
    if (r === undefined) return [];
    return getAllNodes().filter((n: string) => (rank(n) ?? -1) + 1 === r);
  };
  const colors = ["#fb7185","#2563eb","#0ea5a4","#34d399","#f59e0b","#7c3aed","#60a5fa","#a78bfa","#fde68a","#94a3b8","#fbcfe8","#f97316","#e6ee9c","#10b981"];

  // Collect all subsets of an array (recursive approach)
  function subsets(arr: string[]): string[][] {
    if (arr.length === 0) {
      return [[]];
    } else {
      const [first, ...rest] = arr;
      const subsetRest = subsets(rest);
      return [...subsetRest, ...subsetRest.map((subset) => [first, ...subset])];
    }
  }

  const getOne = () => {
    // Find the element at maximum rank - recompute dynamically each time
    const currentKeys = getAllNodes();
    let maxRankVal = -Infinity;
    let oneElement: string | undefined;
    currentKeys.forEach((n) => {
      const r = rank(n) ?? -Infinity;
      if (r > maxRankVal) {
        maxRankVal = r;
        oneElement = n;
      }
    });
    return oneElement;
  };

  const getZero = () => {
    // Find the element at rank 0 - recompute dynamically each time
    const currentKeys = getAllNodes();
    for (const n of currentKeys) {
      if (rank(n) === 0) return n;
    }
    return undefined;
  };

  const fromSetSystem = (sets: string[][]): LatticeStateShape & HelperFns => {
    // Convert each set to a string representation for use as element IDs
    const setToId = (set: string[]): string => {
      const sorted = [...set].sort();
      return sorted.length === 0 ? '∅' : sorted.join(',');
    };

    // Helper: check if setA ⊆ setB
    const isSubset = (setA: string[], setB: string[]): boolean => {
      return setA.every((item) => setB.includes(item));
    };

    // Helper: check if setA ⊂ setB (proper subset)
    const isProperSubset = (setA: string[], setB: string[]): boolean => {
      return isSubset(setA, setB) && setA.length < setB.length;
    };

    // Helper: check if there exists a set C with A ⊂ C ⊂ B
    const hasIntermediateSubset = (setA: string[], setB: string[], allSets: string[][]): boolean => {
      return allSets.some((setC) => {
        return (
          isProperSubset(setA, setC) &&
          isProperSubset(setC, setB)
        );
      });
    };

    // Build elements (initially with placeholder rank)
    const elements: Record<string, LatticeElement> = {};
    const relations: Relation[] = [];
    const positions: Record<string, { x: number }> = {};
    const seenIds = new Set<string>();
    const uniqueSets: string[][] = [];

    // Add all sets as elements, removing duplicates
    sets.forEach((set) => {
      const id = setToId(set);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        uniqueSets.push(set);
        elements[id] = {
          id,
          rank: 0, // Placeholder - will be computed later
          color: DEFAULT_COLOR,
        };
      }
    });

    // Add relations: A covers B in the Hasse diagram if A ⊂ B and there's no C with A ⊂ C ⊂ B
    for (let i = 0; i < uniqueSets.length; i++) {
      for (let j = 0; j < uniqueSets.length; j++) {
        if (i !== j) {
          const setI = uniqueSets[i];
          const setJ = uniqueSets[j];

          // Check if setI ⊂ setJ (proper subset) and there's no intermediate set
          if (isProperSubset(setI, setJ) && !hasIntermediateSubset(setI, setJ, uniqueSets)) {
            const fromId = setToId(setI);
            const toId = setToId(setJ);
            if (!relations.some((r) => r.from === fromId && r.to === toId)) {
              relations.push({ from: fromId, to: toId });
            }
          }
        }
      }
    }

    // Compute ranks based on longest chain from bottom (Hasse diagram heights)
    const computeRank = (id: string, visited: Set<string> = new Set()): number => {
      if (visited.has(id)) return 0; // Avoid cycles
      visited.add(id);

      // Find all predecessors (elements that point to this one)
      const predecessors = relations.filter((r) => r.to === id).map((r) => r.from);

      if (predecessors.length === 0) {
        // This is a minimal element (rank 0)
        return 0;
      }

      // Rank is 1 + max rank of all predecessors
      const maxPredRank = Math.max(...predecessors.map((pred) => computeRank(pred, new Set(visited))));
      return maxPredRank + 1;
    };

    // Update ranks for all elements
    Object.keys(elements).forEach((id) => {
      elements[id].rank = computeRank(id);
    });

    // Position elements by rank
    const layers = getLayers({ elements });
    Object.entries(layers).forEach(([rankStr, ids]) => {
      ids.forEach((id, idx) => {
        positions[id] = { x: (idx - ids.length / 2) * 140 };
      });
    });

    const latticeState = { elements, relations, positions };
    
    // Create helpers for the new graph and combine with state
    const newHelpers = makeHelpers(latticeState);
    
    // Return object that combines both state and helper methods
    return { ...latticeState, ...newHelpers } as LatticeStateShape & HelperFns;
  };

  const DEFAULT_COLOR = '#0f172a';

  const helpers = {
    rank,
    neighbors,
    covers,
    coveredBy,
    lt,
    gt,
    leq,
    geq,
    sup,
    inf,
    cup,
    cap,
    minus,
    isSubset,
    setEquals,
    color,
    setColor,
    addNode,
    connect,
    disconnect,
    atoms,
    ideal,
    filter,
    coAtoms,
    subsets,
    fromSetSystem,
    colors,
    clearCaches,
    getAllNodes,
    nodes: getAllNodes(), // alias for getAllNodes() - computed at time of access
  };

  // Define one and zero as getters so they're computed dynamically but accessible as properties
  Object.defineProperty(helpers, 'one', {
    get: getOne,
    enumerable: true,
  });

  Object.defineProperty(helpers, 'zero', {
    get: getZero,
    enumerable: true,
  });

  // Update nodes property dynamically
  Object.defineProperty(helpers, 'nodes', {
    get: getAllNodes,
    enumerable: true,
  });

  return helpers as HelperFns;
}

/**
 * Create dual-namespace helpers for primary and secondary graphs.
 * Returns { pri: {...}, sec: {...} } where each namespace operates on its respective graph.
 */
export function makeDualHelpers(
  primaryGraph: Pick<LatticeStateShape, 'elements' | 'relations'> | (() => Pick<LatticeStateShape, 'elements' | 'relations'>),
  secondaryGraph: Pick<LatticeStateShape, 'elements' | 'relations'> | (() => Pick<LatticeStateShape, 'elements' | 'relations'>),
  primaryMutations?: MutationFns,
  secondaryMutations?: MutationFns,
): DualHelperFns {
  return {
    pri: makeHelpers(primaryGraph, primaryMutations),
    sec: makeHelpers(secondaryGraph, secondaryMutations),
  };
}
