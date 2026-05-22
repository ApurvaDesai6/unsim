import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

let cache: Record<string, unknown> | null = null;

function loadInfluenceNetwork() {
  if (cache) return cache;
  cache = JSON.parse(readFileSync(path.join(process.cwd(), "data", "influence-network.json"), "utf-8"));
  return cache!;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const iso3 = searchParams.get("iso3");
  const entityId = searchParams.get("entity");

  try {
    const network = loadInfluenceNetwork() as {
      entities: { id: string; type: string; name: string; members?: string[] | string; countries?: string[]; recipients?: string[]; influence: string; [key: string]: unknown }[];
      influence_edges: { source: string; target: string; effect: string; mechanism: string; strength: number }[];
    };

    if (action === "all") {
      return NextResponse.json(network);
    }

    if (action === "for-country" && iso3) {
      // Find all entities this country is part of
      const relevantEntities = network.entities.filter((e) => {
        if (Array.isArray(e.members) && e.members.includes(iso3)) return true;
        if (Array.isArray(e.countries) && e.countries.includes(iso3)) return true;
        if (Array.isArray(e.recipients) && e.recipients.includes(iso3)) return true;
        if (e.members === "all-african" && iso3) return true; // Simplified
        return false;
      });

      // Find influence edges from those entities
      const entityIds = new Set(relevantEntities.map((e) => e.id));
      const relevantEdges = network.influence_edges.filter((edge) => entityIds.has(edge.source));

      return NextResponse.json({
        country: iso3,
        influencers: relevantEntities.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.name,
          influence: e.influence,
        })),
        effects: relevantEdges.map((edge) => ({
          source: edge.source,
          sourceName: network.entities.find((e) => e.id === edge.source)?.name || edge.source,
          target: edge.target,
          effect: edge.effect,
          mechanism: edge.mechanism,
          strength: edge.strength,
        })),
      });
    }

    if (action === "entity" && entityId) {
      const entity = network.entities.find((e) => e.id === entityId);
      if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

      const edges = network.influence_edges.filter((e) => e.source === entityId);
      return NextResponse.json({ entity, edges });
    }

    if (action === "for-issue") {
      const issue = searchParams.get("issue") || "";
      const edges = network.influence_edges.filter((e) =>
        e.target.toLowerCase().includes(issue.toLowerCase()),
      );
      return NextResponse.json({
        issue,
        influencers: edges.map((edge) => ({
          ...edge,
          sourceName: network.entities.find((e) => e.id === edge.source)?.name || edge.source,
          sourceType: network.entities.find((e) => e.id === edge.source)?.type || "unknown",
        })),
      });
    }

    return NextResponse.json({ error: "Use ?action=all|for-country|entity|for-issue" }, { status: 400 });
  } catch (e) {
    console.error("Influence API failed:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
