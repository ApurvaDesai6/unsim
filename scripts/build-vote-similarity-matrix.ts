/**
 * Build a country-country vote similarity matrix from the Voeten dataset.
 *
 * This is collaborative filtering for international relations: if two countries
 * voted the same way on 90% of resolutions, their future votes are highly correlated.
 * The similarity score becomes a powerful predictor ("countries that vote like India
 * overwhelmingly voted Yes on this resolution → India probably votes Yes").
 *
 * Technique: Cosine similarity on vote vectors (Yes=+1, Abstain=0, No=-1).
 * We compute this for recent sessions only (60-74) to capture current alignment patterns.
 *
 * Output: data/vote-similarity.json — a sparse matrix of country pairs with
 * similarity scores, used by the engine's bilateral relations weight.
 *
 * Usage: npx tsx scripts/build-vote-similarity-matrix.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";

// ─── Load voting data ─────────────────────────────────────────────────

const rawVotes = readFileSync(path.join(__dirname, "../data/raw/unvotes.csv"), "utf-8");

interface VoteRecord { rcid: string; country: string; vote: string }

function parseCSVFast(content: string): VoteRecord[] {
  const lines = content.split("\n");
  const records: VoteRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 4) continue;
    records.push({ rcid: parts[0], country: parts[1], vote: parts[3]?.trim() });
  }
  return records;
}

const rawRollCalls = readFileSync(path.join(__dirname, "../data/raw/roll_calls.csv"), "utf-8");
const rcLines = rawRollCalls.split("\n");
const recentRcids = new Set<string>();
for (let i = 1; i < rcLines.length; i++) {
  const parts = rcLines[i].split(",");
  if (parts.length >= 2 && parseInt(parts[1]) >= 55) {
    recentRcids.add(parts[0]);
  }
}

console.log("Loading votes...");
const allVotes = parseCSVFast(rawVotes);
const recentVotes = allVotes.filter((v) => recentRcids.has(v.rcid));
console.log(`  ${recentVotes.length.toLocaleString()} votes from sessions 55+ (2000-2019)`);

// ─── Build vote vectors per country ───────────────────────────────────

const VOTE_MAP: Record<string, number> = { yes: 1, no: -1, abstain: 0 };

// country → {rcid → numeric vote}
const countryVectors = new Map<string, Map<string, number>>();

for (const v of recentVotes) {
  const numericVote = VOTE_MAP[v.vote];
  if (numericVote === undefined) continue;

  let vec = countryVectors.get(v.country);
  if (!vec) {
    vec = new Map();
    countryVectors.set(v.country, vec);
  }
  vec.set(v.rcid, numericVote);
}

const countries = [...countryVectors.keys()].sort();
console.log(`  ${countries.length} countries with voting records`);

// ─── Compute pairwise cosine similarity ───────────────────────────────

console.log("Computing similarity matrix...");

interface SimilarityEntry {
  country1: string;
  country2: string;
  similarity: number;
  sharedVotes: number;
}

const similarities: SimilarityEntry[] = [];
const MIN_SHARED = 50; // Need at least 50 shared votes for reliable similarity

for (let i = 0; i < countries.length; i++) {
  const vecA = countryVectors.get(countries[i])!;

  for (let j = i + 1; j < countries.length; j++) {
    const vecB = countryVectors.get(countries[j])!;

    // Find shared resolutions
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    let shared = 0;

    for (const [rcid, voteA] of vecA) {
      const voteB = vecB.get(rcid);
      if (voteB === undefined) continue;
      dotProduct += voteA * voteB;
      normA += voteA * voteA;
      normB += voteB * voteB;
      shared++;
    }

    if (shared < MIN_SHARED) continue;

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) continue;

    const similarity = dotProduct / denom;

    // Only store meaningful similarities (|sim| > 0.3)
    if (Math.abs(similarity) > 0.3) {
      similarities.push({
        country1: countries[i],
        country2: countries[j],
        similarity,
        sharedVotes: shared,
      });
    }
  }

  if (i % 20 === 0) process.stdout.write(`  ${i}/${countries.length} countries processed\r`);
}

console.log(`\n  ${similarities.length.toLocaleString()} significant similarity pairs found`);

// ─── Build per-country top-K most similar/dissimilar ──────────────────

interface CountrySimilarities {
  mostSimilar: { country: string; similarity: number; shared: number }[];
  mostDissimilar: { country: string; similarity: number; shared: number }[];
  avgSimilarityByRegion: Record<string, number>;
}

const perCountry = new Map<string, CountrySimilarities>();

for (const country of countries) {
  const related = similarities
    .filter((s) => s.country1 === country || s.country2 === country)
    .map((s) => ({
      country: s.country1 === country ? s.country2 : s.country1,
      similarity: s.similarity,
      shared: s.sharedVotes,
    }));

  related.sort((a, b) => b.similarity - a.similarity);

  perCountry.set(country, {
    mostSimilar: related.slice(0, 15),
    mostDissimilar: related.slice(-10).reverse(),
    avgSimilarityByRegion: {},
  });
}

// ─── Compute temporal ideal point drift ───────────────────────────────

console.log("\nComputing temporal ideal points...");

// Group votes by session
const votesBySession = new Map<number, Map<string, { yes: number; no: number; total: number }>>();

for (const v of allVotes) {
  const rc = rcLines.find((l) => l.startsWith(v.rcid + ","));
  if (!rc) continue;
  const session = parseInt(rc.split(",")[1]);
  if (isNaN(session)) continue;

  let sessionData = votesBySession.get(session);
  if (!sessionData) {
    sessionData = new Map();
    votesBySession.set(session, sessionData);
  }

  let countryData = sessionData.get(v.country);
  if (!countryData) {
    countryData = { yes: 0, no: 0, total: 0 };
    sessionData.set(v.country, countryData);
  }

  if (v.vote === "yes") countryData.yes++;
  else if (v.vote === "no") countryData.no++;
  countryData.total++;
}

// Compute per-session "ideal point proxy" (yes_rate centered at 0)
interface TemporalPoint { session: number; idealProxy: number; sampleSize: number }
const temporalPoints = new Map<string, TemporalPoint[]>();

for (const [session, sessionData] of [...votesBySession.entries()].sort((a, b) => a[0] - b[0])) {
  if (session < 50) continue; // Only recent
  for (const [country, data] of sessionData) {
    if (data.total < 20) continue; // Need minimum sample
    const idealProxy = (data.yes / data.total) * 2 - 1; // Map [0,1] → [-1,1]

    let points = temporalPoints.get(country);
    if (!points) {
      points = [];
      temporalPoints.set(country, points);
    }
    points.push({ session, idealProxy, sampleSize: data.total });
  }
}

// Detect drift: compare first 5 sessions vs last 5 sessions
interface DriftResult {
  country: string;
  earlyAvg: number;
  lateAvg: number;
  drift: number;
  direction: "toward-yes" | "toward-no" | "stable";
}

const driftResults: DriftResult[] = [];

for (const [country, points] of temporalPoints) {
  if (points.length < 8) continue;
  const early = points.slice(0, 4);
  const late = points.slice(-4);
  const earlyAvg = early.reduce((s, p) => s + p.idealProxy, 0) / early.length;
  const lateAvg = late.reduce((s, p) => s + p.idealProxy, 0) / late.length;
  const drift = lateAvg - earlyAvg;

  driftResults.push({
    country,
    earlyAvg,
    lateAvg,
    drift,
    direction: drift > 0.1 ? "toward-yes" : drift < -0.1 ? "toward-no" : "stable",
  });
}

driftResults.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

console.log("  Top 10 countries with most position drift:");
for (const d of driftResults.slice(0, 10)) {
  console.log(`    ${d.country.padEnd(25)} ${d.direction.padEnd(12)} Δ=${d.drift > 0 ? "+" : ""}${d.drift.toFixed(3)}`);
}

// ─── Save outputs ─────────────────────────────────────────────────────

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    sessions: "55–74 (2000–2019)",
    countriesAnalyzed: countries.length,
    significantPairs: similarities.length,
    minSharedVotes: MIN_SHARED,
  },
  similarities: Object.fromEntries(perCountry),
  temporalDrift: driftResults.slice(0, 50),
  topAlliances: similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 50)
    .map((s) => ({ ...s, similarity: Math.round(s.similarity * 1000) / 1000 })),
  topRivalries: similarities
    .sort((a, b) => a.similarity - b.similarity)
    .slice(0, 50)
    .map((s) => ({ ...s, similarity: Math.round(s.similarity * 1000) / 1000 })),
};

const outPath = path.join(__dirname, "../data/vote-similarity.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`\n✓ Similarity matrix saved to ${outPath}`);

// Print some interesting findings
console.log("\n─── Top 10 Voting Alliances (highest cosine similarity) ───");
for (const s of output.topAlliances.slice(0, 10)) {
  console.log(`  ${s.country1.padEnd(25)} ↔ ${s.country2.padEnd(25)} sim=${s.similarity.toFixed(3)} (${s.sharedVotes} shared)`);
}

console.log("\n─── Top 10 Voting Rivalries (lowest cosine similarity) ───");
for (const s of output.topRivalries.slice(0, 10)) {
  console.log(`  ${s.country1.padEnd(25)} ↔ ${s.country2.padEnd(25)} sim=${s.similarity.toFixed(3)} (${s.sharedVotes} shared)`);
}
