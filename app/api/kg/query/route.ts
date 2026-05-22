import { NextRequest, NextResponse } from "next/server";
import {
  getAlliances,
  getRivalries,
  getBlocMemberships,
  getIssuePositions,
  getGraphStats,
  getSubgraphForViz,
  getCountryNode,
  predictVoteFromGraph,
} from "@/lib/knowledge-graph";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const iso3 = searchParams.get("iso3");
  const depth = parseInt(searchParams.get("depth") || "1");
  const issue = searchParams.get("issue");

  try {
    if (action === "stats") {
      return NextResponse.json(getGraphStats());
    }

    if (action === "relationships" && iso3) {
      return NextResponse.json({
        country: getCountryNode(iso3),
        allies: getAlliances(iso3),
        rivals: getRivalries(iso3),
        blocs: getBlocMemberships(iso3),
        positions: getIssuePositions(iso3),
      });
    }

    if (action === "subgraph" && iso3) {
      return NextResponse.json(getSubgraphForViz(iso3, depth));
    }

    if (action === "predict" && iso3 && issue) {
      return NextResponse.json(predictVoteFromGraph(iso3, issue));
    }

    return NextResponse.json(
      { error: "Use ?action=stats|relationships|subgraph|predict&iso3=USA&issue=Palestinian+conflict" },
      { status: 400 },
    );
  } catch (e) {
    console.error("KG query failed:", e);
    return NextResponse.json({ error: "Knowledge graph query failed" }, { status: 500 });
  }
}
