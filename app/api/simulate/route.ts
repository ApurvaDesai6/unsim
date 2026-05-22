import { NextRequest, NextResponse } from "next/server";
import type { AnalyzedResolution, Committee, Bloc } from "@/types";
import { simulateVotes } from "@/engines/vote-engine";
import { loadCountryProfiles, loadBlocs } from "@/lib/data/loader";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resolution, committee } = body as {
      resolution: AnalyzedResolution;
      committee: Committee;
    };

    if (!resolution) {
      return NextResponse.json({ error: "No resolution provided" }, { status: 400 });
    }

    const profiles = await loadCountryProfiles();
    const blocs = await loadBlocs();

    const result = simulateVotes(profiles, resolution, committee, blocs);

    return NextResponse.json({ result });
  } catch (e) {
    console.error("Simulation failed:", e);
    return NextResponse.json(
      { error: "Simulation failed" },
      { status: 500 },
    );
  }
}
