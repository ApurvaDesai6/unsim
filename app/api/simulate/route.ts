import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import type { AnalyzedResolution, Committee, CountryProfile, PolicyDimensions, CountryVote, VoteResult, PositionFactor } from "@/types";
import { getCommitteeConfig, isP5, isSCMember } from "@/engines/committees";
import { buildFeatureVector, predictWithModel } from "@/engines/trained-model";
import { predictVoteFromGraph } from "@/lib/knowledge-graph";

interface TopicRates { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }
interface SimilarCountry { country: string; similarity: number; shared: number }
interface CountrySimilarities { mostSimilar: SimilarCountry[]; mostDissimilar: SimilarCountry[] }

let profilesCache: CountryProfile[] | null = null;
let topicHistoryCache: Record<string, Record<string, TopicRates>> | null = null;
let similaritiesCache: Record<string, CountrySimilarities> | null = null;

function loadData() {
  const dataDir = path.join(process.cwd(), "data");
  if (!profilesCache) profilesCache = JSON.parse(readFileSync(path.join(dataDir, "country-profiles.json"), "utf-8"));
  if (!topicHistoryCache) {
    try { topicHistoryCache = JSON.parse(readFileSync(path.join(dataDir, "topic-history.json"), "utf-8")); }
    catch { topicHistoryCache = {}; }
  }
  if (!similaritiesCache) {
    try { const raw = JSON.parse(readFileSync(path.join(dataDir, "vote-similarity.json"), "utf-8")); similaritiesCache = raw.similarities || {}; }
    catch { similaritiesCache = {}; }
  }
  return { profiles: profilesCache!, topicHistory: topicHistoryCache!, similarities: similaritiesCache! };
}

const ISSUE_MAPPING: Record<string, string[]> = {
  "Palestinian conflict": ["human-rights", "decolonization", "sovereignty"],
  "Nuclear weapons and nuclear material": ["disarmament", "security", "nuclear"],
  "Arms control and disarmament": ["disarmament", "security"],
  "Colonialism": ["decolonization", "sovereignty"],
  "Human rights": ["human-rights"],
  "Economic development": ["development", "trade", "climate", "water", "environment", "technology"],
};

function findMatchingIssue(issueWeights: Record<string, number>): string {
  let best = "Economic development";
  let bestScore = 0;
  for (const [issue, keywords] of Object.entries(ISSUE_MAPPING)) {
    let score = 0;
    for (const kw of keywords) score += issueWeights[kw] || 0;
    if (score > bestScore) { bestScore = score; best = issue; }
  }
  return best;
}

function computePeerSignal(
  countryName: string,
  similarities: Record<string, CountrySimilarities>,
  topicHistory: Record<string, Record<string, TopicRates>>,
  matchedIssue: string,
): number {
  const cs = similarities[countryName];
  if (!cs?.mostSimilar) return 0;
  let wSum = 0, wTotal = 0;
  for (const sim of cs.mostSimilar.slice(0, 8)) {
    const peerRates = topicHistory[sim.country]?.[matchedIssue];
    if (!peerRates) continue;
    const peerScore = peerRates.yesRate - peerRates.noRate;
    wSum += peerScore * sim.similarity;
    wTotal += Math.abs(sim.similarity);
  }
  return wTotal > 0 ? wSum / wTotal : 0;
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
  const countryVotes: CountryVote[] = [];
  const totals = { yes: 0, no: 0, abstain: 0 };

  for (const country of members) {
    const rates = topicHistory[country.name]?.[matchedIssue];
    const peerSignal = computePeerSignal(country.name, similarities, topicHistory, matchedIssue);

    const features = buildFeatureVector({
      idealPoint: country.idealPoint,
      democracyIndex: country.democracyIndex,
      policyDimensions: country.policyDimensions,
      region: country.region,
      issue: matchedIssue,
      topicYesRate: rates?.yesRate || 0.5,
      topicNoRate: rates?.noRate || 0.2,
      topicAbstainRate: rates?.abstainRate || 0.1,
      sampleSize: rates?.sampleSize || 0,
      peerSignal,
    });

    const modelProbs = predictWithModel(features);

    // Ensemble: combine trained model (60%) with graph retrieval (40%)
    const graphPred = predictVoteFromGraph(country.iso3, matchedIssue);
    const ENSEMBLE_MODEL_WEIGHT = graphPred.method === "direct-history" ? 0.4 : 0.7;
    const ENSEMBLE_GRAPH_WEIGHT = 1 - ENSEMBLE_MODEL_WEIGHT;

    const probs = {
      yes: ENSEMBLE_MODEL_WEIGHT * modelProbs.yes + ENSEMBLE_GRAPH_WEIGHT * graphPred.yes,
      no: ENSEMBLE_MODEL_WEIGHT * modelProbs.no + ENSEMBLE_GRAPH_WEIGHT * graphPred.no,
      abstain: ENSEMBLE_MODEL_WEIGHT * modelProbs.abstain + ENSEMBLE_GRAPH_WEIGHT * graphPred.abstain,
    };

    let vote: "Yes" | "No" | "Abstain";
    if (probs.yes >= probs.no && probs.yes >= probs.abstain) vote = "Yes";
    else if (probs.no >= probs.yes && probs.no >= probs.abstain) vote = "No";
    else vote = "Abstain";

    const factors: PositionFactor[] = [
      { name: "Topic History", weight: 0.40, score: (rates?.yesRate || 0.5) - (rates?.noRate || 0.2), description: `${matchedIssue}: ${rates ? `Yes ${(rates.yesRate*100).toFixed(0)}% / No ${(rates.noRate*100).toFixed(0)}% (n=${rates.sampleSize})` : "no data"}` },
      { name: "Ideal Point", weight: 0.20, score: country.idealPoint, description: `Voeten estimate: ${country.idealPoint.toFixed(3)}` },
      { name: "Peer Signal", weight: 0.20, score: peerSignal, description: "Collaborative filter from 8 most similar voting partners" },
      { name: "Democracy Index", weight: 0.10, score: country.democracyIndex - 0.5, description: `V-Dem polyarchy: ${country.democracyIndex.toFixed(2)}` },
      { name: "Region Effect", weight: 0.10, score: 0, description: `${country.region} regional pattern` },
    ];

    countryVotes.push({
      iso3: country.iso3,
      name: country.name,
      vote,
      probability: { yes: probs.yes, no: probs.no, abstain: probs.abstain },
      confidence: Math.max(probs.yes, probs.no, probs.abstain),
      factors,
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
    if (!resolution) return NextResponse.json({ error: "No resolution provided" }, { status: 400 });

    const { profiles, topicHistory, similarities } = loadData();
    const result = simulate(profiles, resolution, committee || resolution.committee, topicHistory, similarities);
    return NextResponse.json({ result });
  } catch (e) {
    console.error("Simulation failed:", e);
    return NextResponse.json({ error: "Simulation failed" }, { status: 500 });
  }
}
