import { NextRequest, NextResponse } from "next/server";
import { getCountryRelationships, getSubgraph, getFullOntologyStats } from "@/lib/knowledge-graph/graph-client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const iso3 = searchParams.get("iso3");
  const depth = parseInt(searchParams.get("depth") || "1");

  try {
    if (action === "stats") {
      const stats = await getFullOntologyStats();
      return NextResponse.json(stats);
    }

    if (action === "relationships" && iso3) {
      const relationships = await getCountryRelationships(iso3);
      return NextResponse.json(relationships);
    }

    if (action === "subgraph" && iso3) {
      const subgraph = await getSubgraph(iso3, depth);
      return NextResponse.json(subgraph);
    }

    return NextResponse.json(
      { error: "Invalid query. Use ?action=stats|relationships|subgraph&iso3=USA" },
      { status: 400 },
    );
  } catch (e) {
    console.error("KG query failed:", e);
    return NextResponse.json({ error: "Knowledge graph query failed" }, { status: 500 });
  }
}
