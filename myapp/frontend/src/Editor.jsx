import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, NodeResizer,
  ConnectionMode, MarkerType, getViewportForBounds, addEdge, applyNodeChanges, applyEdgeChanges, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CATALOG, CATEGORIES } from './catalog.js';
import { toPng } from 'html-to-image';
import { api } from './api.js';

/* ---------- custom nodes ---------- */
function ServiceNode({ data, selected }) {
  return (
    <div className={'svc' + (selected ? ' sel' : '')} style={{ '--c': CATEGORIES[data.cat].color }}>
      {['Top', 'Right', 'Bottom', 'Left'].map((p) => (
        <Handle key={p} id={p} type="source" position={Position[p]} />
      ))}
      <span className="badge">{data.abbr}</span>
      <div className="svc-text">
        <b>{data.label}</b>
        {data.note && <small>{data.note}</small>}
      </div>
    </div>
  );
}

function GroupNode({ data, selected }) {
  return (
    <div className="grp" style={{ '--c': CATEGORIES[data.cat].color }}>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={140} />
      <div className="grp-title">
        <span className="badge">{data.abbr}</span>
        {data.label}
        {data.note && <small>{data.note}</small>}
      </div>
    </div>
  );
}
const nodeTypes = { service: ServiceNode, group: GroupNode };

/* ---------- helpers ---------- */
// React Flow needs parents before their children in the array
function order(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set(), out = [];
  const add = (n) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    if (n.parentId && byId.has(n.parentId)) add(byId.get(n.parentId));
    out.push(n);
  };
  nodes.forEach(add);
  return out;
}
const clean = (nodes) => nodes.map(({ selected, dragging, measured, ...n }) => n);
const defaultEdge = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } };

