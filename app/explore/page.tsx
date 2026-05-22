"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Globe, X, ExternalLink, Users, Swords, Shield } from "lucide-react";
import ForceGraph, {
  type GraphNodeDatum,
  type GraphEdgeDatum,
  type ForceGraphHandle,
} from "@/components/viz/ForceGraph";
import GraphControls from "@/components/viz/GraphControls";

// ─── Types ────────────────────────────────────────────────────────────

interface CountryRelationships {
  allies: { iso3: string; name: string; strength: number }[];
  rivals: { iso3: string; name: string; intensity: number }[];
  blocs: { id: string; name: string; cohesion: number }[];
  positions: { issue: string; stance: string; confidence: number }[];
}

interface SubgraphResponse {
  nodes: { id: string; label: string; properties: Record<string, unknown> }[];
  edges: { source: string; target: string; type: string; properties: Record<string, unknown> }[];
}

interface CountryBasic {
  iso3: string;
  name: string;
  region: string;
  idealPoint?: number;
  democracyIndex?: number;
  scStatus?: string;
  blocs?: string[];
}

// ─── Seed Countries ───────────────────────────────────────────────────

const SEED_COUNTRIES = [
  // P5
  "USA", "GBR", "FRA", "RUS", "CHN",
  // Major regional powers
  "IND", "BRA", "DEU", "JPN", "ZAF",
  "NGA", "EGY", "SAU", "AUS", "MEX",
  "IDN", "TUR", "KOR", "ARG", "PAK",
  // G77 leaders / influential states
  "CUB", "IRN", "ISR", "UKR", "POL",
  "KEN", "COL", "THA", "SWE", "NOR",
];

// ─── Constants ────────────────────────────────────────────────────────

const MAX_NODES = 100;

const REGION_COLORS: Record<string, string> = {
  AFRICAN: "#e6a817",
  APG: "#4b92db",
  EEG: "#9b59b6",
  GRULAC: "#27ae60",
  WEOG: "#e74c3c",
};

// ─── Page Component ───────────────────────────────────────────────────

