import { create } from 'zustand';
import {
  LatticeStateShape,
  addElement,
  addElementWithId,
  removeElement,
  addRelation,
  removeRelation,
  removeElementById,
  addLayer,
  removeLayer,
  setNodeX,
  setElementColor,
  setElementName,
  renameElement,
  mergeElements,
  createInitialLattice,
  getLayers,
  maxRank,
  generateBooleanLattice,
  generatePartitionLattice,
  generateSubspaceLattice,
  generateGraphicLattice,
  generateProjectiveGeometry,
  addGeneratedLattice,
  GraphType,
} from '../model/lattice';
import { LatticeStateShape as SampleShape } from '../model/lattice';
import bundledDefaults from '../defaults/initialState';

const PRIMARY_STORAGE_KEY = 'lattice-state-v1-primary';
const SECONDARY_STORAGE_KEY = 'lattice-state-v1-secondary';

const isValidGraph = (parsed: unknown): parsed is LatticeStateShape => {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Partial<LatticeStateShape>;
  return !!(p.elements && p.relations && p.positions);
};

const loadPersistedGraph = (key: string, bundledFallback: LatticeStateShape | null): LatticeStateShape | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      // First visit: seed from bundled defaults if available
      if (bundledFallback && isValidGraph(bundledFallback)) return bundledFallback;
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!isValidGraph(parsed)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
};

const persistGraph = (key: string, state: LatticeStateShape) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    // ignore persistence errors
  }
};

export type StoreState = {
  // Primary graph
  primary: LatticeStateShape;
  primarySelectedNodes: string[];

  // Secondary graph
  secondary: LatticeStateShape;
  secondarySelectedNodes: string[];

  // Focused graph ('pri' or 'sec')
  foc: 'pri' | 'sec';

  // Fullscreen mode (null = no fullscreen)
  fullscreenGraph: 'pri' | 'sec' | null;

  // Selection and focus setters
  setSelectedNodes: (ids: string[], graphId?: 'pri' | 'sec') => void;
  setFocus: (graphId: 'pri' | 'sec') => void;
  setFullscreen: (graphId: 'pri' | 'sec' | null) => void;

  // Graph-scoped mutations (operate on specified graph or foc if not specified)
  addElementToRank: (rank: number, graphId?: 'pri' | 'sec') => void;
  addNodeWithId: (id: string, rank: number, graphId?: 'pri' | 'sec') => void;
  removeElementFromRank: (rank: number, graphId?: 'pri' | 'sec') => void;
  addRelation: (from: string, to: string, graphId?: 'pri' | 'sec') => void;
  removeRelation: (from: string, to: string, graphId?: 'pri' | 'sec') => void;
  removeElementById: (id: string, graphId?: 'pri' | 'sec') => void;
  addLayer: (graphId?: 'pri' | 'sec') => void;
  removeLayer: (graphId?: 'pri' | 'sec') => void;
  setNodeX: (id: string, x: number, graphId?: 'pri' | 'sec') => void;
  setColor: (id: string, color: string, graphId?: 'pri' | 'sec') => void;
  setElementName: (id: string, name: string | undefined, graphId?: 'pri' | 'sec') => void;
  renameElement: (id: string, nextId: string, graphId?: 'pri' | 'sec') => void;
  mergeElements: (keepId: string, dropId: string, graphId?: 'pri' | 'sec') => void;
  resetSample: (graphId?: 'pri' | 'sec') => void;
  loadSample: (sample: SampleShape, graphId?: 'pri' | 'sec') => void;
  addBooleanLattice: (n: number, graphId?: 'pri' | 'sec') => void;
  addPartitionLattice: (n: number, graphId?: 'pri' | 'sec') => void;
  addSubspaceLattice: (n: number, q: number, graphId?: 'pri' | 'sec') => void;
  addGraphicLattice: (graphType: GraphType, params: number[], graphId?: 'pri' | 'sec') => void;
  addProjectiveGeometry: (n: number, q: number, graphId?: 'pri' | 'sec') => void;
};

