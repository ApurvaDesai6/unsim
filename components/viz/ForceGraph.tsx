"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

// ─── Types ────────────────────────────────────────────────────────────

export interface GraphNodeDatum extends SimulationNodeDatum {
  id: string;
  label: string;
  region: string;
  population?: number;
  gdpPerCapita?: number;
  scStatus?: string;
  blocs?: string[];
  isExpanded?: boolean;
  isSeed?: boolean;
}

export interface GraphEdgeDatum extends SimulationLinkDatum<GraphNodeDatum> {
  id: string;
  type: "ALLIES_WITH" | "RIVALS_WITH" | "MEMBER_OF";
  strength?: number;
  intensity?: number;
}

export interface ForceGraphProps {
  nodes: GraphNodeDatum[];
  edges: GraphEdgeDatum[];
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  onNodeHover: (nodeId: string | null) => void;
  showAlliances: boolean;
  showRivalries: boolean;
  width: number;
  height: number;
}

export interface ForceGraphHandle {
  focusNode: (nodeId: string) => void;
  resetView: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────

const REGION_COLORS: Record<string, string> = {
  AFRICAN: "#e6a817",
  APG: "#4b92db",
  EEG: "#9b59b6",
  GRULAC: "#27ae60",
  WEOG: "#e74c3c",
};

const NODE_MIN_RADIUS = 6;
const NODE_MAX_RADIUS = 22;

// ─── Component ────────────────────────────────────────────────────────

const ForceGraph = forwardRef<ForceGraphHandle, ForceGraphProps>(
  function ForceGraph(
    {
      nodes,
      edges,
      selectedNodeId,
      onNodeClick,
      onNodeHover,
      showAlliances,
      showRivalries,
      width,
      height,
    },
    ref
  ) {
    const svgRef = useRef<SVGSVGElement>(null);
    const simulationRef = useRef<Simulation<GraphNodeDatum, GraphEdgeDatum> | null>(null);
    const animFrameRef = useRef<number>(0);
    const transformRef = useRef({ x: 0, y: 0, k: 1 });
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [dragState, setDragState] = useState<{
      nodeId: string;
      startX: number;
      startY: number;
    } | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
    const [, forceUpdate] = useState(0);

    // Filter edges based on toggles
    const visibleEdges = useMemo(() => {
      return edges.filter((e) => {
        if (e.type === "ALLIES_WITH" && !showAlliances) return false;
        if (e.type === "RIVALS_WITH" && !showRivalries) return false;
        return true;
      });
    }, [edges, showAlliances, showRivalries]);

    // Compute node radius based on population
    const getNodeRadius = useCallback((node: GraphNodeDatum) => {
      if (!node.population) return NODE_MIN_RADIUS + 3;
      const pop = Math.log10(Math.max(node.population, 1e5));
      const minPop = 5; // log10(100k)
      const maxPop = 9.2; // log10(1.4B)
      const t = Math.min(1, Math.max(0, (pop - minPop) / (maxPop - minPop)));
      return NODE_MIN_RADIUS + t * (NODE_MAX_RADIUS - NODE_MIN_RADIUS);
    }, []);

    // Initialize / update simulation
    useEffect(() => {
      if (!nodes.length) return;

      const sim = forceSimulation<GraphNodeDatum, GraphEdgeDatum>(nodes)
        .force(
          "link",
          forceLink<GraphNodeDatum, GraphEdgeDatum>(visibleEdges)
            .id((d) => d.id)
            .distance((d) => {
              if (d.type === "ALLIES_WITH") return 80 + (1 - (d.strength || 0.5)) * 60;
              if (d.type === "RIVALS_WITH") return 160;
              return 120;
            })
            .strength((d) => {
              if (d.type === "ALLIES_WITH") return 0.3 + (d.strength || 0.5) * 0.4;
              if (d.type === "RIVALS_WITH") return 0.05;
              return 0.1;
            })
        )
        .force("charge", forceManyBody().strength(-200).distanceMax(400))
        .force("center", forceCenter(width / 2, height / 2).strength(0.05))
        .force("collide", forceCollide<GraphNodeDatum>().radius((d) => getNodeRadius(d) + 4))
        .force("x", forceX(width / 2).strength(0.02))
        .force("y", forceY(height / 2).strength(0.02))
        .alphaDecay(0.02)
        .velocityDecay(0.4);

      simulationRef.current = sim;

      const tick = () => {
        forceUpdate((n) => n + 1);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);

      sim.alpha(1).restart();

      return () => {
        cancelAnimationFrame(animFrameRef.current);
        sim.stop();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes.length, visibleEdges.length, width, height]);

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      focusNode(nodeId: string) {
        const node = nodes.find((n) => n.id === nodeId);
        if (node && node.x != null && node.y != null) {
          const newTransform = {
            x: width / 2 - node.x * 1.5,
            y: height / 2 - node.y * 1.5,
            k: 1.5,
          };
          transformRef.current = newTransform;
          setTransform(newTransform);
        }
      },
      resetView() {
        const newTransform = { x: 0, y: 0, k: 1 };
        transformRef.current = newTransform;
        setTransform(newTransform);
        if (simulationRef.current) {
          simulationRef.current.alpha(0.5).restart();
        }
      },
    }));