export default function ExplorePage() {
  const [nodes, setNodes] = useState<GraphNodeDatum[]>([]);
  const [edges, setEdges] = useState<GraphEdgeDatum[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<CountryRelationships | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showAlliances, setShowAlliances] = useState(true);
  const [showRivalries, setShowRivalries] = useState(true);
  const [regionFilters, setRegionFilters] = useState<Record<string, boolean>>({
    AFRICAN: true,
    APG: true,
    EEG: true,
    GRULAC: true,
    WEOG: true,
  });
  const [depth, setDepth] = useState(1);
  const [loading, setLoading] = useState(true);
  const [graphSize, setGraphSize] = useState({ width: 800, height: 600 });
  const [showPanel, setShowPanel] = useState(false);

  const graphRef = useRef<ForceGraphHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const expandedNodesRef = useRef(new Set<string>());
  const countryCacheRef = useRef<Map<string, CountryBasic>>(new Map());

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setGraphSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load country list for enrichment
  useEffect(() => {
    fetch("/api/kg/explore?action=countries")
      .then((r) => r.json())
      .then((countries: CountryBasic[]) => {
        for (const c of countries) {
          countryCacheRef.current.set(c.iso3, c);
        }
      })
      .catch(() => {});
  }, []);

  // Build seed graph
  useEffect(() => {
    async function loadSeed() {
      setLoading(true);
      try {
        // Load subgraphs for a few key P5 members to get edges
        const seedPromises = ["USA", "CHN", "RUS", "GBR", "FRA"].map((iso3) =>
          fetch(`/api/kg/query?action=subgraph&iso3=${iso3}&depth=1`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        );
        const results = await Promise.all(seedPromises);

        const nodeMap = new Map<string, GraphNodeDatum>();
        const edgeMap = new Map<string, GraphEdgeDatum>();

        // Add seed countries first
        for (const iso3 of SEED_COUNTRIES) {
          const cached = countryCacheRef.current.get(iso3);
          nodeMap.set(iso3, {
            id: iso3,
            label: cached?.name || iso3,
            region: cached?.region || "APG",
            population: undefined,
            scStatus: cached?.scStatus,
            blocs: cached?.blocs,
            isSeed: true,
          });
        }

        // Enrich with subgraph data
        for (const result of results) {
          if (!result) continue;
          const sg = result as SubgraphResponse;
          for (const n of sg.nodes) {
            if (nodeMap.has(n.id) || SEED_COUNTRIES.includes(n.id)) {
              const existing = nodeMap.get(n.id);
              if (existing) {
                existing.label = n.label || existing.label;
                existing.population = (n.properties?.population as number) || existing.population;
                existing.gdpPerCapita = (n.properties?.gdpPerCapita as number) || existing.gdpPerCapita;
                existing.region = (n.properties?.region as string) || existing.region;
                existing.scStatus = (n.properties?.scStatus as string) || existing.scStatus;
              }
            } else if (nodeMap.size < MAX_NODES) {
              nodeMap.set(n.id, {
                id: n.id,
                label: n.label || n.id,
                region: (n.properties?.region as string) || "APG",
                population: n.properties?.population as number,
                gdpPerCapita: n.properties?.gdpPerCapita as number,
                scStatus: n.properties?.scStatus as string,
                blocs: n.properties?.blocs as string[],
              });
            }
          }
          for (const e of sg.edges) {
            const edgeId = `${e.source}-${e.type}-${e.target}`;
            const reverseId = `${e.target}-${e.type}-${e.source}`;
            if (!edgeMap.has(edgeId) && !edgeMap.has(reverseId)) {
              if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
                const type = e.type as GraphEdgeDatum["type"];
                if (type === "ALLIES_WITH" || type === "RIVALS_WITH") {
                  edgeMap.set(edgeId, {
                    id: edgeId,
                    source: e.source,
                    target: e.target,
                    type,
                    strength: e.properties?.strength as number,
                    intensity: e.properties?.intensity as number,
                  });
                }
              }
            }
          }
        }

        // If no real edges came back (API might not be connected), generate some
        // placeholder edges from known alliances for visualization
        if (edgeMap.size === 0) {
          const knownAlliances: [string, string, number][] = [
            ["USA", "GBR", 0.95], ["USA", "FRA", 0.8], ["USA", "DEU", 0.85],
            ["USA", "JPN", 0.9], ["USA", "KOR", 0.8], ["USA", "AUS", 0.9],
            ["USA", "ISR", 0.85], ["GBR", "FRA", 0.75], ["GBR", "AUS", 0.85],
            ["FRA", "DEU", 0.9], ["RUS", "CHN", 0.7], ["RUS", "IRN", 0.6],
            ["RUS", "CUB", 0.55], ["CHN", "PAK", 0.7], ["CHN", "IRN", 0.55],
            ["IND", "JPN", 0.6], ["IND", "FRA", 0.55], ["BRA", "ARG", 0.7],
            ["BRA", "ZAF", 0.5], ["ZAF", "NGA", 0.55], ["SAU", "EGY", 0.6],
            ["TUR", "PAK", 0.5], ["SWE", "NOR", 0.9], ["MEX", "COL", 0.6],
            ["IDN", "THA", 0.6], ["KEN", "NGA", 0.5], ["POL", "UKR", 0.65],
            ["DEU", "POL", 0.6], ["JPN", "AUS", 0.7], ["IND", "USA", 0.6],
          ];
          const knownRivalries: [string, string, number][] = [
            ["USA", "RUS", 0.8], ["USA", "CHN", 0.7], ["USA", "IRN", 0.9],
            ["USA", "CUB", 0.7], ["RUS", "UKR", 0.95], ["IND", "PAK", 0.85],
            ["ISR", "IRN", 0.9], ["CHN", "JPN", 0.5], ["SAU", "IRN", 0.8],
            ["GBR", "ARG", 0.4], ["TUR", "RUS", 0.4], ["CHN", "IND", 0.5],
            ["KOR", "CHN", 0.4], ["POL", "RUS", 0.7],
          ];
          for (const [src, tgt, strength] of knownAlliances) {
            if (nodeMap.has(src) && nodeMap.has(tgt)) {
              const id = `${src}-ALLIES_WITH-${tgt}`;
              edgeMap.set(id, { id, source: src, target: tgt, type: "ALLIES_WITH", strength });
            }
          }
          for (const [src, tgt, intensity] of knownRivalries) {
            if (nodeMap.has(src) && nodeMap.has(tgt)) {
              const id = `${src}-RIVALS_WITH-${tgt}`;
              edgeMap.set(id, { id, source: src, target: tgt, type: "RIVALS_WITH", intensity });
            }
          }
        }

        setNodes(Array.from(nodeMap.values()));
        setEdges(Array.from(edgeMap.values()));
      } catch (e) {
        console.error("Failed to load seed graph:", e);
        // Create minimal seed anyway
        const fallbackNodes: GraphNodeDatum[] = SEED_COUNTRIES.map((iso3) => {
          const cached = countryCacheRef.current.get(iso3);
          return {
            id: iso3,
            label: cached?.name || iso3,
            region: cached?.region || "APG",
            scStatus: cached?.scStatus,
            isSeed: true,
          };
        });
        setNodes(fallbackNodes);
      } finally {
        setLoading(false);
      }
    }
    // Small delay to let country cache populate
    const timer = setTimeout(loadSeed, 300);
    return () => clearTimeout(timer);
  }, []);

  // Expand node neighborhood
  const expandNode = useCallback(
    async (nodeId: string) => {
      if (expandedNodesRef.current.has(nodeId)) return;
      if (nodes.length >= MAX_NODES) return;

      expandedNodesRef.current.add(nodeId);

      try {
        const res = await fetch(`/api/kg/query?action=subgraph&iso3=${nodeId}&depth=${depth}`);
        if (!res.ok) return;
        const sg: SubgraphResponse = await res.json();

        setNodes((prev) => {
          const existing = new Set(prev.map((n) => n.id));
          const newNodes: GraphNodeDatum[] = [];
          for (const n of sg.nodes) {
            if (!existing.has(n.id) && prev.length + newNodes.length < MAX_NODES) {
              newNodes.push({
                id: n.id,
                label: n.label || n.id,
                region: (n.properties?.region as string) || "APG",
                population: n.properties?.population as number,
                gdpPerCapita: n.properties?.gdpPerCapita as number,
                scStatus: n.properties?.scStatus as string,
                blocs: n.properties?.blocs as string[],
              });
            }
          }
          if (newNodes.length === 0) return prev;
          // Mark the expanded node
          return prev.map((n) => (n.id === nodeId ? { ...n, isExpanded: true } : n)).concat(newNodes);
        });

        setEdges((prev) => {
          const existingEdgeIds = new Set(prev.map((e) => e.id));
          const newEdges: GraphEdgeDatum[] = [];
          for (const e of sg.edges) {
            const type = e.type as GraphEdgeDatum["type"];
            if (type !== "ALLIES_WITH" && type !== "RIVALS_WITH") continue;
            const edgeId = `${e.source}-${e.type}-${e.target}`;
            const reverseId = `${e.target}-${e.type}-${e.source}`;
            if (!existingEdgeIds.has(edgeId) && !existingEdgeIds.has(reverseId)) {
              newEdges.push({
                id: edgeId,
                source: e.source,
                target: e.target,
                type,
                strength: e.properties?.strength as number,
                intensity: e.properties?.intensity as number,
              });
            }
          }
          return newEdges.length > 0 ? [...prev, ...newEdges] : prev;
        });
      } catch (e) {
        console.error("Failed to expand node:", e);
      }
    },
    [depth, nodes.length]
  );

  // Handle node click
  const handleNodeClick = useCallback(
    async (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setShowPanel(true);
      setDetailsLoading(true);
      setSelectedDetails(null);

      // Expand the neighborhood
      expandNode(nodeId);

      // Load details
      try {
        const res = await fetch(`/api/kg/query?action=relationships&iso3=${nodeId}`);
        if (res.ok) {
          const data: CountryRelationships = await res.json();
          setSelectedDetails(data);
        }
      } catch {
        // silently fail
      } finally {
        setDetailsLoading(false);
      }

      // Focus the graph
      graphRef.current?.focusNode(nodeId);
    },
    [expandNode]
  );

  // Handle node hover
  const handleNodeHover = useCallback((_nodeId: string | null) => {
    // Could add hover state for cross-component effects
  }, []);

  // Select country from search
  const handleSelectCountry = useCallback(
    (iso3: string) => {
      // If node doesn't exist yet, add it
      setNodes((prev) => {
        if (prev.find((n) => n.id === iso3)) return prev;
        const cached = countryCacheRef.current.get(iso3);
        return [
          ...prev,
          {
            id: iso3,
            label: cached?.name || iso3,
            region: cached?.region || "APG",
            scStatus: cached?.scStatus,
            blocs: cached?.blocs,
          },
        ];
      });
      // Give it a frame to appear then select
      setTimeout(() => handleNodeClick(iso3), 50);
    },
    [handleNodeClick]
  );

  // Filter nodes by region
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => regionFilters[n.region] !== false);
  }, [nodes, regionFilters]);

  const filteredEdges = useMemo(() => {
    const visibleIds = new Set(filteredNodes.map((n) => n.id));
    return edges.filter((e) => {
      const src = typeof e.source === "object" ? (e.source as GraphNodeDatum).id : String(e.source);
      const tgt = typeof e.target === "object" ? (e.target as GraphNodeDatum).id : String(e.target);
      return visibleIds.has(src) && visibleIds.has(tgt);
    });
  }, [filteredNodes, edges]);

  const visibleEdgeCount = useMemo(() => {
    return filteredEdges.filter((e) => {
      if (e.type === "ALLIES_WITH" && !showAlliances) return false;
      if (e.type === "RIVALS_WITH" && !showRivalries) return false;
      return true;
    }).length;
  }, [filteredEdges, showAlliances, showRivalries]);

  // Reset
  const handleReset = useCallback(() => {
    graphRef.current?.resetView();
    setSelectedNodeId(null);
    setSelectedDetails(null);
    setShowPanel(false);
  }, []);

  // Selected node label
  const selectedNodeLabel = useMemo(() => {
    if (!selectedNodeId) return "";
    const node = nodes.find((n) => n.id === selectedNodeId);
    return node?.label || selectedNodeId;
  }, [selectedNodeId, nodes]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-white/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-[var(--color-un-blue)]" />
          <h1 className="text-lg font-semibold">Knowledge Graph Explorer</h1>
          <span className="text-xs text-[var(--color-muted)] hidden sm:inline">
            Interactive country relationship visualization
          </span>
        </div>
        <a
          href="/"
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-un-blue)] transition-colors flex items-center gap-1"
        >
          Back to UNSim
          <ExternalLink className="w-3 h-3" />
        </a>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Controls */}
        <aside className="w-[260px] border-r border-[var(--color-border)] bg-white/50 flex-shrink-0 hidden lg:flex flex-col">
          <GraphControls
            showAlliances={showAlliances}
            showRivalries={showRivalries}
            onToggleAlliances={() => setShowAlliances((v) => !v)}
            onToggleRivalries={() => setShowRivalries((v) => !v)}
            regionFilters={regionFilters}
            onToggleRegion={(region) =>
              setRegionFilters((f) => ({ ...f, [region]: !f[region] }))
            }
            depth={depth}
            onDepthChange={setDepth}
            onResetView={handleReset}
            onSelectCountry={handleSelectCountry}
            visibleNodes={filteredNodes.length}
            visibleEdges={visibleEdgeCount}
          />
        </aside>

        {/* Graph Area */}
        <main className="flex-1 relative" ref={containerRef}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[var(--color-muted)]">Loading knowledge graph...</p>
              </div>
            </div>
          ) : (
            <ForceGraph
              ref={graphRef}
              nodes={filteredNodes}
              edges={filteredEdges}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              showAlliances={showAlliances}
              showRivalries={showRivalries}
              width={graphSize.width}
              height={graphSize.height}
            />
          )}

          {/* Mobile controls overlay */}
          <div className="lg:hidden absolute top-3 left-3 flex gap-2">
            <button
              onClick={() => setShowAlliances((v) => !v)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm border ${
                showAlliances
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-white border-gray-200 text-gray-500"
              }`}
            >
              Allies
            </button>
            <button
              onClick={() => setShowRivalries((v) => !v)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm border ${
                showRivalries
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-white border-gray-200 text-gray-500"
              }`}
            >
              Rivals
            </button>
            <button
              onClick={handleReset}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm border bg-white border-gray-200 text-gray-600"
            >
              Reset
            </button>
          </div>

          {/* Instruction hint */}
          {!selectedNodeId && !loading && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/90 border border-[var(--color-border)] shadow-sm text-xs text-[var(--color-muted)] backdrop-blur-sm">
              Click a country node to explore its relationships. Scroll to zoom, drag to pan.
            </div>
          )}
        </main>

        {/* Right Detail Panel */}
        {showPanel && selectedNodeId && (
          <aside className="w-[320px] border-l border-[var(--color-border)] bg-white flex-shrink-0 overflow-y-auto animate-fade-in-up">
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between z-10">
              <div>
                <h2 className="font-semibold text-base">{selectedNodeLabel}</h2>
                <span className="text-xs text-[var(--color-muted)]">{selectedNodeId}</span>
              </div>
              <button
                onClick={() => {
                  setShowPanel(false);
                  setSelectedNodeId(null);
                }}
                className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {detailsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : selectedDetails ? (
                <>
                  {/* Allies */}
                  {selectedDetails.allies.length > 0 && (
                    <section>
                      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-600" />
                        Allies ({selectedDetails.allies.length})
                      </h3>
                      <div className="space-y-1.5">
                        {selectedDetails.allies.slice(0, 10).map((ally) => (
                          <button
                            key={ally.iso3}
                            onClick={() => handleSelectCountry(ally.iso3)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-emerald-50/50 transition-colors text-left"
                          >
                            <span className="text-sm">{ally.name}</span>
                            <span className="ml-auto text-[10px] text-[var(--color-muted)]">
                              {(ally.strength * 100).toFixed(0)}%
                            </span>
                            <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${ally.strength * 100}%` }}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Rivals */}
                  {selectedDetails.rivals.length > 0 && (
                    <section>
                      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1.5">
                        <Swords className="w-3.5 h-3.5 text-red-600" />
                        Rivals ({selectedDetails.rivals.length})
                      </h3>
                      <div className="space-y-1.5">
                        {selectedDetails.rivals.slice(0, 10).map((rival) => (
                          <button
                            key={rival.iso3}
                            onClick={() => handleSelectCountry(rival.iso3)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-red-50/50 transition-colors text-left"
                          >
                            <span className="text-sm">{rival.name}</span>
                            <span className="ml-auto text-[10px] text-[var(--color-muted)]">
                              {(rival.intensity * 100).toFixed(0)}%
                            </span>
                            <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 rounded-full"
                                style={{ width: `${rival.intensity * 100}%` }}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Blocs */}
                  {selectedDetails.blocs.length > 0 && (
                    <section>
                      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[var(--color-un-blue)]" />
                        Blocs ({selectedDetails.blocs.length})
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedDetails.blocs.map((bloc) => (
                          <span
                            key={bloc.id}
                            className="px-2.5 py-1 rounded-md text-xs bg-[var(--color-un-blue)]/8 text-[var(--color-un-blue)] border border-[var(--color-un-blue)]/15"
                          >
                            {bloc.name}
                            <span className="ml-1 opacity-60">
                              {(bloc.cohesion * 100).toFixed(0)}%
                            </span>
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Positions */}
                  {selectedDetails.positions.length > 0 && (
                    <section>
                      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-2">
                        Policy Positions
                      </h3>
                      <div className="space-y-2">
                        {selectedDetails.positions.slice(0, 8).map((pos) => (
                          <div
                            key={pos.issue}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-[var(--color-ink)] truncate max-w-[140px]">
                              {pos.issue}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                pos.stance === "support" || pos.stance === "for"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : pos.stance === "oppose" || pos.stance === "against"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {pos.stance}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-sm text-[var(--color-muted)]">
                  <p>No detailed data available.</p>
                  <p className="text-xs mt-1">The knowledge graph may not be connected.</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
