import { useCallback, useEffect, useRef } from 'react';
import type { GraphData } from '../types/api';

const NODE_COLORS: Record<string, string> = {
  playbook: '#f85149',
  play: '#f0883e',
  role: '#d2a8ff',
  taskfile: '#79c0ff',
  task: '#58a6ff',
  handler: '#3fb950',
  block: '#d29922',
  vars_file: '#8b949e',
  module: '#56d364',
  collection: '#a371f7',
};

const MARKER_COLORS: Record<string, string> = {
  flow: '#8b949e',
  contains: '#30363d',
  import: '#58a6ff',
  include: '#d2a8ff',
  dependency: '#f0883e',
  data_flow: '#f778ba',
  notify: '#3fb950',
  listen: '#3fb950',
  vars_include: '#79c0ff',
  rescue: '#f85149',
  always: '#d29922',
  invokes: '#56d364',
  py_imports: '#a371f7',
};

interface NodeInfo {
  id: string;
  type: string;
  name: string;
  fullName: string;
  module: string;
  modLabel: string;
  file: string;
  line: number;
  scope: string;
  yaml: string;
  w: number;
  h: number;
}

function textWidth(str: string, fontSize: number): number {
  return str.length * fontSize * 0.58 + 16;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const GraphVisualization = ({ data }: { data: GraphData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const graphRef = useRef<any>(null);
  const nodeMapRef = useRef<Record<string, NodeInfo>>({});
  const containsChildrenRef = useRef<
    Record<string, Array<{ target: string; pos: number }>>
  >({});
  const edgeDataRef = useRef<
    Array<{ source: string; target: string; type: string; pos: number }>
  >([]);
  const zoomBehaviorRef = useRef<any>(null);
  const groupLayerRef = useRef<any>(null);

  const buildGraph = useCallback(async () => {
    if (!svgRef.current || !containerRef.current) return;
    const d3 = await import('d3');
    const dagre = await import('dagre');

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    const g = new dagre.graphlib.Graph({ multigraph: true, compound: false });
    g.setGraph({
      rankdir: 'TB',
      nodesep: 20,
      ranksep: 40,
      edgesep: 6,
      marginx: 40,
      marginy: 40,
    });
    g.setDefaultEdgeLabel(() => ({}));
    graphRef.current = g;

    const nodeSet = new Set(data.nodes.map(n => n.id));
    const containsChildren: Record<
      string,
      Array<{ target: string; pos: number }>
    > = {};
    const edgeData: Array<{
      source: string;
      target: string;
      type: string;
      pos: number;
    }> = [];

    data.edges.forEach(e => {
      if (!nodeSet.has(e.source) || !nodeSet.has(e.target)) return;
      const type = e.edge_type || 'contains';
      const pos = e.position || 0;
      edgeData.push({ source: e.source, target: e.target, type, pos });
      if (type === 'contains') {
        if (!containsChildren[e.source]) containsChildren[e.source] = [];
        containsChildren[e.source]!.push({ target: e.target, pos });
      }
    });
    Object.values(containsChildren).forEach(arr =>
      arr.sort((a, b) => a.pos - b.pos),
    );
    containsChildrenRef.current = containsChildren;
    edgeDataRef.current = edgeData;

    const nodeMap: Record<string, NodeInfo> = {};
    data.nodes.forEach(n => {
      const dd = n.data as Record<string, unknown>;
      const nt = (dd.node_type as string) || 'task';
      const rawName = (dd.name as string) || n.id.split('/').pop() || n.id;
      const label =
        rawName.length > 40 ? `${rawName.slice(0, 38)  }\u2026` : rawName;
      const mod = (dd.module as string) || '';
      const modLabel = mod.length > 35 ? `${mod.slice(0, 33)  }\u2026` : mod;
      const w = Math.max(
        textWidth(label, 11),
        modLabel ? textWidth(modLabel, 9) : 0,
        70,
      );
      const h = mod ? 38 : 26;
      nodeMap[n.id] = {
        id: n.id,
        type: nt,
        name: label,
        fullName: rawName,
        module: mod,
        modLabel,
        file: (dd.file_path as string) || '',
        line: (dd.line_start as number) || 0,
        scope: (dd.scope as string) || 'owned',
        yaml: (dd.yaml_lines as string) || '',
        w,
        h,
      };
      g.setNode(n.id, { width: w, height: h });
    });
    nodeMapRef.current = nodeMap;

    const execEdges = (data.execution_edges || []).filter(
      e => nodeSet.has(e.source) && nodeSet.has(e.target),
    );
    execEdges.forEach((e, i) =>
      g.setEdge(e.source, e.target, { minlen: 1 }, `exec_${  i}`),
    );
    dagre.layout(g);

    const container = svg.append('g');
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.02, 4])
      .on('zoom', (ev: any) => container.attr('transform', ev.transform));
    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;

    const defs = svg.append('defs');
    Object.entries(MARKER_COLORS).forEach(([type, color]) => {
      defs
        .append('marker')
        .attr('id', `arr-${  type}`)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-3L8,0L0,3')
        .attr('fill', color);
    });

    const groupLayer = container.append('g').attr('class', 'group-layer');
    groupLayerRef.current = groupLayer;

    function edgePoint(nodeId: string, toX: number, toY: number) {
      const dn = g.node(nodeId);
      const nm = nodeMap[nodeId];
      if (!dn || !nm) return null;
      const cx = dn.x;
        const cy = dn.y;
        const hw = nm.w / 2;
        const hh = nm.h / 2;
      const dx = toX - cx;
        const dy = toY - cy;
      if (dx === 0 && dy === 0) return { x: cx, y: cy + hh, nx: 0, ny: 1 };
      const sx = Math.abs(dx) > 0.001 ? hw / Math.abs(dx) : 1e6;
      const sy = Math.abs(dy) > 0.001 ? hh / Math.abs(dy) : 1e6;
      const s = Math.min(sx, sy);
      let nx = 0;
        let ny = 0;
      if (s === sx) nx = dx > 0 ? 1 : -1;
      else ny = dy > 0 ? 1 : -1;
      return { x: cx + dx * s, y: cy + dy * s, nx, ny };
    }

    function drawEdge(group: any, srcId: string, tgtId: string, cls: string) {
      const sn = g.node(srcId);
      const tn = g.node(tgtId);
      if (!sn || !tn || !nodeMap[srcId] || !nodeMap[tgtId]) return;
      const p1 = edgePoint(srcId, tn.x, tn.y);
      const p2 = edgePoint(tgtId, sn.x, sn.y);
      if (!p1 || !p2) return;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const cp = Math.min(dist * 0.4, 60);
      group
        .append('path')
        .attr('class', `graph-edge ${  cls}`)
        .attr(
          'd',
          `M${p1.x},${p1.y} C${p1.x + p1.nx * cp},${p1.y + p1.ny * cp} ${
            p2.x + p2.nx * cp
          },${p2.y + p2.ny * cp} ${p2.x},${p2.y}`,
        )
        .attr('marker-end', `url(#arr-${  cls.split(' ')[0]  })`);
    }

    const flowGroup = container.append('g');
    execEdges.forEach(e => drawEdge(flowGroup, e.source, e.target, 'flow'));
    const xEdgeGroup = container.append('g');
    edgeData.forEach(e => {
      if (e.type !== 'contains' && e.type !== 'include' && e.type !== 'import')
        drawEdge(xEdgeGroup, e.source, e.target, e.type);
    });

    const tooltip = d3.select(containerRef.current).select('.graph-tooltip');
    const nodeGroup = container.append('g');
    Object.values(nodeMap).forEach(n => {
      const dn = g.node(n.id);
      if (!dn) return;
      const x = dn.x - n.w / 2;
        const y = dn.y - n.h / 2;
      const color = NODE_COLORS[n.type] || '#484f58';
      const grp = nodeGroup
        .append('g')
        .attr('transform', `translate(${x},${y})`);
      grp
        .append('rect')
        .attr('class', `graph-node ${  n.scope}`)
        .attr('width', n.w)
        .attr('height', n.h)
        .attr('fill', color)
        .attr('stroke', color);
      if (n.module) {
        grp
          .append('text')
          .attr('class', 'graph-node-label')
          .attr('x', 8)
          .attr('y', 12)
          .text(n.name);
        grp
          .append('text')
          .attr('class', 'graph-node-badge')
          .attr('x', 8)
          .attr('y', 28)
          .attr('fill', color)
          .text(n.modLabel);
      } else {
        grp
          .append('text')
          .attr('class', 'graph-node-label')
          .attr('x', 8)
          .attr('y', n.h / 2)
          .text(n.name);
      }
      grp
        .on('mouseover', () => {
          let h = `<span class="f">type:</span> <span class="v">${escapeHtml(
            n.type,
          )}</span>`;
          if (n.fullName)
            h += ` &middot; <span class="v">${escapeHtml(n.fullName)}</span>`;
          h += '<br>';
          if (n.module)
            h += `<span class="f">module:</span> <span class="v mod">${escapeHtml(
              n.module,
            )}</span><br>`;
          if (n.file)
            h += `<span class="f">file:</span> <span class="v">${escapeHtml(
              n.file,
            )}</span>`;
          if (n.line) h += `:<span class="v">${n.line}</span>`;
          if (n.file) h += '<br>';
          if (n.yaml) h += `<pre>${escapeHtml(n.yaml)}</pre>`;
          tooltip.html(h).style('display', 'block');
        })
        .on('mousemove', (ev: any) => {
          const rect = containerRef.current!.getBoundingClientRect();
          tooltip
            .style('left', `${ev.clientX - rect.left + 14  }px`)
            .style('top', `${ev.clientY - rect.top - 14  }px`);
        })
        .on('mouseout', () => tooltip.style('display', 'none'));
    });

    const gInfo = g.graph();
    const gw = gInfo.width || 800;
      const gh = gInfo.height || 600;
    const scale = Math.min(W / (gw + 80), H / (gh + 80), 1.5) * 0.9;
    const tx = (W - gw * scale) / 2;
      const ty = (H - gh * scale) / 2;
    svg
      .transition()
      .duration(500)
      .call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      );
  }, [data]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  const fitAll = useCallback(async () => {
    if (
      !svgRef.current ||
      !containerRef.current ||
      !graphRef.current ||
      !zoomBehaviorRef.current
    )
      return;
    const d3 = await import('d3');
    const svg = d3.select(svgRef.current);
    const W = containerRef.current.clientWidth;
      const H = containerRef.current.clientHeight;
    const gInfo = graphRef.current.graph();
    const gw = gInfo.width || 800;
      const gh = gInfo.height || 600;
    const scale = Math.min(W / (gw + 80), H / (gh + 80), 1.5) * 0.9;
    const tx = (W - gw * scale) / 2;
      const ty = (H - gh * scale) / 2;
    svg
      .transition()
      .duration(500)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      );
  }, []);

  const zoomIn = useCallback(async () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const d3 = await import('d3');
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleBy, 1.4);
  }, []);

  const zoomOut = useCallback(async () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const d3 = await import('d3');
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleBy, 0.7);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '70vh',
        minHeight: 400,
        background: '#0d1117',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <style>{`
        .graph-edge { fill: none; stroke: #484f58; stroke-width: 1.2; }
        .graph-edge.flow { stroke: #8b949e; stroke-width: 1.6; }
        .graph-edge.contains { stroke: #30363d; stroke-opacity: 0.18; stroke-width: 0.6; }
        .graph-edge.import { stroke: #58a6ff; stroke-dasharray: 6 3; }
        .graph-edge.include { stroke: #d2a8ff; stroke-dasharray: 4 4; }
        .graph-edge.dependency { stroke: #f0883e; stroke-width: 1.8; }
        .graph-edge.notify { stroke: #3fb950; stroke-dasharray: 2 4; }
        .graph-node { rx: 4; ry: 4; stroke-width: 1.5; cursor: pointer; }
        .graph-node.owned { fill-opacity: 0.15; }
        .graph-node.referenced { fill-opacity: 0.05; stroke-dasharray: 4 2; }
        .graph-node-label { font-size: 11px; fill: #e6edf3; pointer-events: none; dominant-baseline: central; }
        .graph-node-badge { font-size: 9px; fill-opacity: 0.7; pointer-events: none; dominant-baseline: central; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .graph-tooltip { position: absolute; background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 10px 14px; font-size: 12px; pointer-events: none; display: none; max-width: 600px; z-index: 20; line-height: 1.6; box-shadow: 0 4px 12px rgba(0,0,0,0.4); color: #c9d1d9; }
        .graph-tooltip .f { color: #8b949e; } .graph-tooltip .v { color: #c9d1d9; font-family: monospace; font-size: 11px; } .graph-tooltip .v.mod { color: #d2a8ff; }
        .graph-tooltip pre { margin-top: 6px; padding: 8px; background: #0d1117; border: 1px solid #21262d; border-radius: 4px; font-family: monospace; font-size: 10px; color: #c9d1d9; white-space: pre; overflow-x: auto; max-height: 300px; }
        .graph-group-rect { pointer-events: none; rx: 8; ry: 8; }
      `}</style>
      <svg
        ref={svgRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
      <div className="graph-tooltip" />
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          padding: '8px 12px',
          fontSize: 12,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={fitAll}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#c9d1d9',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Fit
        </button>
        <button
          type="button"
          onClick={zoomIn}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#c9d1d9',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          +
        </button>
        <button
          type="button"
          onClick={zoomOut}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#c9d1d9',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          &minus;
        </button>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          padding: '12px 16px',
          fontSize: 11,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          zIndex: 10,
          color: '#c9d1d9',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Nodes</div>
        {Object.entries(NODE_COLORS)
          .slice(0, 8)
          .map(([type, color]) => (
            <div
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                margin: '3px 0',
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: color,
                  flexShrink: 0,
                }}
              />
              {type}
            </div>
          ))}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          padding: '8px 14px',
          fontSize: 12,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          zIndex: 10,
          color: '#c9d1d9',
        }}
      >
        {data.nodes.length} nodes &middot; {data.edges.length} edges
      </div>
    </div>
  );
};
