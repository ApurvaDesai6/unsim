/**
 * Voting Anomaly Detection System
 *
 * Identifies the most politically interesting votes — cases where countries
 * voted AGAINST their expected pattern based on historical rates and ally consensus.
 *
 * For sessions 60-74 (2005-2019), detects votes that are "surprising" — where
 * a country voted differently from what their history, allies, and bloc would predict.
 *
 * Output: data/voting-anomalies.json
 * Usage: npx tsx scripts/detect-anomalies.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CountryProfile {
  iso3: string;
  name: string;
  region: string;
  blocs: string[];
  scStatus: string;
  idealPoint: number;
  votingHistory: {
    totalVotes: number;
    yesRate: number;
    noRate: number;
    abstainRate: number;
  };
}

interface TopicStats {
  yesRate: number;
  noRate: number;
  abstainRate: number;
  sampleSize: number;
}

interface SimilarCountry {
  country: string;
  similarity: number;
  shared: number;
}

interface Anomaly {
  country: string;
  iso3: string;
  resolution: string;
  description: string;
  date: string;
  issue: string;
  actualVote: string;
  expectedVote: string;
  historicalRate: number;
  allyConsensus: string;
  surpriseScore: number;
  possibleExplanation: string;
}

// ─── Load Data ───────────────────────────────────────────────────────────────

console.log("Loading data files...");

const profiles: CountryProfile[] = JSON.parse(
  readFileSync(path.join(__dirname, "../data/country-profiles.json"), "utf-8")
);

const topicHistory: Record<string, Record<string, TopicStats>> = JSON.parse(
  readFileSync(path.join(__dirname, "../data/topic-history.json"), "utf-8")
);

const voteSimilarity = JSON.parse(
  readFileSync(path.join(__dirname, "../data/vote-similarity.json"), "utf-8")
);

const rawVotes = readFileSync(path.join(__dirname, "../data/raw/unvotes.csv"), "utf-8");
const rawRollCalls = readFileSync(path.join(__dirname, "../data/raw/roll_calls.csv"), "utf-8");
const rawIssues = readFileSync(path.join(__dirname, "../data/raw/issues.csv"), "utf-8");

// ─── Build Lookup Maps ───────────────────────────────────────────────────────

console.log("Building lookup maps...");

// Country name -> profile
const profileMap = new Map<string, CountryProfile>();
for (const p of profiles) {
  profileMap.set(p.name, p);
}

// Country name -> ISO3
const nameToIso3 = new Map<string, string>();
for (const p of profiles) {
  nameToIso3.set(p.name, p.iso3);
}

// Issue map: rcid -> issue name
const issueMap = new Map<string, string>();
const issueLines = rawIssues.split("\n");
for (let i = 1; i < issueLines.length; i++) {
  const parts = issueLines[i].split(",");
  if (parts.length >= 3) {
    issueMap.set(parts[0], parts.slice(2).join(",").replace(/"/g, "").trim());
  }
}

// Roll calls: rcid -> { session, date, unres, short, descr }
interface RollCall {
  session: number;
  date: string;
  unres: string;
  short: string;
  descr: string;
}

const rollCallMap = new Map<string, RollCall>();
const rcLines = rawRollCalls.split("\n");
for (let i = 1; i < rcLines.length; i++) {
  const line = rcLines[i];
  if (!line.trim()) continue;
  // CSV: rcid,session,importantvote,date,unres,amend,para,short,descr
  // amend/para can be NA or numbers; short/descr may contain commas and quotes
  const match = line.match(/^(\d+),(\d+),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),("(?:[^"]*(?:""[^"]*)*)"?|[^,]*),(.*)$/);
  if (match) {
    const session = parseInt(match[2]);
    if (session >= 60 && session <= 74) {
      rollCallMap.set(match[1], {
        session,
        date: match[4],
        unres: match[5],
        short: match[8].replace(/"/g, ""),
        descr: match[9].replace(/"/g, "").substring(0, 200),
      });
    }
  }
}

console.log(`  Sessions 60-74: ${rollCallMap.size} resolutions`);

// Allies map: country name -> top 5 most similar countries
const alliesMap = new Map<string, string[]>();
const similarities = voteSimilarity.similarities;
for (const countryName of Object.keys(similarities)) {
  const similar: SimilarCountry[] = similarities[countryName].mostSimilar || [];
  alliesMap.set(countryName, similar.slice(0, 5).map((s: SimilarCountry) => s.country));
}

// ─── Parse Votes for Sessions 60-74 ─────────────────────────────────────────

console.log("Parsing votes for sessions 60-74...");

// Build per-resolution vote maps: rcid -> Map<country, vote>
const resolutionVotes = new Map<string, Map<string, string>>();
const voteLines = rawVotes.split("\n");

let totalVotesAnalyzed = 0;

for (let i = 1; i < voteLines.length; i++) {
  const line = voteLines[i];
  if (!line.trim()) continue;
  const parts = line.split(",");
  if (parts.length < 4) continue;

  const rcid = parts[0];
  if (!rollCallMap.has(rcid)) continue;

  const country = parts[1];
  const vote = parts[3]?.trim().toLowerCase();

  if (!vote || vote === "na") continue;

  if (!resolutionVotes.has(rcid)) {
    resolutionVotes.set(rcid, new Map());
  }
  resolutionVotes.get(rcid)!.set(country, vote);
  totalVotesAnalyzed++;
}

console.log(`  Total votes in scope: ${totalVotesAnalyzed.toLocaleString()}`);

// ─── Anomaly Detection ───────────────────────────────────────────────────────

console.log("Detecting anomalies...");

// P5 countries (permanent Security Council members)
const P5 = new Set(["United States", "United Kingdom", "France", "Russia", "China"]);

// Large countries of interest
const LARGE_COUNTRIES = new Set([
  "India", "Brazil", "Nigeria", "Indonesia", "South Africa",
  "Mexico", "Egypt", "Pakistan", "Turkey", "Japan", "Germany",
]);

// WEOG countries
const WEOG_COUNTRIES = new Set<string>();
for (const p of profiles) {
  if (p.region === "WEOG") WEOG_COUNTRIES.add(p.name);
}

// Country independence tracking: country -> { deviations, totalBlocVotes }
const independenceTracker = new Map<string, { deviations: number; totalBlocVotes: number }>();

const anomalies: Anomaly[] = [];

// Normalize vote string
function normalizeVote(v: string): string {
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  if (v === "abstain") return "Abstain";
  return v;
}

// Get the expected vote and historical rate for a country on a given issue
function getExpectedVote(country: string, issue: string | undefined): { expected: string; rate: number } | null {
  const countryTopic = topicHistory[country];
  if (!countryTopic || !issue) return null;

  const stats = countryTopic[issue];
  if (!stats || stats.sampleSize < 10) return null;

  if (stats.yesRate >= 0.7) return { expected: "Yes", rate: stats.yesRate };
  if (stats.noRate >= 0.7) return { expected: "No", rate: stats.noRate };
  if (stats.yesRate >= 0.55) return { expected: "Yes", rate: stats.yesRate };
  if (stats.noRate >= 0.55) return { expected: "No", rate: stats.noRate };

  return null; // No clear expected vote
}

// Get ally consensus for a resolution
function getAllyConsensus(country: string, rcid: string): string | null {
  const allies = alliesMap.get(country);
  if (!allies || allies.length === 0) return null;

  const votes = resolutionVotes.get(rcid);
  if (!votes) return null;

  let yesCount = 0;
  let noCount = 0;
  let abstainCount = 0;

  for (const ally of allies) {
    const allyVote = votes.get(ally);
    if (!allyVote) continue;
    if (allyVote === "yes") yesCount++;
    else if (allyVote === "no") noCount++;
    else if (allyVote === "abstain") abstainCount++;
  }

  const total = yesCount + noCount + abstainCount;
  if (total < 2) return null; // Not enough allies voted

  if (yesCount > noCount && yesCount > abstainCount) return "Yes";
  if (noCount > yesCount && noCount > abstainCount) return "No";
  if (abstainCount > yesCount && abstainCount > noCount) return "Abstain";

  return null; // No clear consensus
}

// Compute surprise score: how unlikely was this vote given the base rate?
function computeSurpriseScore(
  actualVote: string,
  expectedVote: string,
  historicalRate: number,
  allyConsensus: string | null,
  country: string,
): number {
  // Base surprise from historical rate deviation
  // If expected is "Yes" with 90% rate and they voted "No", surprise = 0.9
  let score = historicalRate;

  // Boost if allies all voted differently
  if (allyConsensus && allyConsensus !== actualVote) {
    score += 0.1;
  }

  // Boost for P5 countries (geopolitically significant)
  if (P5.has(country)) {
    score += 0.05;
  }

  // Boost for large countries
  if (LARGE_COUNTRIES.has(country)) {
    score += 0.03;
  }

  // Cap at 1.0
  return Math.min(1.0, score);
}

// Generate possible explanation based on context
function generateExplanation(
  country: string,
  issue: string | undefined,
  actualVote: string,
  expectedVote: string,
  profile: CountryProfile | undefined,
): string {
  if (!profile || !issue) return "Deviation from historical pattern";

  const isP5 = P5.has(country);
  const isWEOG = profile.region === "WEOG";
  const isG77 = profile.blocs.includes("G77");

  if (issue === "Palestinian conflict") {
    if (actualVote === "No" && isG77) return "Divergence from G77 solidarity on Palestine — possible bilateral pressure";
    if (actualVote === "Yes" && isWEOG) return "Western country breaking from US-aligned position on Palestine";
    if (actualVote === "Abstain" && isP5) return "P5 member seeking diplomatic middle ground on Palestine";
  }

  if (issue === "Human rights") {
    if (actualVote === "No" && expectedVote === "Yes") return "Domestic policy concerns override multilateral human rights stance";
    if (actualVote === "Yes" && expectedVote === "No") return "Selective engagement with human rights agenda despite general opposition";
  }

  if (issue === "Nuclear weapons and nuclear material") {
    if (actualVote === "No" && isG77) return "Nuclear security interests override non-aligned disarmament position";
    if (actualVote === "Yes" && (country === "United States" || country === "United Kingdom" || country === "France"))
      return "P5 nuclear power supporting disarmament measure — rare concession";
  }

  if (issue === "Arms control and disarmament") {
    if (actualVote === "No" && expectedVote === "Yes") return "Security concerns override general disarmament support";
    if (actualVote === "Yes" && expectedVote === "No") return "Selective support for specific arms control measure";
  }

  if (issue === "Colonialism") {
    if (actualVote === "No" && isG77) return "Breaking from post-colonial solidarity — pragmatic bilateral considerations";
    if (actualVote === "Yes" && isWEOG) return "Western country supporting decolonization position against bloc norm";
  }

  if (issue === "Economic development") {
    if (actualVote === "No" && isG77) return "Economic policy divergence from G77 development consensus";
    if (actualVote === "Yes" && isWEOG) return "Supporting developing world economic position against Western consensus";
  }

  if (isP5) return `P5 member deviating from typical ${expectedVote} position — geopolitical recalibration`;
  if (isG77 && actualVote === "No") return "Breaking from G77 consensus — domestic or bilateral factors";
  if (isWEOG && actualVote === "Yes" && expectedVote === "No") return "Western country breaking from WEOG consensus";

  return "Deviation from historical voting pattern — possible policy shift or resolution-specific factors";
}

// ─── Main Detection Loop ─────────────────────────────────────────────────────

for (const [rcid, votes] of resolutionVotes) {
  const rc = rollCallMap.get(rcid);
  if (!rc) continue;

  const issue = issueMap.get(rcid);

  for (const [country, voteStr] of votes) {
    const actualVote = normalizeVote(voteStr);
    if (actualVote !== "Yes" && actualVote !== "No" && actualVote !== "Abstain") continue;

    const profile = profileMap.get(country);
    if (!profile) continue;

    // Get expected vote from historical pattern
    const expectedResult = getExpectedVote(country, issue);
    if (!expectedResult) continue;

    const { expected: expectedVote, rate: historicalRate } = expectedResult;

    // Track bloc independence
    const allyConsensus = getAllyConsensus(country, rcid);

    // Track independence: did country deviate from ally consensus?
    if (allyConsensus) {
      if (!independenceTracker.has(country)) {
        independenceTracker.set(country, { deviations: 0, totalBlocVotes: 0 });
      }
      const tracker = independenceTracker.get(country)!;
      tracker.totalBlocVotes++;
      if (allyConsensus !== actualVote) {
        tracker.deviations++;
      }
    }

    // Check if this is an anomaly:
    // 1. Country voted opposite to their historical majority
    // 2. AND their allies mostly voted the other way too
    const isOpposite =
      (expectedVote === "Yes" && actualVote === "No") ||
      (expectedVote === "No" && actualVote === "Yes");

    if (!isOpposite) continue;

    // Must have ally consensus disagreeing too (or be a very strong historical deviation)
    const alliesDisagree = allyConsensus !== null && allyConsensus !== actualVote;
    const veryStrongDeviation = historicalRate >= 0.85;

    if (!alliesDisagree && !veryStrongDeviation) continue;

    const surpriseScore = computeSurpriseScore(
      actualVote,
      expectedVote,
      historicalRate,
      allyConsensus,
      country,
    );

    const explanation = generateExplanation(country, issue, actualVote, expectedVote, profile);

    anomalies.push({
      country,
      iso3: profile.iso3,
      resolution: rc.unres || `RCID-${rcid}`,
      description: rc.short || rc.descr.substring(0, 100),
      date: rc.date,
      issue: issue || "Unknown",
      actualVote,
      expectedVote,
      historicalRate: Math.round(historicalRate * 1000) / 1000,
      allyConsensus: allyConsensus || "N/A",
      surpriseScore: Math.round(surpriseScore * 1000) / 1000,
      possibleExplanation: explanation,
    });
  }
}

// ─── Sort and Select Top 100 ─────────────────────────────────────────────────

console.log(`\n  Raw anomalies detected: ${anomalies.length.toLocaleString()}`);

// Sort by surprise score descending
anomalies.sort((a, b) => b.surpriseScore - a.surpriseScore);

// Prioritize diversity: ensure we don't have too many from one country
const topAnomalies: Anomaly[] = [];
const countryCount = new Map<string, number>();
const MAX_PER_COUNTRY = 5;

for (const a of anomalies) {
  if (topAnomalies.length >= 100) break;
  const count = countryCount.get(a.country) || 0;
  if (count >= MAX_PER_COUNTRY) continue;
  topAnomalies.push(a);
  countryCount.set(a.country, count + 1);
}

// If we still need more, relax the per-country limit
if (topAnomalies.length < 100) {
  for (const a of anomalies) {
    if (topAnomalies.length >= 100) break;
    if (!topAnomalies.includes(a)) {
      topAnomalies.push(a);
    }
  }
}

// ─── Compute Independence Scores ─────────────────────────────────────────────

console.log("\nComputing independence scores...");

interface IndependenceEntry {
  country: string;
  iso3: string;
  region: string;
  blocs: string[];
  independenceScore: number;
  deviations: number;
  totalBlocVotes: number;
}

const independenceScores: IndependenceEntry[] = [];

for (const [country, tracker] of independenceTracker) {
  if (tracker.totalBlocVotes < 50) continue; // Need enough data

  const profile = profileMap.get(country);
  if (!profile) continue;

  independenceScores.push({
    country,
    iso3: profile.iso3,
    region: profile.region,
    blocs: profile.blocs,
    independenceScore: Math.round((tracker.deviations / tracker.totalBlocVotes) * 1000) / 1000,
    deviations: tracker.deviations,
    totalBlocVotes: tracker.totalBlocVotes,
  });
}

// Sort by independence score descending
independenceScores.sort((a, b) => b.independenceScore - a.independenceScore);

const top50Independent = independenceScores.slice(0, 50);

// ─── Output ──────────────────────────────────────────────────────────────────

const anomalyRate = anomalies.length / totalVotesAnalyzed;

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    sessions: "60-74 (2005-2019)",
    description: "Top 100 most surprising votes where countries voted against their expected pattern",
  },
  stats: {
    totalVotesAnalyzed,
    anomaliesDetected: anomalies.length,
    anomalyRate: Math.round(anomalyRate * 10000) / 10000,
    top100AvgSurpriseScore:
      Math.round(
        (topAnomalies.reduce((s, a) => s + a.surpriseScore, 0) / topAnomalies.length) * 1000
      ) / 1000,
  },
  anomalies: topAnomalies,
  independenceRanking: {
    description: "Top 50 most independent countries — highest rate of deviation from ally consensus",
    countries: top50Independent,
  },
};

const outputPath = path.join(__dirname, "../data/voting-anomalies.json");
writeFileSync(outputPath, JSON.stringify(output, null, 2));

// ─── Print Summary ───────────────────────────────────────────────────────────

console.log("\n════════════════════════════════════════════════════════════════");
console.log("  VOTING ANOMALY DETECTION — RESULTS");
console.log("════════════════════════════════════════════════════════════════");
console.log(`  Total votes analyzed:     ${totalVotesAnalyzed.toLocaleString()}`);
console.log(`  Anomalies detected:       ${anomalies.length.toLocaleString()}`);
console.log(`  Anomaly rate:             ${(anomalyRate * 100).toFixed(2)}%`);
console.log(`  Top 100 avg surprise:     ${output.stats.top100AvgSurpriseScore}`);
console.log("────────────────────────────────────────────────────────────────");
console.log("\n  TOP 10 MOST SURPRISING VOTES:");
for (let i = 0; i < Math.min(10, topAnomalies.length); i++) {
  const a = topAnomalies[i];
  console.log(`  ${i + 1}. ${a.country} (${a.iso3}) — ${a.resolution}`);
  console.log(`     ${a.description}`);
  console.log(`     Voted ${a.actualVote} (expected ${a.expectedVote}, historical ${(a.historicalRate * 100).toFixed(0)}%)`);
  console.log(`     Allies voted: ${a.allyConsensus} | Surprise: ${a.surpriseScore}`);
  console.log(`     ${a.possibleExplanation}`);
  console.log("");
}

console.log("────────────────────────────────────────────────────────────────");
console.log("\n  TOP 10 MOST INDEPENDENT COUNTRIES:");
for (let i = 0; i < Math.min(10, top50Independent.length); i++) {
  const c = top50Independent[i];
  console.log(
    `  ${i + 1}. ${c.country} (${c.iso3}) — Score: ${(c.independenceScore * 100).toFixed(1)}% ` +
    `(${c.deviations}/${c.totalBlocVotes} deviations) [${c.region}] ${c.blocs.join(", ") || "no bloc"}`
  );
}

console.log("\n────────────────────────────────────────────────────────────────");
console.log(`  Output saved to: data/voting-anomalies.json`);
console.log("════════════════════════════════════════════════════════════════\n");
