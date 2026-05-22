import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import type { CountryProfile } from "@/types";

let countriesCache: CountryProfile[] | null = null;

function loadCountries(): CountryProfile[] {
  if (countriesCache) return countriesCache;
  countriesCache = JSON.parse(readFileSync(path.join(process.cwd(), "data", "country-profiles.json"), "utf-8"));
  return countriesCache!;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "countries") {
      const countries = loadCountries().map((c) => ({
        iso3: c.iso3,
        name: c.name,
        region: c.region,
        idealPoint: c.idealPoint,
        democracyIndex: c.democracyIndex,
        scStatus: c.scStatus,
        blocs: c.blocs,
      }));
      return NextResponse.json(countries);
    }

    if (action === "regions") {
      const countries = loadCountries();
      const regions: Record<string, { count: number; avgIdealPoint: number; avgDemocracy: number }> = {};
      for (const c of countries) {
        if (!regions[c.region]) regions[c.region] = { count: 0, avgIdealPoint: 0, avgDemocracy: 0 };
        regions[c.region].count++;
        regions[c.region].avgIdealPoint += c.idealPoint;
        regions[c.region].avgDemocracy += c.democracyIndex;
      }
      for (const r of Object.values(regions)) {
        r.avgIdealPoint /= r.count;
        r.avgDemocracy /= r.count;
      }
      return NextResponse.json(regions);
    }

    if (action === "search") {
      const q = (searchParams.get("q") || "").toLowerCase();
      if (!q) return NextResponse.json([]);
      const countries = loadCountries()
        .filter((c) => c.name.toLowerCase().includes(q) || c.iso3.toLowerCase().includes(q))
        .slice(0, 20)
        .map((c) => ({ iso3: c.iso3, name: c.name, region: c.region }));
      return NextResponse.json(countries);
    }

    return NextResponse.json({ error: "Use ?action=countries|regions|search" }, { status: 400 });
  } catch (e) {
    console.error("Explore query failed:", e);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
