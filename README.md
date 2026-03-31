# Lattice UI (React + TypeScript)

A modern, draggable lattice builder using React Flow. Features:
- Add/remove layers and elements (cannot modify bottom or current top).
- Click two nodes to add a relation; click an edge to delete.
- Drag nodes horizontally within their layer to tidy layout.
- Live counts and layer summaries.

## Getting started

```bash
cd lattice-ui
npm install
npm run dev-full
```
Then open the printed local URL (default: http://localhost:5173).

## Notes
- Initial lattice matches the previous Dash sample.
- Positions reset if you remove elements or layers that held a node.
- Relations only connect existing elements and disallow self-loops.
- Edge markers show direction (source → target).

## Next ideas
- Add persistence (localStorage) for layouts.
- Add validation checks and warnings for inconsistencies.
- Allow vertical drag within the same rank plus snap-back.
- Add keyboard shortcuts for delete/undo/redo.