    // Mouse wheel zoom
    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const t = transformRef.current;
        const newK = Math.min(4, Math.max(0.3, t.k * delta));
        const ratio = newK / t.k;

        const newTransform = {
          x: mx - (mx - t.x) * ratio,
          y: my - (my - t.y) * ratio,
          k: newK,
        };
        transformRef.current = newTransform;
        setTransform(newTransform);
      },
      []
    );

    // Pan start
    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        // Only pan if not clicking a node
        const target = e.target as SVGElement;
        if (target.closest("[data-node-id]")) return;
        setIsPanning(true);
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          tx: transformRef.current.x,
          ty: transformRef.current.y,
        };
      },
      []
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (isPanning) {
          const dx = e.clientX - panStartRef.current.x;
          const dy = e.clientY - panStartRef.current.y;
          const newTransform = {
            ...transformRef.current,
            x: panStartRef.current.tx + dx,
            y: panStartRef.current.ty + dy,
          };
          transformRef.current = newTransform;
          setTransform(newTransform);
        }
        if (dragState) {
          const node = nodes.find((n) => n.id === dragState.nodeId);
          if (node && simulationRef.current) {
            const t = transformRef.current;
            node.fx = (e.clientX - (svgRef.current?.getBoundingClientRect().left || 0) - t.x) / t.k;
            node.fy = (e.clientY - (svgRef.current?.getBoundingClientRect().top || 0) - t.y) / t.k;
            simulationRef.current.alpha(0.3).restart();
          }
        }
      },
      [isPanning, dragState, nodes]
    );

    const handleMouseUp = useCallback(() => {
      setIsPanning(false);
      if (dragState) {
        const node = nodes.find((n) => n.id === dragState.nodeId);
        if (node) {
          node.fx = null;
          node.fy = null;
        }
        setDragState(null);
      }
    }, [dragState, nodes]);

    // Node drag start
    const handleNodeMouseDown = useCallback(
      (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          setDragState({ nodeId, startX: e.clientX, startY: e.clientY });
          node.fx = node.x;
          node.fy = node.y;
          if (simulationRef.current) {
            simulationRef.current.alphaTarget(0.1).restart();
          }
        }
      },
      [nodes]
    );

    const handleNodeMouseUp = useCallback(
      (e: React.MouseEvent, nodeId: string) => {
        if (dragState) {
          const dx = Math.abs(e.clientX - dragState.startX);
          const dy = Math.abs(e.clientY - dragState.startY);
          if (dx < 5 && dy < 5) {
            onNodeClick(nodeId);
          }
          const node = nodes.find((n) => n.id === dragState.nodeId);
          if (node) {
            node.fx = null;
            node.fy = null;
          }
          setDragState(null);
          if (simulationRef.current) {
            simulationRef.current.alphaTarget(0);
          }
        } else {
          onNodeClick(nodeId);
        }
      },
      [dragState, nodes, onNodeClick]
    );

    const handleNodeHover = useCallback(
      (e: React.MouseEvent, nodeId: string | null) => {
        setHoveredNode(nodeId);
        onNodeHover(nodeId);
        if (nodeId) {
          setTooltipPos({ x: e.clientX, y: e.clientY });
        }
      },
      [onNodeHover]
    );

    const hoveredNodeData = useMemo(
      () => nodes.find((n) => n.id === hoveredNode),
      [nodes, hoveredNode]
    );

    // Get connected nodes for highlighting
    const connectedNodeIds = useMemo(() => {
      if (!selectedNodeId) return new Set<string>();
      const connected = new Set<string>();
      connected.add(selectedNodeId);
      for (const e of edges) {
        const src = typeof e.source === "object" ? (e.source as GraphNodeDatum).id : String(e.source);
        const tgt = typeof e.target === "object" ? (e.target as GraphNodeDatum).id : String(e.target);
        if (src === selectedNodeId) connected.add(tgt);
        if (tgt === selectedNodeId) connected.add(src);
      }
      return connected;
    }, [selectedNodeId, edges]);

    return (
      <div className="relative w-full h-full overflow-hidden">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ background: "transparent" }}
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
            </filter>
          </defs>

          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Edges */}
            {visibleEdges.map((edge) => {
              const src = edge.source as GraphNodeDatum;
              const tgt = edge.target as GraphNodeDatum;
              if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return null;

              const isAlliance = edge.type === "ALLIES_WITH";
              const isRivalry = edge.type === "RIVALS_WITH";
              const thickness = isAlliance
                ? 1 + (edge.strength || 0.5) * 2.5
                : 1 + (edge.intensity || 0.5) * 1.5;

              const isHighlighted =
                selectedNodeId &&
                (src.id === selectedNodeId || tgt.id === selectedNodeId);
              const isDimmed = selectedNodeId && !isHighlighted;

              return (
                <line
                  key={edge.id}
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={isAlliance ? "#27ae60" : "#e74c3c"}
                  strokeWidth={thickness}
                  strokeDasharray={isRivalry ? "6 3" : undefined}
                  opacity={isDimmed ? 0.1 : isHighlighted ? 0.9 : 0.4}
                  className="transition-opacity duration-200"
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              if (node.x == null || node.y == null) return null;
              const radius = getNodeRadius(node);
              const color = REGION_COLORS[node.region] || "#888";
              const isSelected = node.id === selectedNodeId;
              const isConnected = connectedNodeIds.has(node.id);
              const isDimmed = selectedNodeId && !isConnected;
              const isHovered = node.id === hoveredNode;

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onMouseUp={(e) => handleNodeMouseUp(e, node.id)}
                  onMouseEnter={(e) => handleNodeHover(e, node.id)}
                  onMouseLeave={(e) => handleNodeHover(e, null)}
                  className="cursor-pointer"
                  style={{
                    opacity: isDimmed ? 0.25 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                >
                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      r={radius + 6}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.5}
                      opacity={0.7}
                      filter="url(#glow)"
                    />
                  )}
                  {/* Hover ring */}
                  {isHovered && !isSelected && (
                    <circle
                      r={radius + 4}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      opacity={0.5}
                    />
                  )}
                  {/* Main circle */}
                  <circle
                    r={radius}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    filter={isSelected || isHovered ? "url(#shadow)" : undefined}
                  />
                  {/* P5 indicator */}
                  {node.scStatus === "P5" && (
                    <circle
                      r={3}
                      cx={radius * 0.6}
                      cy={-radius * 0.6}
                      fill="#ffd700"
                      stroke="#fff"
                      strokeWidth={1}
                    />
                  )}
                  {/* Label */}
                  {(transform.k > 0.7 || isSelected || isHovered) && (
                    <text
                      y={radius + 12}
                      textAnchor="middle"
                      fontSize={10 / Math.max(transform.k, 0.7)}
                      fill="var(--color-ink)"
                      fontWeight={isSelected ? 600 : 400}
                      className="pointer-events-none select-none"
                      style={{ textShadow: "0 0 3px var(--color-bg), 0 0 6px var(--color-bg)" }}
                    >
                      {node.id}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Tooltip */}
        {hoveredNodeData && (
          <div
            className="absolute pointer-events-none z-50 px-3 py-2 rounded-lg shadow-lg border text-xs max-w-[200px]"
            style={{
              left: tooltipPos.x - (svgRef.current?.getBoundingClientRect().left || 0) + 12,
              top: tooltipPos.y - (svgRef.current?.getBoundingClientRect().top || 0) - 40,
              background: "var(--color-bg)",
              borderColor: "var(--color-border)",
              color: "var(--color-ink)",
            }}
          >
            <div className="font-semibold text-sm">{hoveredNodeData.label}</div>
            <div className="text-[var(--color-muted)] mt-0.5">{hoveredNodeData.id}</div>
            <div className="flex gap-2 mt-1 text-[10px]">
              <span
                className="px-1.5 py-0.5 rounded"
                style={{ background: REGION_COLORS[hoveredNodeData.region] + "22", color: REGION_COLORS[hoveredNodeData.region] }}
              >
                {hoveredNodeData.region}
              </span>
              {hoveredNodeData.scStatus === "P5" && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">P5</span>
              )}
            </div>
            {hoveredNodeData.population && (
              <div className="mt-1 text-[var(--color-muted)]">
                Pop: {(hoveredNodeData.population / 1e6).toFixed(1)}M
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

export default ForceGraph;
