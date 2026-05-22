import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import type { AnalyzedResolution, Committee, CountryProfile, PolicyDimensions, CountryVote, VoteResult } from "@/types";
import { getCommitteeConfig, isP5, isSCMember } from "@/engines/committees";

interface TopicRates { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }
interface SimilarCountry { country: string; similarity: number; shared: number }
interface CountrySimilarities { mostSimilar: SimilarCountry[]; mostDissimilar: SimilarCountry[] }

let profilesCache: CountryProfile[] | null = null;
let topicHistoryCache: Record<string, Record<string, TopicRates>> | null = null;
let similaritiesCache: Record<string, CountrySimilarities> | null = null;

function loadData() {
  if (!profilesCache) {
    profilesCache = JSON.parse(readFileSync(path.join(process.cwd(), "data", "country-profiles.json"), "utf-8"));
  }
  if (!topicHistoryCache) {
    try { topicHistoryCache = JSON.parse(readFileSync(path.join(process.cwd(), "data", "topic-history.json"), "utf-8")); }
    catch { topicHistoryCache = {}; }
  }
  if (!similaritiesCache) {
    try {
      const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data", "vote-similarity.json"), "utf-8"));
      similaritiesCache = raw.similarities || {};
    } catch { similaritiesCache = {}; }
  }
  return { profiles: profilesCache!, topicHistory: topicHistoryCache!, similarities: similaritiesCache! };
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
  let best: string | null = null;
  let bestScore = 0;
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

function simulate(
  profiles: CountryProfile[],
  resolution: AnalyzedResolution,
  committee: Committee,
  topicHistory: Record<string, Record<string, TopicRates>>,
  similarities: Record<string, CountrySimilarities>,
): VoteResult {
  const config = getCommitteeConfig(committee);
  const members = committee === "SECURITY_COUNCIL"
    ? profiles.filter((p) => isSCMember(p.iso3))
    : profiles;

  const matchedIssue = findMatchingIssue(resolution.issueWeights);
  const dimKeys: (keyof PolicyDimensions)[] = ["sovereignty", "humanRights", "development", "security", "environment", "decolonization"];

  // First pass
  const firstPass = new Map<string, { yes: number; no: number; abstain: number }>();
  for (const country of members) {
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
      const r = topicHistory[country.name][matchedIssue];
      topicScore = r.yesRate - r.noRate;
    }

    const comp = 0.15 * idealScore + 0.20 * dimScore + 0.45 * topicScore;
    const [pY, pN, pA] = softmax3([comp * 3.5, -comp * 3.5, -0.3]);
    firstPass.set(country.name, { yes: pY, no: pN, abstain: pA });
  }

  // Second pass with collaborative filtering
  const countryVotes: CountryVote[] = [];
  const totals = { yes: 0, no: 0, abstain: 0 };

  for (const country of members) {
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

    let topicScore = 0, topicConf = 0;
    if (matchedIssue && topicHistory[country.name]?.[matchedIssue]) {
      const r = topicHistory[country.name][matchedIssue];
      topicScore = r.yesRate - r.noRate;
      topicConf = Math.min(1, r.sampleSize / 80);
    }

    let collabScore = 0;
    const cs = similarities[country.name];
    if (cs?.mostSimilar) {
      let cSum = 0, cTotal = 0;
      for (const sim of cs.mostSimilar.slice(0, 8)) {
        const peer = firstPass.get(sim.country);
        if (!peer) continue;
        cSum += (peer.yes - peer.no) * sim.similarity;
        cTotal += Math.abs(sim.similarity);
      }
      if (cTotal > 0) collabScore = Math.max(-1, Math.min(1, cSum / cTotal));
    }

    const composite =
      0.15 * idealScore +
      0.20 * dimScore +
      0.40 * topicScore * (topicConf > 0.3 ? 1 : 0.5) +
      0.25 * collabScore;

    const empiricalAbstain = matchedIssue ? (topicHistory[country.name]?.[matchedIssue]?.abstainRate || 0.1) : 0.1;
    const abstainBias = empiricalAbstain * 2.0 + (1 - Math.abs(composite)) * 0.2;

    const [pYes, pNo, pAbstain] = softmax3([composite * 4.0, -composite * 4.0, abstainBias - 0.3]);

    let vote: "Yes" | "No" | "Abstain";
    if (pYes >= pNo && pYes >= pAbstain) vote = "Yes";
    else if (pNo >= pYes && pNo >= pAbstain) vote = "No";
    else vote = "Abstain";

    countryVotes.push({
      iso3: country.iso3,
      name: country.name,
      vote,
      probability: { yes: pYes, no: pNo, abstain: pAbstain },
      confidence: Math.max(pYes, pNo, pAbstain),
      factors: [
        { name: "Ideal Point", weight: 0.15, score: idealScore, description: "Voeten empirical position" },
        { name: "Policy Dimensions", weight: 0.20, score: dimScore, description: "6-dim alignment" },
        { name: "Topic History", weight: 0.40, score: topicScore, description: `${matchedIssue || "unmatched"} voting pattern (n=${topicHistory[country.name]?.[matchedIssue || ""]?.sampleSize || 0})` },
        { name: "Peer Similarity", weight: 0.25, score: collabScore, description: "Collaborative filter from most similar voting partners" },
      ],
    });

    if (vote === "Yes") totals.yes++;
    else if (vote === "No") totals.no++;
    else totals.abstain++;
  }

  let passed: boolean;
  let vetoedBy: string[] | undefined;

  if (config.hasVeto) {
    vetoedBy = countryVotes.filter((v) => isP5(v.iso3) && v.vote === "No").map((v) => v.iso3);
    passed = vetoedBy.length === 0 && totals.yes / (totals.yes + totals.no || 1) >= config.threshold;
  } else {
    const voting = totals.yes + totals.no;
    passed = voting > 0 && totals.yes / voting >= config.threshold;
  }

  return { committee, totals, passed, vetoedBy: vetoedBy?.length ? vetoedBy : undefined, countryVotes, timestamp: Date.now() };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resolution, committee } = body as { resolution: AnalyzedResolution; committee: Committee };

    if (!resolution) {
      return NextResponse.json({ error: "No resolution provided" }, { status: 400 });
    }

    const { profiles, topicHistory, similarities } = loadData();
    const result = simulate(profiles, resolution, committee || resolution.committee, topicHistory, similarities);

    return NextResponse.json({ result });
  } catch (e) {
    console.error("Simulation failed:", e);
    return NextResponse.json({ error: "Simulation failed" }, { status: 500 });
  }
}
