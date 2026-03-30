# Knowledge Graph Pretext

An interactive knowledge graph of **240 Creative AI tools** extracted from the [DreamLab Newsletter](https://open.spotify.com/show/2ptbLwVWeyO7ooPGHoYTqk) Issues 1–20. Built with canvas-based spring physics rendering using [@chenglou/pretext](https://github.com/chenglou/pretext) for high-quality text layout.

**Live:** [petejwoodbridge.github.io/knowledge-graph-pretext](https://petejwoodbridge.github.io/knowledge-graph-pretext/)

---

## Features

### Graph
- **240 tools** across 10 categories, auto-connected by shared ecosystems (ComfyUI, Runway, Qwen, LTX, Google/Veo, Meta/SAM, etc.)
- **Spring physics** layout — nodes repel each other and spring along edges until they settle
- **10 colour-coded categories**: Video, Image, 3D & VFX, Audio, Agents, Coding, LLMs, Games, Design, Research

### Filtering & Search
- **Click any category** in the legend to group those nodes together at the centre of the screen
- **Search bar** (top centre) — type a query and press **Enter** to group matching tools
  - Searches labels, descriptions, categories, tags, and newsletter issue numbers
- Matching nodes pull to the screen centre; non-matching nodes dim and push away
- **Escape** or click the badge to clear the filter
- Search also includes tool descriptions for richer results (e.g. search `lora`, `realtime`, `open source`)

### Node Details (right panel)
- Click a node to see:
  - Category badge
  - Tool name
  - Full description of what the tool does
  - **Open Link ↗** button to visit the original source
  - Newsletter issues it appeared in
  - Tags
  - Connected tools grouped by relationship type
- **Double-click** a node to open its link directly

### Navigation
| Action | Result |
|---|---|
| Scroll | Zoom in/out |
| Drag canvas | Pan |
| Drag node | Reposition (physics continues) |
| Click node | Select & inspect in panel |
| Double-click node | Open link |
| Double-click canvas | Add new node |
| Delete / Backspace | Remove selected node |

### Pink Pixel Octopus
There is a dancing pink pixel octopus on the graph. Drag it around — it dynamically repels nearby nodes and faces the direction you drag it.

### File Import / Export
The panel supports importing custom knowledge graphs:

| Format | How it's parsed |
|---|---|
| `.json` | `{ nodes: [...], edges: [...] }` |
| `.md` | `## Category` / `### Tool` / `**URL:**` / `**Issues:**` headings |
| `.zip` | Any combination of `.md` and `.json` files bundled together |

Export the current graph as JSON via the **Export Graph JSON** button.

---

## Running Locally

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`

## Building

```bash
npm run build
```

Output goes to `dist/`. Deployed automatically to GitHub Pages via GitHub Actions on every push to `main`.

---

## Data Source

All tools extracted from the **Dream Machine Newsletter** by [DreamLab](https://dreamlab.la/) — Issues 1–20. Categories, tags, descriptions, and connections are derived from the original newsletter content.

## Tech

- [Vite](https://vitejs.dev/) — build tool
- [@chenglou/pretext](https://github.com/chenglou/pretext) — canvas text layout
- [JSZip](https://stuk.github.io/jszip/) — ZIP file parsing
- GitHub Actions + GitHub Pages — CI/CD
