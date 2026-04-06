# Lattice UI (React + TypeScript)

Interactive tool for constructing and exploring lattices, built for a bachelor's thesis.
Uses React Flow for visualization and manipulation of lattice structures.

## Features

- **Dual graph mode:** Two graphs side by side (primary/secondary), click to enter fullscreen.
- **Drag & drop:** Move nodes horizontally within their rank.
- **Relations:** Click two nodes to connect; click an edge to delete.
- **Layer management:** Add/remove ranks and elements via the layer panel (bottom and top elements are protected).
- **Graph import:** Text-based format (`a<b` = cover relation) with automatic rank computation.
- **Parametric generation:** Boolean lattices, partition lattices, subspace lattices over GF(q), projective geometries.
- **Persistence:** Automatic save to localStorage, named graph save/load.
- **Custom checks & functions:** JavaScript snippets with built-in lattice operations (`sup`, `inf`, `atoms`, `ideal`, `covers`, ...).
- **Export:** SVG and PDF export (via Puppeteer) to `../figures/graphs`.
- **KaTeX rendering:** LaTeX formulas in node labels are rendered.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+C / Ctrl+V | Copy/paste nodes |
| Delete / Backspace | Remove selected nodes |
| Ctrl+Enter | Run check/function |
| Escape | Exit fullscreen |

## Getting started

```bash
cd lattice-ui
npm install
npm run dev-full    # Starts Vite dev server + Express backend
```
Then open the printed URL (default: http://localhost:5173).

Additional commands:
- `npm run dev` -- frontend only
- `npm run server` -- backend only (port 3001)
- `npm run build` -- production build to `dist/`

Uses direnv + Nix (`shell.nix`) for the development environment.

## Architecture

- **Zustand store** (`src/state/useLatticeStore.ts`): Central state with localStorage persistence.
- **Pure model** (`src/model/lattice.ts`): All lattice operations as pure functions.
- **Helper system** (`src/helpers/checkHelpers.ts`): `makeHelpers()` provides lattice-theoretic operations (`rank`, `covers`, `sup`, `inf`, `atoms`, `ideal`, `coAtoms`, `lt`, `gt`, `leq`, `geq`, set operations).
- **Export** (`src/helpers/exportGraph.ts`, `src/helpers/exportApi.ts`): SVG generation with KaTeX, PDF conversion via Puppeteer.
