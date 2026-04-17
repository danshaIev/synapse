import { createServer } from "node:http";
import { GraphStore } from "../graph/store.js";

export interface VisualizerOptions {
  port?: number;
  title?: string;
  decayingRules?: () => string[];
}

export function startVisualizer(
  store: GraphStore,
  options: VisualizerOptions = {},
): void {
  const port = options.port ?? 3000;
  const decayingRules = options.decayingRules ?? (() => []);
  const title = options.title ?? "Synapse — Cognition Graph";

  const server = createServer((req, res) => {
    if (req.url === "/api/graph") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(
        JSON.stringify({
          ...store.toJSON(),
          decayingRules: decayingRules(),
          generatedAt: Date.now(),
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderShell(title));
  });

  server.listen(port, () => {
    console.log(`Synapse visualizer at http://localhost:${port}`);
  });
}

function renderShell(title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js"></script>
<style>
  :root {
    --ink: #f6efe7;
    --ink-dim: #a99e92;
    --ink-faint: #6b6258;
    --bg: #080304;
    --bg-elev: #110a0c;
    --line: #2a1f22;
    --coral: #ff5a69;
    --amber: #ff9d6c;
    --cyan: #6cf0ff;
    --green: #b0e8a0;
    --violet: #c596ff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--ink); font-family: "Inter", -apple-system, sans-serif; }
  body { display: grid; grid-template-rows: auto 1fr; height: 100vh; overflow: hidden; }
  header {
    padding: 22px 32px;
    border-bottom: 1px solid var(--line);
    display: flex; justify-content: space-between; align-items: baseline;
    background: linear-gradient(180deg, rgba(255,90,105,0.04), transparent);
  }
  h1 {
    margin: 0;
    font-family: "Instrument Serif", serif;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  h1 span { color: var(--coral); }
  .meta { display: flex; gap: 28px; align-items: center; font-family: "JetBrains Mono", monospace; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-faint); }
  .meta strong { color: var(--ink); font-weight: 600; }
  .live { color: var(--coral); }
  .live::before { content: "●"; margin-right: 6px; animation: pulse 1.6s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

  main { display: grid; grid-template-columns: 1fr 380px; height: 100%; min-height: 0; }
  #cy { background: radial-gradient(ellipse at center, #160c0e 0%, var(--bg) 70%); }

  aside {
    border-left: 1px solid var(--line);
    background: var(--bg-elev);
    overflow-y: auto;
    padding: 28px 26px;
  }
  aside h2 {
    margin: 0 0 14px 0;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  aside section { margin-bottom: 32px; }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .stat {
    border: 1px solid var(--line);
    background: rgba(255,255,255,0.01);
    padding: 14px 16px;
    border-radius: 8px;
  }
  .stat .v {
    font-family: "Instrument Serif", serif;
    font-size: 36px;
    line-height: 1;
    color: var(--ink);
  }
  .stat .l {
    margin-top: 6px;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .legend { display: grid; gap: 8px; }
  .legend-item { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-dim); }
  .swatch { width: 12px; height: 12px; border-radius: 50%; }
  .decay {
    border: 1px solid var(--coral);
    background: rgba(255,90,105,0.06);
    padding: 12px 14px;
    border-radius: 8px;
    margin-bottom: 8px;
  }
  .decay .id { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--coral); }
  .decay .note { margin-top: 4px; font-size: 12px; color: var(--ink-dim); }
  .empty { color: var(--ink-faint); font-size: 13px; font-style: italic; }
  #detail {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 14px 16px;
    background: rgba(255,255,255,0.01);
    min-height: 80px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ink-dim);
  }
  #detail .type { font-family: "JetBrains Mono", monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--coral); }
  #detail .id { font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--ink-faint); }
  #detail .content { margin-top: 8px; color: var(--ink); font-size: 13px; }

  @media (max-width: 900px) {
    main { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
    aside { border-left: none; border-top: 1px solid var(--line); max-height: 50vh; }
  }
</style>
</head>
<body>
<header>
  <h1>SYN<span>A</span>PSE</h1>
  <div class="meta">
    <span><strong id="m-nodes">0</strong> nodes</span>
    <span><strong id="m-edges">0</strong> edges</span>
    <span class="live">live</span>
  </div>
</header>

<main>
  <div id="cy"></div>
  <aside>
    <section>
      <h2>Stats</h2>
      <div class="stat-grid">
        <div class="stat"><div class="v" id="s-steps">0</div><div class="l">steps</div></div>
        <div class="stat"><div class="v" id="s-rules">0</div><div class="l">rules</div></div>
        <div class="stat"><div class="v" id="s-obs">0</div><div class="l">observations</div></div>
        <div class="stat"><div class="v" id="s-blocked">0</div><div class="l">blocked</div></div>
      </div>
    </section>

    <section>
      <h2>Decaying Rules</h2>
      <div id="decay-list"><div class="empty">No decay detected.</div></div>
    </section>

    <section>
      <h2>Selected Node</h2>
      <div id="detail"><div class="empty">Click any node to inspect.</div></div>
    </section>

    <section>
      <h2>Legend</h2>
      <div class="legend">
        <div class="legend-item"><span class="swatch" style="background:#ff5a69"></span> INTENT</div>
        <div class="legend-item"><span class="swatch" style="background:#ff9d6c"></span> RULE</div>
        <div class="legend-item"><span class="swatch" style="background:#6cf0ff"></span> STEP</div>
        <div class="legend-item"><span class="swatch" style="background:#b0e8a0"></span> OBSERVATION</div>
        <div class="legend-item"><span class="swatch" style="background:#c596ff"></span> PLAN / TOOL_CALL / REASONING</div>
      </div>
    </section>
  </aside>
</main>

<script>
const COLORS = {
  INTENT: "#ff5a69",
  RULE: "#ff9d6c",
  STEP: "#6cf0ff",
  OBSERVATION: "#b0e8a0",
  PLAN: "#c596ff",
  TOOL_CALL: "#c596ff",
  REASONING: "#c596ff",
};

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: [],
  style: [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        "border-color": "data(color)",
        "border-width": 2,
        "border-opacity": 0.4,
        "label": "data(label)",
        "color": "#f6efe7",
        "font-family": "JetBrains Mono, monospace",
        "font-size": 10,
        "font-weight": 600,
        "letter-spacing": 1.2,
        "text-valign": "bottom",
        "text-margin-y": 8,
        "text-outline-width": 2,
        "text-outline-color": "#080304",
        "width": 22,
        "height": 22,
      },
    },
    {
      selector: "node[blocked]",
      style: {
        "border-color": "#ff5a69",
        "border-width": 3,
        "border-style": "dashed",
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-color": "#f6efe7",
        "border-width": 3,
        "border-opacity": 1,
      },
    },
    {
      selector: "edge",
      style: {
        "width": 1.2,
        "line-color": "#3a2a2d",
        "target-arrow-color": "#3a2a2d",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
        "label": "data(type)",
        "color": "#6b6258",
        "font-family": "JetBrains Mono, monospace",
        "font-size": 8,
        "letter-spacing": 1,
        "text-rotation": "autorotate",
        "text-margin-y": -6,
      },
    },
  ],
  layout: { name: "cose", animate: false, padding: 60, nodeRepulsion: 8000, idealEdgeLength: 110 },
  wheelSensitivity: 0.2,
});