export default function Editor({ user, onLogout }) {
  const rf = useReactFlow();
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState('Untitled architecture');
  const [diagramId, setDiagramId] = useState(null);
  const [saved, setSaved] = useState([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');

  const refreshList = useCallback(() => {
    api.list().then(setSaved).catch(() => setStatus('Backend not reachable'));
  }, []);
  useEffect(refreshList, [refreshList]);

  const onNodesChange = useCallback((c) => setNodes((ns) => applyNodeChanges(c, ns)), []);
  const onEdgesChange = useCallback((c) => setEdges((es) => applyEdgeChanges(c, es)), []);
  const onConnect = useCallback((conn) => setEdges((es) => addEdge({ ...conn, ...defaultEdge }, es)), []);
  const onSelectionChange = useCallback(({ nodes: sel }) => setSelectedId(sel.length === 1 ? sel[0].id : null), []);

  // innermost group that contains an absolute flow-position
  const findParent = useCallback((pt, ignoreId) => {
    let best = null;
    for (const n of rf.getNodes()) {
      if (n.type !== 'group' || n.id === ignoreId) continue;
      const p = rf.getInternalNode(n.id)?.internals.positionAbsolute;
      const w = n.measured?.width ?? n.width ?? n.style?.width ?? 0;
      const h = n.measured?.height ?? n.height ?? n.style?.height ?? 0;
      if (!p || pt.x < p.x || pt.y < p.y || pt.x > p.x + w || pt.y > p.y + h) continue;
      if (!best || w * h < best.area) best = { id: n.id, abs: p, area: w * h };
    }
    return best;
  }, [rf]);

  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };

  const onDrop = (e) => {
    e.preventDefault();
    const item = CATALOG.find((i) => i.kind === e.dataTransfer.getData('application/x-kind'));
    if (!item) return;
    const abs = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const parent = findParent(abs);
    const node = {
      id: `${item.kind}-${Date.now().toString(36)}`,
      type: item.group ? 'group' : 'service',
      position: parent ? { x: abs.x - parent.abs.x, y: abs.y - parent.abs.y } : abs,
      data: { kind: item.kind, label: item.label, abbr: item.abbr, cat: item.cat, note: '' },
      ...(item.group ? { style: { width: 380, height: 260 }, zIndex: 0 } : { zIndex: 10 }),
      ...(parent ? { parentId: parent.id } : {}),
    };
    setNodes((ns) => order([...ns, node]));
  };

  // drag a service in/out of a group
  const onNodeDragStop = (_e, node) => {
    if (node.type === 'group') return;
    const abs = rf.getInternalNode(node.id).internals.positionAbsolute;
    const center = { x: abs.x + (node.measured?.width ?? 0) / 2, y: abs.y + (node.measured?.height ?? 0) / 2 };
    const parent = findParent(center, node.id);
    if ((parent?.id ?? null) === (node.parentId ?? null)) return;
    setNodes((ns) => order(ns.map((n) => n.id !== node.id ? n : {
      ...n, parentId: parent?.id,
      position: parent ? { x: abs.x - parent.abs.x, y: abs.y - parent.abs.y } : abs,
    })));
  };

  const updateData = (id, patch) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));

  /* ---------- persistence ---------- */
  const save = async () => {
    try {
      const body = { name, data: { nodes: clean(nodes), edges } };
      const d = await api.save(diagramId, body);
      setDiagramId(d.id); setStatus('Saved'); refreshList();
    } catch (e) { setStatus('Save failed: ' + e.message); }
  };
  const open = async (id) => {
    if (!id) return;
    try {
      const d = await api.get(id);
      setNodes(order(d.data.nodes)); setEdges(d.data.edges);
      setName(d.name); setDiagramId(d.id); setStatus('Opened');
      setTimeout(() => rf.fitView({ padding: 0.2 }), 50);
    } catch (e) { setStatus('Open failed: ' + e.message); }
  };
  const newDiagram = () => {
    setNodes([]); setEdges([]); setDiagramId(null); setName('Untitled architecture'); setStatus('');
  };
  const remove = async () => {
    if (!diagramId || !confirm(`Delete "${name}"?`)) return;
    await api.remove(diagramId).catch(() => {});
    newDiagram(); refreshList();
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ name, nodes: clean(nodes), edges }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const exportPng = async () => {
    if (!nodes.length) return;
    try {
      setStatus('Creating image…');
      const b = rf.getNodesBounds(rf.getNodes());
      const W = Math.ceil(b.width + 160), H = Math.ceil(b.height + 160);
      const vp = getViewportForBounds(b, W, H, 0.1, 4, 0.1);
      const url = await toPng(document.querySelector('.react-flow__viewport'), {
        backgroundColor: '#e9eef2', width: W, height: H, pixelRatio: 2,
        style: { width: `${W}px`, height: `${H}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
      });
      const a = Object.assign(document.createElement('a'), { href: url, download: `${name || 'architecture'}.png` });
      a.click(); setStatus('Image downloaded');
    } catch (e) { setStatus('Image export failed: ' + e.message); }
  };

  /* ---------- palette ---------- */
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.entries(CATEGORIES).map(([key, cat]) => ({
      key, ...cat,
      items: CATALOG.filter((i) => i.cat === key && (!q || i.label.toLowerCase().includes(q) || i.abbr.toLowerCase().includes(q))),
    })).filter((g) => g.items.length);
  }, [filter]);

  const selected = nodes.find((n) => n.id === selectedId);

  return (
    <div className="app">
      <header>
        <input className="title" value={name} onChange={(e) => setName(e.target.value)} aria-label="Diagram name" />
        <select value={diagramId || ''} onChange={(e) => open(e.target.value)} aria-label="Open diagram">
          <option value="">Open saved…</option>
          {saved.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={save} className="primary">Save</button>
        <button onClick={newDiagram}>New</button>
        <button onClick={exportPng} disabled={!nodes.length}>Export image</button>
        <button onClick={exportJson} disabled={!nodes.length}>Export JSON</button>
        <button onClick={remove} disabled={!diagramId}>Delete</button>
        <span className="status" role="status">{status}</span>
        <span className="who">{user.username}</span>
        <button onClick={onLogout}>Log out</button>
      </header>

      <aside>
        <input type="search" placeholder="Search components" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {groups.map((g) => (
          <section key={g.key} style={{ '--c': g.color }}>
            <h3>{g.label}</h3>
            {g.items.map((i) => (
              <div key={i.kind} className="item" draggable
                onDragStart={(e) => { e.dataTransfer.setData('application/x-kind', i.kind); e.dataTransfer.effectAllowed = 'copy'; }}>
                <span className="badge">{i.abbr}</span>{i.label}
                {i.group && <em>container</em>}
              </div>
            ))}
          </section>
        ))}
      </aside>

      <main onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeDragStop={onNodeDragStop} onSelectionChange={onSelectionChange}
          connectionMode={ConnectionMode.Loose} defaultEdgeOptions={defaultEdge}
          snapToGrid snapGrid={[10, 10]} fitView minZoom={0.2} deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background gap={20} size={1.2} color="#b6c3cf" />
          <Controls />
          <MiniMap pannable zoomable nodeColor={(n) => CATEGORIES[n.data.cat]?.color || '#999'} />
        </ReactFlow>

        {!nodes.length && (
          <div className="empty">
            Drag a component from the left onto the canvas.<br />
            Drop services inside a VPC, subnet or cluster to nest them. Pull from a dot to connect.
          </div>
        )}

        {selected && (
          <div className="inspector">
            <label>Label
              <input value={selected.data.label} onChange={(e) => updateData(selected.id, { label: e.target.value })} />
            </label>
            <label>Note
              <textarea rows={3} placeholder="e.g. t3.large x3, port 8080" value={selected.data.note}
                onChange={(e) => updateData(selected.id, { note: e.target.value })} />
            </label>
          </div>
        )}
      </main>
    </div>
  );
}
