# Knowledge Graph Pretext

https://github.com/user-attachments/assets/8025c115-009e-4c51-805e-6197cf383975

An interactive, physics-based knowledge graph visualiser built with canvas rendering and [@chenglou/pretext](https://github.com/chenglou/pretext) for high-quality text layout.

**Upload any `.json`, `.md`, or `.zip` file to visualise your own knowledge graph.**

The graph comes preloaded with 240 Creative AI tools from the [DreamLab Newsletter](https://open.spotify.com/show/2ptbLwVWeyO7ooPGHoYTqk) Issues 1–20 as an example — upload your own data to replace it entirely.

**Live:** [petejwoodbridge.github.io/knowledge-graph-pretext](https://petejwoodbridge.github.io/knowledge-graph-pretext/)

---

## Uploading Your Own Graph

Uploading a file **replaces** the current graph completely. Use the **Upload** button in the right panel or drag and drop a file anywhere onto the canvas.

### JSON format
```json
{
  "nodes": [
    {
      "id": "a",
      "label": "My Tool",
      "desc": "What this tool does",
      "url": "https://example.com",
      "category": "Video",
      "tags": ["ai", "video"],
      "issues": [1, 2]
    }
  ],
  "edges": [
    { "source": "a", "target": "b", "label": "relates to" }
  ]
}
```

Only `id` and `label` are required on each node. All other fields are optional.

### Markdown format
Headings map to categories and nodes — the tool will auto-generate edges between nodes in the same category and nodes sharing a URL domain:

```markdown
## Category Name

### Tool Name
**URL:** https://example.com
**Issues:** #1, #2
```

### ZIP format
Bundle multiple `.md` and/or `.json` files into a single `.zip`. All files are parsed and merged into one graph.

---

## Features

### Graph
- **Spring physics** layout — nodes repel each other and pull along edges until settled
- **10 colour-coded categories** shown in the bottom-left legend
- Nodes have a coloured accent bar indicating their category

### Filtering & Search
- **Click any category** in the legend to cluster those nodes at the centre of the screen
- **Search bar** (top centre) — type a query and press **Enter** to group matching tools
  - Searches labels, descriptions, categories, tags, and issue numbers
- Matching nodes pull to the screen centre; non-matching nodes dim and push away
- **Escape** or click the active badge to clear the filter

### Node Details (right panel)
Click a node to see:
- Category, name, and full description
- **Open Link ↗** button
- Newsletter issues and tags
- Connected nodes grouped by relationship type

**Double-click** a node to open its link directly in a new tab.

### Navigation
| Action | Result |
|---|---|
| Scroll | Zoom |
| Drag canvas | Pan |
| Drag node | Reposition |
| Click node | Inspect in panel |
| Double-click node | Open link |
| Double-click canvas | Add new node |
| Delete / Backspace | Remove selected node |

### The Octopus
There is a dancing pink pixel octopus on the graph. Drag it — it repels nearby nodes and faces the direction you pull it.

---

## Running Locally

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

Deployed automatically to GitHub Pages via GitHub Actions on every push to `master`.

---

## Tech

- [Vite](https://vitejs.dev/) — build tool
- [@chenglou/pretext](https://github.com/chenglou/pretext) — canvas text layout
- [JSZip](https://stuk.github.io/jszip/) — ZIP file parsing
- GitHub Actions + GitHub Pages — CI/CD