let lastSignature = "";

function nodeLabel(n) {
  return n.type;
}

function buildElements(graph) {
  const els = [];
  for (const n of graph.nodes) {
    els.push({
      data: {
        id: n.id,
        label: nodeLabel(n),
        type: n.type,
        color: COLORS[n.type] || "#999",
        content: n.content,
        blocked: n.metadata && n.metadata.blocked ? true : undefined,
        meta: JSON.stringify(n.metadata || {}),
      },
    });
  }
  for (const e of graph.edges) {
    els.push({
      data: { id: e.id, source: e.from, target: e.to, type: e.type },
    });
  }
  return els;
}

function updateStats(graph) {
  const counts = { STEP: 0, RULE: 0, OBSERVATION: 0, BLOCKED: 0 };
  for (const n of graph.nodes) {
    if (n.type in counts) counts[n.type]++;
    if (n.metadata && n.metadata.blocked) counts.BLOCKED++;
  }
  document.getElementById("m-nodes").textContent = graph.nodes.length;
  document.getElementById("m-edges").textContent = graph.edges.length;
  document.getElementById("s-steps").textContent = counts.STEP;
  document.getElementById("s-rules").textContent = counts.RULE;
  document.getElementById("s-obs").textContent = counts.OBSERVATION;
  document.getElementById("s-blocked").textContent = counts.BLOCKED;

  const decayHost = document.getElementById("decay-list");
  if (!graph.decayingRules || graph.decayingRules.length === 0) {
    decayHost.innerHTML = '<div class="empty">No decay detected.</div>';
  } else {
    decayHost.innerHTML = graph.decayingRules
      .map((id) => '<div class="decay"><div class="id">' + id + '</div><div class="note">Recent violation rate above threshold. Re-injected with emphasis.</div></div>')
      .join("");
  }
}

cy.on("tap", "node", (evt) => {
  const d = evt.target.data();
  document.getElementById("detail").innerHTML =
    '<div class="type">' + d.type + '</div>' +
    '<div class="id">' + d.id + '</div>' +
    '<div class="content">' + (d.content || "(no content)") + '</div>';
});

async function refresh() {
  try {
    const r = await fetch("/api/graph");
    const graph = await r.json();
    const sig = JSON.stringify({ n: graph.nodes.length, e: graph.edges.length, d: graph.decayingRules });
    if (sig !== lastSignature) {
      lastSignature = sig;
      cy.elements().remove();
      cy.add(buildElements(graph));
      cy.layout({ name: "cose", animate: false, padding: 60, nodeRepulsion: 8000, idealEdgeLength: 110 }).run();
      updateStats(graph);
    }
  } catch (e) {
    console.warn("refresh failed", e);
  }
}
refresh();
setInterval(refresh, 1000);
</script>
</body>
</html>`;
}
