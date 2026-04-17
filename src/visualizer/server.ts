import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { GraphStore } from "../graph/store.js";

export function startVisualizer(store: GraphStore, port = 3000): void {
  const server = createServer(async (req, res) => {
    if (req.url === "/api/graph") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(store.toJSON(), null, 2));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(renderShell());
  });
  server.listen(port, () => {
    console.log(`Synapse visualizer at http://localhost:${port}`);
  });
}

function renderShell(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Synapse — Cognition Graph</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #080304; color: #e8e8e8; }
  header { padding: 16px 24px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
  h1 { margin: 0; font-size: 18px; letter-spacing: 0.04em; }
  .status { color: #ff9d6c; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; }
  pre { padding: 24px; font-size: 12px; line-height: 1.5; overflow: auto; }
  .node-INTENT { color: #ff5a69; }
  .node-RULE { color: #ff9d6c; }
  .node-STEP { color: #6cf0ff; }
  .node-OBSERVATION { color: #b0e8a0; }
</style></head>
<body>
<header><h1>SYNAPSE — COGNITION GRAPH</h1><span class="status">LIVE</span></header>
<pre id="data">loading…</pre>
<script>
async function refresh() {
  const r = await fetch('/api/graph');
  const data = await r.json();
  const lines = [];
  lines.push('NODES (' + data.nodes.length + ')');
  for (const n of data.nodes) {
    lines.push('  [' + n.type + '] ' + n.id + ' — ' + (n.content || '').slice(0, 100));
  }
  lines.push('');
  lines.push('EDGES (' + data.edges.length + ')');
  for (const e of data.edges) {
    lines.push('  ' + e.from + ' --[' + e.type + ']--> ' + e.to);
  }
  document.getElementById('data').textContent = lines.join('\\n');
}
refresh();
setInterval(refresh, 1000);
</script>
</body></html>`;
}