export const useLatticeStore = create<StoreState>((set, get) => {
  const initialPrimary = loadPersistedGraph(PRIMARY_STORAGE_KEY, bundledDefaults.primaryGraph) ?? createInitialLattice();
  const initialSecondary = loadPersistedGraph(SECONDARY_STORAGE_KEY, bundledDefaults.secondaryGraph) ?? createInitialLattice();

  // Helper to resolve graph from graphId or foc
  const resolveGraph = (graphId?: 'pri' | 'sec'): 'pri' | 'sec' => {
    return graphId ?? get().foc;
  };

  return {
    primary: initialPrimary,
    primarySelectedNodes: [],
    secondary: initialSecondary,
    secondarySelectedNodes: [],
    foc: 'pri',
    fullscreenGraph: null,

    setSelectedNodes: (ids, graphId) => set((state) => {
      const target = resolveGraph(graphId ?? undefined) === 'pri' ? 'primarySelectedNodes' : 'secondarySelectedNodes';
      return { [target]: ids };
    }),

    setFocus: (graphId) => set(() => ({ foc: graphId })),
    setFullscreen: (graphId) => set(() => ({ fullscreenGraph: graphId })),

    // Primary/Secondary mutation helpers
    addElementToRank: (rank, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = addElement(graph, rank);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    addNodeWithId: (id, rank, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = addElementWithId(graph, id, rank);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    removeElementFromRank: (rank, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = removeElement(graph, rank);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    addRelation: (from, to, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = addRelation(graph, from, to);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    removeRelation: (from, to, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = removeRelation(graph, from, to);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    removeElementById: (id, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = removeElementById(graph, id);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    addLayer: (graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = addLayer(graph);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    removeLayer: (graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = removeLayer(graph);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    setNodeX: (id, x, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = setNodeX(graph, id, x);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    setColor: (id, color, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = setElementColor(graph, id, color);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    setElementName: (id, name, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = setElementName(graph, id, name);
        const result = target === 'pri' ? { primary: updated } : { secondary: updated };
        // Persist the update
        if (target === 'pri') persistGraph(PRIMARY_STORAGE_KEY, updated);
        else persistGraph(SECONDARY_STORAGE_KEY, updated);
        return result;
      });
    },

    renameElement: (id, nextId, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = renameElement(graph, id, nextId);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    mergeElements: (keepId, dropId, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const updated = mergeElements(graph, keepId, dropId);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    resetSample: (graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const reset = createInitialLattice();
        return target === 'pri' ? { primary: reset } : { secondary: reset };
      });
    },

    loadSample: (sample, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        return target === 'pri' ? { primary: sample } : { secondary: sample };
      });
    },

    addBooleanLattice: (n, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const generated = generateBooleanLattice(n);
        const updated = addGeneratedLattice(graph, generated);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    addPartitionLattice: (n, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const generated = generatePartitionLattice(n);
        const updated = addGeneratedLattice(graph, generated);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    addSubspaceLattice: (n, q, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const generated = generateSubspaceLattice(n, q);
        const updated = addGeneratedLattice(graph, generated);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    addGraphicLattice: (graphType, params, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const generated = generateGraphicLattice(graphType, params);
        const updated = addGeneratedLattice(graph, generated);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },

    addProjectiveGeometry: (n, q, graphId) => {
      const target = resolveGraph(graphId);
      set((state) => {
        const graph = target === 'pri' ? state.primary : state.secondary;
        const generated = generateProjectiveGeometry(n, q);
        const updated = addGeneratedLattice(graph, generated);
        return target === 'pri' ? { primary: updated } : { secondary: updated };
      });
    },
  };
});

// Persist both graphs to storage whenever they change
useLatticeStore.subscribe((state) => {
  const primarySnapshot: LatticeStateShape = {
    elements: state.primary.elements,
    relations: state.primary.relations,
    positions: state.primary.positions,
  };
  persistGraph(PRIMARY_STORAGE_KEY, primarySnapshot);

  const secondarySnapshot: LatticeStateShape = {
    elements: state.secondary.elements,
    relations: state.secondary.relations,
    positions: state.secondary.positions,
  };
  persistGraph(SECONDARY_STORAGE_KEY, secondarySnapshot);
});

export const selectLayers = (graphId: 'pri' | 'sec' = 'pri') => {
  const state = useLatticeStore.getState();
  const graph = graphId === 'pri' ? state.primary : state.secondary;
  return getLayers(graph);
};

export const selectMaxRank = (graphId: 'pri' | 'sec' = 'pri') => {
  const state = useLatticeStore.getState();
  const graph = graphId === 'pri' ? state.primary : state.secondary;
  return maxRank(graph);
};
