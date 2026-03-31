import { LatticeStateShape } from '../model/lattice';

/**
 * Joins atom names into a display string.
 * If all atom names use set notation (e.g. "{1}", "{a,b}"),
 * returns their union as a single set (e.g. "{1,a,b}").
 * Otherwise falls back to comma-separated concatenation.
 */
export function joinAtomNames(atoms: string[]): string {
  const setPattern = /^\{[^}]*\}$/;
  if (atoms.length > 0 && atoms.every((a) => setPattern.test(a))) {
    const parts = atoms.flatMap((a) =>
      a.slice(1, -1).split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    );
    const unique = [...new Set(parts)];
    return `{${unique.join(',')}}`;
  }
  return atoms.join(',');
}

// Cache atom maps to avoid recomputation
const atomMapCache = new WeakMap<LatticeStateShape, Map<string, string[]>>();

/**
 * Build a map of which atoms each node covers (for efficient lookup)
 * Results are cached per graph object to avoid recomputation
 */
function buildAtomMap(graph: LatticeStateShape): Map<string, string[]> {
  // Check cache first
  const cached = atomMapCache.get(graph);
  if (cached) return cached;

  const atomMap = new Map<string, string[]>();
  const memo: Record<string, string[] | null> = {}; // null = processing, [] = result

  // Build lower map: for each node, what nodes are directly below it?
  // Check both directions since relations can be stored either way
  const lowerMap: Record<string, string[]> = {};
  Object.values(graph.elements).forEach((el) => {
    const lower: string[] = [];
    graph.relations.forEach((r) => {
      if (r.from === el.id && (graph.elements[r.to]?.rank ?? 0) < el.rank) {
        lower.push(r.to);
      }
      if (r.to === el.id && (graph.elements[r.from]?.rank ?? 0) < el.rank) {
        lower.push(r.from);
      }
    });
    lowerMap[el.id] = lower;
  });

  // Collect atoms for each node (depth-first with cycle detection)
  const collect = (id: string): string[] => {
    // Already computed
    if (memo[id] !== undefined && memo[id] !== null) {
      return memo[id] as string[];
    }

    // Currently being processed - cycle detected, return empty
    if (memo[id] === null) {
      return [];
    }

    const element = graph.elements[id];
    if (!element) {
      memo[id] = [id];
      return memo[id];
    }

    // Mark as processing to detect cycles
    memo[id] = null;

    // If this is a rank 1 node, it's an atom itself
    if (element.rank === 1) {
      memo[id] = [id];
      return memo[id];
    }

    // Collect atoms from all nodes below this one
    const atoms = new Set<string>();
    const children = lowerMap[id] || [];
    for (const childId of children) {
      const childAtoms = collect(childId);
      childAtoms.forEach((a) => atoms.add(a));
    }

    memo[id] = Array.from(atoms).sort();
    return memo[id];
  };

  // Compute atoms for all nodes
  Object.keys(graph.elements).forEach((id) => {
    atomMap.set(id, collect(id));
  });

  // Cache the result
  atomMapCache.set(graph, atomMap);
  return atomMap;
}

/**
 * Compute the display label for a node, matching GUI behavior
 * Priority: name > atoms > id
 */
export function getNodeDisplayLabel(
  nodeId: string,
  graph: LatticeStateShape
): string {
  const element = graph.elements[nodeId];
  if (!element) return nodeId;

  // If node has a custom name, use it
  if (element.name) {
    return element.name;
  }

  // Otherwise, find atoms this node covers
  const atomMap = buildAtomMap(graph);
  const atoms = atomMap.get(nodeId) || [];
  if (atoms.length > 0) {
    return joinAtomNames(atoms);
  }

  // Fall back to node id
  return nodeId;
}
