/**
 * Validation of Enhanced Predictor vs. baseline, against 181K+ real votes.
 *
 * Compares:
 * - Baseline engine (v0.1): ideal points + policy dimensions + abstain heuristic
 * - Enhanced engine (v0.2): + real topic history + collaborative filtering
 *
 * Usage: npx tsx scripts/validate-enhanced.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import type { CountryProfile, Bloc, PolicyDimensions } from "../types";

const profiles: CountryProfile[] = JSON.parse(
  readFileSync(path.join(__dirname, "../data/country-profiles.json"), "utf-8"),
);
const topicHistory: Record<string, Record<string, { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }>> = JSON.parse(
  readFileSync(path.join(__dirname, "../data/topic-history.json"), "utf-8"),
);
const similarityData = JSON.parse(
  readFileSync(path.join(__dirname, "../data/vote-similarity.json"), "utf-8"),
);

const profileByName = new Map<string, CountryProfile>();
for (const p of profiles) profileByName.set(p.name.toLowerCase(), p);

// ─── Load vote data ───────────────────────────────────────────────────

const rawVotes = readFileSync(path.join(__dirname, "../data/raw/unvotes.csv"), "utf-8");
const rawRollCalls = readFileSync(path.join(__dirname, "../data/raw/roll_calls.csv"), "utf-8");
const rawIssues = readFileSync(path.join(__dirname, "../data/raw/issues.csv"), "utf-8");

const issueMap = new Map<string, string>();
const issueLines = rawIssues.split("\n");
for (let i = 1; i < issueLines.length; i++) {
  const parts = issueLines[i].split(",");
  if (parts.length >= 3) issueMap.set(parts[0], parts.slice(2).join(",").replace(/"/g, "").trim());
}

const rcLines = rawRollCalls.split("\n");
const recentRcids = new Set<string>();
for (let i = 1; i < rcLines.length; i++) {
  const parts = rcLines[i].split(",");
  if (parts.length >= 2 && parseInt(parts[1]) >= 60) recentRcids.add(parts[0]);
}

const ISSUE_VECTORS: Record<string, PolicyDimensions> = {
  "Palestinian conflict": { sovereignty: 0.5, humanRights: 0.6, development: 0.1, security: -0.2, environment: 0.0, decolonization: 0.7 },
  "Nuclear weapons and nuclear material": { sovereignty: 0.2, humanRights: 0.2, development: 0.0, security: -0.7, environment: 0.1, decolonization: 0.1 },
  "Arms control and disarmament": { sovereignty: 0.1, humanRights: 0.1, development: 0.0, security: -0.6, environment: 0.0, decolonization: 0.0 },
  "Colonialism": { sovereignty: 0.6, humanRights: 0.4, development: 0.3, security: 0.0, environment: 0.0, decolonization: 0.9 },
  "Human rights": { sovereignty: -0.3, humanRights: 0.8, development: 0.1, security: 0.0, environment: 0.0, decolonization: 0.1 },
  "Economic development": { sovereignty: 0.3, humanRights: 0.1, development: 0.8, security: 0.0, environment: 0.2, decolonization: 0.2 },
};

// ─── Prediction functions ─────────────────────────────────────────────

function softmax3(scores: [number, number, number]): [number, number, number] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max)) as [number, number, number];
  const sum = exps[0] + exps[1] + exps[2];
  return [exps[0] / sum, exps[1] / sum, exps[2] / sum];
}

function baselinePredict(country: CountryProfile, policyVector: PolicyDimensions): string {
  const vals = Object.values(policyVector);
  const resPosition = vals.reduce((a, b) => a + b, 0) / vals.length;
  const idealScore = 1 - Math.abs(country.idealPoint - resPosition) * 1.5;

  const keys: (keyof PolicyDimensions)[] = ["sovereignty", "humanRights", "development", "security", "environment", "decolonization"];
  let dimSum = 0, weightSum = 0;
  for (const k of keys) {
    const bVal = policyVector[k] || 0;
    const weight = Math.abs(bVal);
    dimSum += (country.policyDimensions[k] || 0) * bVal * weight;
    weightSum += weight;
  }
  const dimScore = weightSum > 0 ? Math.max(-1, Math.min(1, dimSum / weightSum)) : 0;

  const composite = 0.40 * idealScore + 0.60 * dimScore;
  const compositeStrength = Math.abs(composite);
  const abstainBias = (1 - compositeStrength) * 0.6 + (1 - country.democracyIndex) * 0.2;
  const [pYes, pNo, pAbstain] = softmax3([composite * 3.2, -composite * 3.2, abstainBias - 0.5]);

  if (pYes >= pNo && pYes >= pAbstain) return "yes";
  if (pNo >= pYes && pNo >= pAbstain) return "no";
  return "abstain";
}

function enhancedPredict(country: CountryProfile, issue: string, policyVector: PolicyDimensions): string {
  // 1. Ideal point
  const vals = Object.values(policyVector);
  const resPosition = vals.reduce((a, b) => a + b, 0) / vals.length;
  const idealScore = 1 - Math.abs(country.idealPoint - resPosition) * 1.5;

  // 2. Dimension score
  const keys: (keyof PolicyDimensions)[] = ["sovereignty", "humanRights", "development", "security", "environment", "decolonization"];
  let dimSum = 0, weightSum = 0;
  for (const k of keys) {
    const bVal = policyVector[k] || 0;
    const weight = Math.abs(bVal);
    dimSum += (country.policyDimensions[k] || 0) * bVal * weight;
    weightSum += weight;
  }
  const dimScore = weightSum > 0 ? Math.max(-1, Math.min(1, dimSum / weightSum)) : 0;

  // 3. Topic history (the key enhancement)
  const countryTopicData = topicHistory[country.name];
  let topicScore = 0;
  let topicConfidence = 0;
  if (countryTopicData && countryTopicData[issue]) {
    const rates = countryTopicData[issue];
    topicScore = rates.yesRate - rates.noRate;
    topicConfidence = Math.min(1, rates.sampleSize / 80);
  }

  // 4. Collaborative filtering (from similarity matrix)
  let collabScore = 0;
  const countrySim = similarityData.similarities?.[country.name];
  if (countrySim?.mostSimilar) {
    let wSum = 0, wTotal = 0;
    for (const sim of countrySim.mostSimilar.slice(0, 8)) {
      const peerTopicData = topicHistory[sim.country];
      if (!peerTopicData?.[issue]) continue;
      const peerScore = peerTopicData[issue].yesRate - peerTopicData[issue].noRate;
      wSum += peerScore * sim.similarity;
      wTotal += Math.abs(sim.similarity);
    }
    if (wTotal > 0) collabScore = wSum / wTotal;
  }

  // Composite with enhanced weights
  const composite =
    0.15 * idealScore +
    0.15 * dimScore +
    0.45 * topicScore * (topicConfidence > 0.3 ? 1 : 0.5) +
    0.25 * collabScore;

  // Empirical abstain rate from topic history
  const empiricalAbstainRate = countryTopicData?.[issue]?.abstainRate || 0.1;
  const abstainBias = empiricalAbstainRate * 2.0 + (1 - Math.abs(composite)) * 0.2;

  const [pYes, pNo, pAbstain] = softmax3([
    composite * 4.0,
    -composite * 4.0,
    abstainBias - 0.3,
  ]);

  if (pYes >= pNo && pYes >= pAbstain) return "yes";
  if (pNo >= pYes && pNo >= pAbstain) return "no";
  return "abstain";
}

// ─── Run validation ───────────────────────────────────────────────────

console.log("Running enhanced validation...\n");

const votesByRcid = new Map<string, { country: string; vote: string }[]>();
const voteLines = rawVotes.split("\n");
for (let i = 1; i < voteLines.length; i++) {
  const parts = voteLines[i].split(",");
  if (parts.length < 4) continue;
  const arr = votesByRcid.get(parts[0]) || [];
  arr.push({ country: parts[1], vote: parts[3]?.trim() });
  votesByRcid.set(parts[0], arr);
}

let baselineCorrect = 0, enhancedCorrect = 0, total = 0;
const baselineByClass = { yes: { tp: 0, fp: 0, fn: 0 }, no: { tp: 0, fp: 0, fn: 0 }, abstain: { tp: 0, fp: 0, fn: 0 } };
const enhancedByClass = { yes: { tp: 0, fp: 0, fn: 0 }, no: { tp: 0, fp: 0, fn: 0 }, abstain: { tp: 0, fp: 0, fn: 0 } };
const enhancedByIssue: Record<string, { total: number; correct: number }> = {};
const enhancedByRegion: Record<string, { total: number; correct: number }> = {};

for (const rcid of recentRcids) {
  const issue = issueMap.get(rcid);
  if (!issue || !ISSUE_VECTORS[issue]) continue;
  const policyVector = ISSUE_VECTORS[issue];
  const resVotes = votesByRcid.get(rcid);
  if (!resVotes || resVotes.length < 50) continue;

  for (const { country: countryName, vote: actual } of resVotes) {
    if (actual !== "yes" && actual !== "no" && actual !== "abstain") continue;

    const profile = profileByName.get(countryName.toLowerCase());
    if (!profile) continue;

    const baselinePred = baselinePredict(profile, policyVector);
    const enhancedPred = enhancedPredict(profile, issue, policyVector);

    total++;
    if (baselinePred === actual) baselineCorrect++;
    if (enhancedPred === actual) enhancedCorrect++;

    // Per-class metrics for enhanced
    for (const cls of ["yes", "no", "abstain"] as const) {
      if (enhancedPred === cls && actual === cls) enhancedByClass[cls].tp++;
      else if (enhancedPred === cls && actual !== cls) enhancedByClass[cls].fp++;
      else if (enhancedPred !== cls && actual === cls) enhancedByClass[cls].fn++;

      if (baselinePred === cls && actual === cls) baselineByClass[cls].tp++;
      else if (baselinePred === cls && actual !== cls) baselineByClass[cls].fp++;
      else if (baselinePred !== cls && actual === cls) baselineByClass[cls].fn++;
    }

    // By issue
    enhancedByIssue[issue] = enhancedByIssue[issue] || { total: 0, correct: 0 };
    enhancedByIssue[issue].total++;
    if (enhancedPred === actual) enhancedByIssue[issue].correct++;

    // By region
    enhancedByRegion[profile.region] = enhancedByRegion[profile.region] || { total: 0, correct: 0 };
    enhancedByRegion[profile.region].total++;
    if (enhancedPred === actual) enhancedByRegion[profile.region].correct++;
  }
}

// ─── Report ───────────────────────────────────────────────────────────

function f1(tp: number, fp: number, fn: number): number {
  const p = tp / (tp + fp) || 0;
  const r = tp / (tp + fn) || 0;
  return 2 * p * r / (p + r) || 0;
}

console.log("╔═══════════════════════════════════════════════════════════════════╗");
console.log("║   ENHANCED ENGINE VALIDATION — v0.1 Baseline vs v0.2 Enhanced    ║");
console.log("╚═══════════════════════════════════════════════════════════════════╝\n");

console.log(`  Total predictions: ${total.toLocaleString()}\n`);

console.log("─── Overall Accuracy ───────────────────────────────────────────────");
console.log(`  Baseline (v0.1):  ${(baselineCorrect / total * 100).toFixed(1)}%`);
console.log(`  Enhanced (v0.2):  ${(enhancedCorrect / total * 100).toFixed(1)}%`);
console.log(`  Improvement:      +${((enhancedCorrect - baselineCorrect) / total * 100).toFixed(1)} percentage points`);

console.log("\n─── Per-Class F1 Scores ────────────────────────────────────────────");
console.log("              Baseline    Enhanced    Δ");
for (const cls of ["yes", "no", "abstain"] as const) {
  const bF1 = f1(baselineByClass[cls].tp, baselineByClass[cls].fp, baselineByClass[cls].fn);
  const eF1 = f1(enhancedByClass[cls].tp, enhancedByClass[cls].fp, enhancedByClass[cls].fn);
  const delta = eF1 - bF1;
  console.log(`  ${cls.toUpperCase().padEnd(10)}  ${(bF1 * 100).toFixed(1).padStart(5)}%      ${(eF1 * 100).toFixed(1).padStart(5)}%     ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`);
}

console.log("\n─── Enhanced: Accuracy by Issue ─────────────────────────────────────");
for (const [issue, data] of Object.entries(enhancedByIssue).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${issue.padEnd(45)} ${(data.correct / data.total * 100).toFixed(1)}% (n=${data.total.toLocaleString()})`);
}

console.log("\n─── Enhanced: Accuracy by Region ────────────────────────────────────");
for (const [region, data] of Object.entries(enhancedByRegion).sort((a, b) => b[1].total - a[1].total)) {
  const labels: Record<string, string> = { APG: "Asia-Pacific", AFRICAN: "African", WEOG: "Western", GRULAC: "LatAm/Carib", EEG: "E. European" };
  console.log(`  ${(labels[region] || region).padEnd(15)} ${(data.correct / data.total * 100).toFixed(1)}% (n=${data.total.toLocaleString()})`);
}

// Save
const report = {
  generatedAt: new Date().toISOString(),
  totalPredictions: total,
  baseline: { accuracy: baselineCorrect / total, perClass: Object.fromEntries((["yes", "no", "abstain"] as const).map(c => [c, { f1: f1(baselineByClass[c].tp, baselineByClass[c].fp, baselineByClass[c].fn), ...baselineByClass[c] }])) },
  enhanced: { accuracy: enhancedCorrect / total, perClass: Object.fromEntries((["yes", "no", "abstain"] as const).map(c => [c, { f1: f1(enhancedByClass[c].tp, enhancedByClass[c].fp, enhancedByClass[c].fn), ...enhancedByClass[c] }])), byIssue: enhancedByIssue, byRegion: enhancedByRegion },
};
writeFileSync(path.join(__dirname, "../data/validation-enhanced.json"), JSON.stringify(report, null, 2));
console.log("\n✓ Report saved to data/validation-enhanced.json");
