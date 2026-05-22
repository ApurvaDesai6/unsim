import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import type { AnalyzedResolution, Committee, CountryProfile, PolicyDimensions } from "@/types";
import { getCommitteeConfig, isP5, isSCMember } from "@/engines/committees";
import { adjustProfileForYear, compareAcrossYears, ERAS, getEraForYear } from "@/lib/simulation/temporal";

interface TopicRates { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }

let profilesCache: CountryProfile[] | null = null;
let topicHistoryCache: Record<string, Record<string, TopicRates>> | null = null;

function loadData() {
  if (!profilesCache) profilesCache = JSON.parse(readFileSync(path.join(process.cwd(), "data", "country-profiles.json"), "utf-8"));
  if (!topicHistoryCache) {
    try { topicHistoryCache = JSON.parse(readFileSync(path.join(process.cwd(), "data", "topic-history.json"), "utf-8")); }
    catch { topicHistoryCache = {}; }
  }
  return { profiles: profilesCache!, topicHistory: topicHistoryCache! };
}

const ISSUE_MAPPING: Record<string, string[]> = {
  "Palestinian conflict": ["human-rights", "decolonization", "sovereignty"],
  "Nuclear weapons and nuclear material": ["disarmament", "security", "nuclear"],
  "Arms control and disarmament": ["disarmament", "security"],
  "Colonialism": ["decolonization", "sovereignty"],
  "Human rights": ["human-rights"],
  "Economic development": ["development", "trade", "climate", "water", "environment"],
};

function findMatchingIssue(issueWeights: Record<string, number>): string | null {
  let best: string | null = null, bestScore = 0;
  for (const [issue, keywords] of Object.entries(ISSUE_MAPPING)) {
    let score = 0;
    for (const kw of keywords) score += issueWeights[kw] || 0;
    if (score > bestScore) { bestScore = score; best = issue; }
  }
  return best;
}

function softmax3(scores: [number, number, number]): [number, number, number] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max)) as [number, number, number];
  const sum = exps[0] + exps[1] + exps[2];
  return [exps[0] / sum, exps[1] / sum, exps[2] / sum];
}

function simulateForYear(profiles: CountryProfile[], resolution: AnalyzedResolution, year: number, topicHistory: Record<string, Record<string, TopicRates>>) {
  const adjustedProfiles = profiles.map((p) => adjustProfileForYear(p, year));
  const matchedIssue = findMatchingIssue(resolution.issueWeights);
  const dimKeys: (keyof PolicyDimensions)[] = ["sovereignty", "humanRights", "development", "security", "environment", "decolonization"];

  const countryVotes: { iso3: string; name: string; vote: string }[] = [];
  const totals = { yes: 0, no: 0, abstain: 0 };

  for (const country of adjustedProfiles) {
    const vals = Object.values(resolution.policyVector);
    const resPos = vals.reduce((a, b) => a + b, 0) / vals.length;
    const idealScore = 1 - Math.abs(country.idealPoint - resPos) * 1.5;

    let dimSum = 0, wSum = 0;
    for (const k of dimKeys) {
      const rv = resolution.policyVector[k] || 0;
      const w = Math.abs(rv);
      dimSum += (country.policyDimensions[k] || 0) * rv * w;
      wSum += w;
    }
    const dimScore = wSum > 0 ? Math.max(-1, Math.min(1, dimSum / wSum)) : 0;

    let topicScore = 0;
    if (matchedIssue && topicHistory[country.name]?.[matchedIssue]) {
      topicScore = topicHistory[country.name][matchedIssue].yesRate - topicHistory[country.name][matchedIssue].noRate;
    }

    const composite = 0.20 * idealScore + 0.25 * dimScore + 0.55 * topicScore;
    const empiricalAbstain = matchedIssue ? (topicHistory[country.name]?.[matchedIssue]?.abstainRate || 0.1) : 0.1;
    const abstainBias = empiricalAbstain * 1.8 + (1 - Math.abs(composite)) * 0.2;
    const [pYes, pNo, pAbstain] = softmax3([composite * 3.8, -composite * 3.8, abstainBias - 0.3]);

    let vote: string;
    if (pYes >= pNo && pYes >= pAbstain) vote = "Yes";
    else if (pNo >= pYes && pNo >= pAbstain) vote = "No";
    else vote = "Abstain";

    countryVotes.push({ iso3: country.iso3, name: country.name, vote });
    if (vote === "Yes") totals.yes++;
    else if (vote === "No") totals.no++;
    else totals.abstain++;
  }

  return { totals, countryVotes };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resolution, years } = body as { resolution: AnalyzedResolution; years: number[] };

    if (!resolution || !years?.length) {
      return NextResponse.json({ error: "Provide resolution and years array" }, { status: 400 });
    }

    const { profiles, topicHistory } = loadData();

    // Simulate for the base year (2019) and each requested year
    const baseResult = simulateForYear(profiles, resolution, 2019, topicHistory);

    const timelineResults = years.map((year) => {
      const result = simulateForYear(profiles, resolution, year, topicHistory);
      return compareAcrossYears(baseResult, result, year);
    });

    return NextResponse.json({
      baseYear: 2019,
      baseResult: baseResult.totals,
      timeline: timelineResults,
      eras: ERAS.map((e) => ({ name: e.name, years: e.years, description: e.description })),
    });
  } catch (e) {
    console.error("Temporal simulation failed:", e);
    return NextResponse.json({ error: "Temporal simulation failed" }, { status: 500 });
  }
}
