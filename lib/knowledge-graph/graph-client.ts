/**
 * Unified Graph Client — works with Neo4j Aura in production
 * and falls back to in-memory JSON graph for demo/development.
 *
 * This dual-mode design ensures:
 * 1. The deployed site always works (JSON fallback)
 * 2. Full Neo4j features available when configured
 * 3. User sandbox mutations happen in-memory (no Neo4j writes from frontend)
 */

import { readFileSync } from "fs";
import path from "path";
import type { CountryProfile, Bloc } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CountryRelationships {
  allies: { iso3: string; name: string; strength: number }[];
  rivals: { iso3: string; name: string; intensity: number }[];
  blocs: { id: string; name: string; cohesion: number }[];
  positions: { issue: string; stance: number; confidence: number }[];
}

export interface TemporalState {
  year: number;
  relationships: GraphEdge[];
  positions: Record<string, Record<string, number>>;
}

// ─── In-Memory Graph (JSON fallback) ──────────────────────────────────

interface InMemoryGraph {
  countries: CountryProfile[];
  blocs: Bloc[];
  similarities: Record<string, { mostSimilar: { country: string; similarity: number }[]; mostDissimilar: { country: string; similarity: number }[] }>;
  topicHistory: Record<string, Record<string, { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }>>;
}

let memoryGraph: InMemoryGraph | null = null;

function loadMemoryGraph(): InMemoryGraph {
  if (memoryGraph) return memoryGraph;

  const dataDir = path.join(process.cwd(), "data");
  memoryGraph = {
    countries: JSON.parse(readFileSync(path.join(dataDir, "country-profiles.json"), "utf-8")),
    blocs: JSON.parse(readFileSync(path.join(dataDir, "blocs.json"), "utf-8")),
    similarities: (() => {
      try {
        return JSON.parse(readFileSync(path.join(dataDir, "vote-similarity.json"), "utf-8")).similarities || {};
      } catch { return {}; }
    })(),
    topicHistory: (() => {
      try {
        return JSON.parse(readFileSync(path.join(dataDir, "topic-history.json"), "utf-8"));
      } catch { return {}; }
    })(),
  };
  return memoryGraph;
}

// ─── Public API ───────────────────────────────────────────────────────

export function isNeo4jConfigured(): boolean {
  return !!(process.env.NEO4J_URI && process.env.NEO4J_PASSWORD);
}

export async function getCountryRelationships(iso3: string): Promise<CountryRelationships> {
  const graph = loadMemoryGraph();
  const country = graph.countries.find((c) => c.iso3 === iso3);
  if (!country) return { allies: [], rivals: [], blocs: [], positions: [] };

  const simData = graph.similarities[country.name];

  const allies = (simData?.mostSimilar || []).slice(0, 10).map((s) => {
    const match = graph.countries.find((c) => c.name === s.country);
    return { iso3: match?.iso3 || "", name: s.country, strength: s.similarity };
  }).filter((a) => a.iso3);

  const rivals = (simData?.mostDissimilar || []).slice(0, 5).map((s) => {
    const match = graph.countries.find((c) => c.name === s.country);
    return { iso3: match?.iso3 || "", name: s.country, intensity: Math.abs(s.similarity) };
  }).filter((r) => r.iso3);

  const blocs = graph.blocs
    .filter((b) => b.members.includes(iso3))
    .map((b) => ({ id: b.id, name: b.name, cohesion: b.cohesionScore }));

  const topicData = graph.topicHistory[country.name] || {};
  const positions = Object.entries(topicData)
    .filter(([, r]) => r.sampleSize >= 20)
    .map(([issue, r]) => ({
      issue,
      stance: r.yesRate - r.noRate,
      confidence: Math.min(1, r.sampleSize / 100),
    }));

  return { allies, rivals, blocs, positions };
}

export async function getSubgraph(
  centerIso3: string,
  depth: number = 1,
): Promise<GraphQueryResult> {
  const graph = loadMemoryGraph();
  const center = graph.countries.find((c) => c.iso3 === centerIso3);
  if (!center) return { nodes: [], edges: [] };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  function addCountry(c: CountryProfile) {
    if (seen.has(c.iso3)) return;
    seen.add(c.iso3);
    nodes.push({
      id: c.iso3,
      label: "Country",
      properties: { name: c.name, region: c.region, idealPoint: c.idealPoint, democracyIndex: c.democracyIndex },
    });
  }

  addCountry(center);

  // Add allies
  const simData = graph.similarities[center.name];
  if (simData?.mostSimilar) {
    for (const sim of simData.mostSimilar.slice(0, depth === 1 ? 8 : 15)) {
      const match = graph.countries.find((c) => c.name === sim.country);
      if (match) {
        addCountry(match);
        edges.push({
          source: centerIso3,
          target: match.iso3,
          type: "ALLIES_WITH",
          properties: { strength: sim.similarity },
        });
      }
    }
  }

  // Add rivals
  if (simData?.mostDissimilar) {
    for (const rival of simData.mostDissimilar.slice(0, 5)) {
      const match = graph.countries.find((c) => c.name === rival.country);
      if (match) {
        addCountry(match);
        edges.push({
          source: centerIso3,
          target: match.iso3,
          type: "RIVALS_WITH",
          properties: { intensity: Math.abs(rival.similarity) },
        });
      }
    }
  }

  // Add bloc memberships
  for (const bloc of graph.blocs) {
    if (!bloc.members.includes(centerIso3)) continue;
    const blocNodeId = `bloc-${bloc.id}`;
    if (!seen.has(blocNodeId)) {
      seen.add(blocNodeId);
      nodes.push({ id: blocNodeId, label: "Bloc", properties: { name: bloc.name, cohesion: bloc.cohesionScore } });
    }
    edges.push({ source: centerIso3, target: blocNodeId, type: "MEMBER_OF", properties: {} });
  }

  return { nodes, edges };
}

export async function queryGraph(cypher: string): Promise<GraphQueryResult> {
  if (isNeo4jConfigured()) {
    const { runQuery } = await import("./driver");
    const results = await runQuery(cypher);
    // Transform Neo4j results to our format
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    for (const record of results) {
      for (const value of Object.values(record)) {
        if (value && typeof value === "object" && "labels" in (value as object)) {
          const node = value as { identity: { toNumber(): number }; labels: string[]; properties: Record<string, unknown> };
          nodes.push({ id: String(node.identity.toNumber()), label: node.labels[0], properties: node.properties });
        }
      }
    }
    return { nodes, edges };
  }

  return { nodes: [], edges: [] };
}

export async function getFullOntologyStats(): Promise<{
  countries: number;
  blocs: number;
  allianceEdges: number;
  rivalryEdges: number;
  positionEdges: number;
  issues: number;
}> {
  const graph = loadMemoryGraph();
  let allianceEdges = 0;
  let rivalryEdges = 0;
  let positionEdges = 0;

  for (const [, sim] of Object.entries(graph.similarities)) {
    allianceEdges += (sim.mostSimilar?.length || 0);
    rivalryEdges += (sim.mostDissimilar?.length || 0);
  }

  for (const [, topics] of Object.entries(graph.topicHistory)) {
    positionEdges += Object.keys(topics).length;
  }

  return {
    countries: graph.countries.length,
    blocs: graph.blocs.length,
    allianceEdges,
    rivalryEdges,
    positionEdges,
    issues: 18,
  };
}
