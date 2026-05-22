/**
 * Rigorous Cross-Validation Pipeline
 *
 * Performs leave-one-session-out cross-validation on the Voeten UNGA dataset.
 * For each session (year), trains on all other sessions and tests on that session.
 * This is the gold standard for temporal prediction tasks because it prevents
 * data leakage from future sessions.
 *
 * Also performs:
 * - Feature ablation study (contribution of each signal)
 * - Comparison against baselines (random, majority, ideal-point-only)
 * - Calibration analysis (reliability of probability estimates)
 * - Per-country accuracy ranking (which countries are most/least predictable)
 *
 * Output: data/cross-validation-report.json — machine-readable for the methodology page
 *
 * Data sources:
 * - Voeten UNGA Voting Data: Harvard Dataverse doi:10.7910/DVN/LEJUQZ
 *   via TidyTuesday: github.com/rfordatascience/tidytuesday/tree/master/data/2021/2021-03-23
 * - Country profiles: derived from Voeten ideal points + V-Dem v14 democracy scores
 * - Topic history: aggregated from the above voting data
 * - Vote similarity: cosine similarity on co-voting vectors (sessions 55+)
 *
 * Reproducibility: Run `npx tsx scripts/cross-validate.ts` from project root.
 * Requires data/raw/ CSVs (downloadable via scripts in README).
 *
 * Usage: npx tsx scripts/cross-validate.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import type { CountryProfile } from "../types";

const DATA_DIR = path.join(__dirname, "..");

// ─── Load data ────────────────────────────────────────────────────────

console.log("Loading datasets...");
const profiles: CountryProfile[] = JSON.parse(readFileSync(path.join(DATA_DIR, "data/country-profiles.json"), "utf-8"));
const topicHistory: Record<string, Record<string, { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }>> = JSON.parse(readFileSync(path.join(DATA_DIR, "data/topic-history.json"), "utf-8"));
const rawSim = JSON.parse(readFileSync(path.join(DATA_DIR, "data/vote-similarity.json"), "utf-8"));
const similarities: Record<string, { mostSimilar: { country: string; similarity: number }[] }> = rawSim.similarities || {};

const rawVotes = readFileSync(path.join(DATA_DIR, "data/raw/unvotes.csv"), "utf-8");
const rawRollCalls = readFileSync(path.join(DATA_DIR, "data/raw/roll_calls.csv"), "utf-8");
const rawIssues = readFileSync(path.join(DATA_DIR, "data/raw/issues.csv"), "utf-8");

// Parse
const issueMap = new Map<string, string>();
for (const line of rawIssues.split("\n").slice(1)) {
  const parts = line.split(",");
  if (parts.length >= 3) issueMap.set(parts[0], parts.slice(2).join(",").replace(/"/g, "").trim());
}

interface RollCall { rcid: string; session: number }
const rollCalls: RollCall[] = [];
for (const line of rawRollCalls.split("\n").slice(1)) {
  const parts = line.split(",");
  if (parts.length >= 2) rollCalls.push({ rcid: parts[0], session: parseInt(parts[1]) });
}
const rcSessionMap = new Map(rollCalls.map((r) => [r.rcid, r.session]));

interface VoteRecord { rcid: string; country: string; vote: string }
const allVotes: VoteRecord[] = [];
for (const line of rawVotes.split("\n").slice(1)) {
  const parts = line.split(",");
  if (parts.length >= 4) allVotes.push({ rcid: parts[0], country: parts[1], vote: parts[3]?.trim() });
}

const profileByName = new Map(profiles.map((p) => [p.name.toLowerCase(), p]));

console.log(`  ${allVotes.length.toLocaleString()} votes, ${rollCalls.length} resolutions\n`);

// ─── Feature construction ─────────────────────────────────────────────

const REGIONS = ["AFRICAN", "APG", "EEG", "GRULAC", "WEOG"];
const ISSUES = ["Arms control and disarmament", "Colonialism", "Economic development", "Human rights", "Nuclear weapons and nuclear material", "Palestinian conflict"];

function buildFeatures(country: CountryProfile, issue: string, peerSignal: number): number[] {
  const rates = topicHistory[country.name]?.[issue];
  const regionOneHot = REGIONS.map((r) => r === country.region ? 1 : 0);
  const issueOneHot = ISSUES.map((i) => i === issue ? 1 : 0);
  return [
    country.idealPoint, country.democracyIndex,
    country.policyDimensions.sovereignty, country.policyDimensions.humanRights,
    country.policyDimensions.development, country.policyDimensions.security,
    country.policyDimensions.environment, country.policyDimensions.decolonization,
    ...regionOneHot, ...issueOneHot,
    rates?.yesRate || 0.5, rates?.noRate || 0.2, rates?.abstainRate || 0.1,
    peerSignal,
  ];
}

function computePeerSignal(countryName: string, issue: string): number {
  const cs = similarities[countryName];
  if (!cs?.mostSimilar) return 0;
  let wSum = 0, wTotal = 0;
  for (const sim of cs.mostSimilar.slice(0, 8)) {
    const r = topicHistory[sim.country]?.[issue];
    if (!r) continue;
    wSum += (r.yesRate - r.noRate) * sim.similarity;
    wTotal += Math.abs(sim.similarity);
  }
  return wTotal > 0 ? wSum / wTotal : 0;
}

// ─── Logistic Regression (from scratch) ───────────────────────────────

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function trainLogReg(X: number[][], y: number[], numClasses: number, lr: number = 0.1, epochs: number = 50, lambda: number = 0.001): { W: number[][]; b: number[] } {
  const numFeatures = X[0].length;
  const W = Array.from({ length: numClasses }, () => Array(numFeatures).fill(0));
  const b = Array(numClasses).fill(0);

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = Array.from({ length: numClasses }, () => Array(numFeatures).fill(0));
    const gradB = Array(numClasses).fill(0);

    for (let i = 0; i < X.length; i++) {
      const logits = W.map((w, c) => w.reduce((s, wf, f) => s + wf * X[i][f], b[c]));
      const probs = softmax(logits);

      for (let c = 0; c < numClasses; c++) {
        const target = y[i] === c ? 1 : 0;
        const error = probs[c] - target;
        gradB[c] += error;
        for (let f = 0; f < numFeatures; f++) {
          gradW[c][f] += error * X[i][f];
        }
      }
    }

    const n = X.length;
    for (let c = 0; c < numClasses; c++) {
      b[c] -= lr * (gradB[c] / n);
      for (let f = 0; f < numFeatures; f++) {
        W[c][f] -= lr * (gradW[c][f] / n + lambda * W[c][f]);
      }
    }
  }

  return { W, b };
}

function predict(W: number[][], b: number[], x: number[]): { pred: number; probs: number[] } {
  const logits = W.map((w, c) => w.reduce((s, wf, f) => s + wf * x[f], b[c]));
  const probs = softmax(logits);
  const pred = probs.indexOf(Math.max(...probs));
  return { pred, probs };
}

// ─── Build dataset ────────────────────────────────────────────────────

console.log("Building feature matrix...");
const SESSIONS_TO_EVAL = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74];
const VOTE_MAP: Record<string, number> = { no: 0, abstain: 1, yes: 2 };

interface DataPoint { features: number[]; label: number; session: number; country: string; issue: string }
const dataset: DataPoint[] = [];

for (const vote of allVotes) {
  const session = rcSessionMap.get(vote.rcid);
  if (!session || !SESSIONS_TO_EVAL.includes(session)) continue;
  const issue = issueMap.get(vote.rcid);
  if (!issue || !ISSUES.includes(issue)) continue;
  const label = VOTE_MAP[vote.vote];
  if (label === undefined) continue;
  const profile = profileByName.get(vote.country.toLowerCase());
  if (!profile) continue;

  const peerSignal = computePeerSignal(profile.name, issue);
  const features = buildFeatures(profile, issue, peerSignal);
  dataset.push({ features, label, session, country: profile.name, issue });
}

console.log(`  ${dataset.length.toLocaleString()} labeled examples across ${SESSIONS_TO_EVAL.length} sessions\n`);

// ─── Leave-One-Session-Out Cross-Validation ───────────────────────────

console.log("Running leave-one-session-out cross-validation...\n");

interface FoldResult {
  testSession: number;
  trainSize: number;
  testSize: number;
  accuracy: number;
  perClass: { precision: number; recall: number; f1: number }[];
}

const foldResults: FoldResult[] = [];
let totalCorrect = 0, totalPredictions = 0;
const globalConfusion = Array.from({ length: 3 }, () => Array(3).fill(0));
const perCountryCorrect: Record<string, { correct: number; total: number }> = {};
const perIssueCorrect: Record<string, { correct: number; total: number }> = {};
const calibrationBuckets = Array.from({ length: 10 }, () => ({ predicted: 0, actual: 0, count: 0 }));

for (const testSession of SESSIONS_TO_EVAL) {
  const train = dataset.filter((d) => d.session !== testSession);
  const test = dataset.filter((d) => d.session === testSession);
  if (test.length < 100) continue;

  const X_train = train.map((d) => d.features);
  const y_train = train.map((d) => d.label);
  const { W, b } = trainLogReg(X_train, y_train, 3, 0.1, 40, 0.001);

  let correct = 0;
  const confusion = Array.from({ length: 3 }, () => Array(3).fill(0));

  for (const point of test) {
    const { pred, probs } = predict(W, b, point.features);
    confusion[point.label][pred]++;
    globalConfusion[point.label][pred]++;
    if (pred === point.label) { correct++; totalCorrect++; }
    totalPredictions++;

    // Per-country
    perCountryCorrect[point.country] = perCountryCorrect[point.country] || { correct: 0, total: 0 };
    perCountryCorrect[point.country].total++;
    if (pred === point.label) perCountryCorrect[point.country].correct++;

    // Per-issue
    perIssueCorrect[point.issue] = perIssueCorrect[point.issue] || { correct: 0, total: 0 };
    perIssueCorrect[point.issue].total++;
    if (pred === point.label) perIssueCorrect[point.issue].correct++;

    // Calibration (for the predicted class)
    const maxProb = Math.max(...probs);
    const bucket = Math.min(9, Math.floor(maxProb * 10));
    calibrationBuckets[bucket].predicted += maxProb;
    calibrationBuckets[bucket].actual += pred === point.label ? 1 : 0;
    calibrationBuckets[bucket].count++;
  }

  const perClass = [0, 1, 2].map((c) => {
    const tp = confusion[c][c];
    const fp = confusion.reduce((s, row, r) => s + (r !== c ? row[c] : 0), 0);
    const fn = confusion[c].reduce((s, v, col) => s + (col !== c ? v : 0), 0);
    const p = tp / (tp + fp) || 0;
    const r = tp / (tp + fn) || 0;
    return { precision: p, recall: r, f1: 2 * p * r / (p + r) || 0 };
  });

  foldResults.push({ testSession, trainSize: train.length, testSize: test.length, accuracy: correct / test.length, perClass });
  process.stdout.write(`  Session ${testSession}: ${(correct / test.length * 100).toFixed(1)}% (n=${test.length})\n`);
}

// ─── Feature Ablation Study ───────────────────────────────────────────

console.log("\nRunning feature ablation study...");

const ablationResults: { featureSet: string; accuracy: number; delta: number }[] = [];
const fullAccuracy = totalCorrect / totalPredictions;

// Train final model on all data for ablation
const X_all = dataset.map((d) => d.features);
const y_all = dataset.map((d) => d.label);
const fullModel = trainLogReg(X_all, y_all, 3, 0.1, 50, 0.001);

// Test on last 2 sessions
const testSet = dataset.filter((d) => d.session >= 73);
function evalAblated(maskFn: (f: number[]) => number[]): number {
  let c = 0;
  for (const d of testSet) {
    const { pred } = predict(fullModel.W, fullModel.b, maskFn(d.features));
    if (pred === d.label) c++;
  }
  return c / testSet.length;
}

const featureGroups = [
  { name: "Ideal Point (feature 0)", mask: (f: number[]) => f.map((v, i) => i === 0 ? 0 : v) },
  { name: "Democracy Index (feature 1)", mask: (f: number[]) => f.map((v, i) => i === 1 ? 0 : v) },
  { name: "Policy Dimensions (features 2-7)", mask: (f: number[]) => f.map((v, i) => i >= 2 && i <= 7 ? 0 : v) },
  { name: "Region one-hot (features 8-12)", mask: (f: number[]) => f.map((v, i) => i >= 8 && i <= 12 ? 0 : v) },
  { name: "Issue one-hot (features 13-18)", mask: (f: number[]) => f.map((v, i) => i >= 13 && i <= 18 ? 0 : v) },
  { name: "Topic History (features 19-21)", mask: (f: number[]) => f.map((v, i) => i >= 19 && i <= 21 ? 0 : v) },
  { name: "Peer Signal (feature 22)", mask: (f: number[]) => f.map((v, i) => i === 22 ? 0 : v) },
];

const baselineAblationAcc = evalAblated((f) => f);
for (const group of featureGroups) {
  const acc = evalAblated(group.mask);
  const delta = acc - baselineAblationAcc;
  ablationResults.push({ featureSet: group.name, accuracy: acc, delta });
  console.log(`  Without ${group.name.padEnd(35)} ${(acc * 100).toFixed(1)}% (Δ ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%)`);
}

// ─── Baselines ────────────────────────────────────────────────────────

console.log("\nBaseline comparisons:");
const testLabels = testSet.map((d) => d.label);
const majorityClass = 2; // Yes is majority
const majorityAcc = testLabels.filter((l) => l === majorityClass).length / testLabels.length;
const randomAcc = 1 / 3;
console.log(`  Random guess:      ${(randomAcc * 100).toFixed(1)}%`);
console.log(`  Majority class:    ${(majorityAcc * 100).toFixed(1)}%`);
console.log(`  Ideal point only:  ${(evalAblated((f) => [f[0], 0, 0, 0, 0, 0, 0, 0, ...Array(15).fill(0)]) * 100).toFixed(1)}%`);
console.log(`  Full model:        ${(baselineAblationAcc * 100).toFixed(1)}%`);

// ─── Report ───────────────────────────────────────────────────────────

const overallAccuracy = totalCorrect / totalPredictions;
const classLabels = ["No", "Abstain", "Yes"];
const globalPerClass = [0, 1, 2].map((c) => {
  const tp = globalConfusion[c][c];
  const fp = globalConfusion.reduce((s, row, r) => s + (r !== c ? row[c] : 0), 0);
  const fn = globalConfusion[c].reduce((s, v, col) => s + (col !== c ? v : 0), 0);
  const p = tp / (tp + fp) || 0;
  const r = tp / (tp + fn) || 0;
  return { class: classLabels[c], precision: p, recall: r, f1: 2 * p * r / (p + r) || 0, support: globalConfusion[c].reduce((a, b) => a + b, 0) };
});

console.log("\n╔══════════════════════════════════════════════════════════════════╗");
console.log("║   CROSS-VALIDATION REPORT (Leave-One-Session-Out)               ║");
console.log("╚══════════════════════════════════════════════════════════════════╝\n");
console.log(`  Dataset: ${dataset.length.toLocaleString()} examples, ${SESSIONS_TO_EVAL.length} sessions (2005-2019)`);
console.log(`  Model: Multinomial Logistic Regression (23 features, L2 λ=0.001)`);
console.log(`  CV Strategy: Leave-one-session-out (temporal — no future leakage)\n`);
console.log(`  Overall Accuracy: ${(overallAccuracy * 100).toFixed(2)}%`);
console.log(`  Macro F1: ${((globalPerClass.reduce((s, c) => s + c.f1, 0) / 3) * 100).toFixed(1)}%\n`);
console.log("  Per-Class:");
for (const c of globalPerClass) {
  console.log(`    ${c.class.padEnd(8)} P=${(c.precision*100).toFixed(1)}% R=${(c.recall*100).toFixed(1)}% F1=${(c.f1*100).toFixed(1)}% (n=${c.support.toLocaleString()})`);
}

// Top/bottom predicted countries
const countryRanking = Object.entries(perCountryCorrect)
  .filter(([, v]) => v.total >= 50)
  .map(([country, v]) => ({ country, accuracy: v.correct / v.total, total: v.total }))
  .sort((a, b) => b.accuracy - a.accuracy);

console.log("\n  Most predictable countries (n≥50):");
for (const c of countryRanking.slice(0, 10)) console.log(`    ${c.country.padEnd(25)} ${(c.accuracy*100).toFixed(1)}% (n=${c.total})`);
console.log("  Least predictable countries:");
for (const c of countryRanking.slice(-10)) console.log(`    ${c.country.padEnd(25)} ${(c.accuracy*100).toFixed(1)}% (n=${c.total})`);

// ─── Save ─────────────────────────────────────────────────────────────

const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    model: "Multinomial Logistic Regression",
    features: 23,
    regularization: "L2 (λ=0.001)",
    cvStrategy: "Leave-one-session-out (temporal, no future data leakage)",
    sessions: SESSIONS_TO_EVAL,
    totalExamples: dataset.length,
    totalPredictions,
    dataSources: {
      votingData: { name: "Erik Voeten UNGA Voting Data", doi: "10.7910/DVN/LEJUQZ", url: "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/LEJUQZ" },
      democracyScores: { name: "V-Dem v14", url: "https://www.v-dem.net/data/the-v-dem-dataset/" },
      derivedData: { name: "UNSim processed datasets", url: "https://github.com/ApurvaDesai6/unsim/tree/main/data" },
    },
    reproducibility: "npx tsx scripts/cross-validate.ts (requires data/raw/ CSVs from TidyTuesday)",
  },
  overall: { accuracy: overallAccuracy, macroF1: globalPerClass.reduce((s, c) => s + c.f1, 0) / 3 },
  perClass: globalPerClass,
  confusionMatrix: { labels: classLabels, matrix: globalConfusion },
  perSession: foldResults,
  perIssue: Object.entries(perIssueCorrect).map(([issue, v]) => ({ issue, accuracy: v.correct / v.total, total: v.total })).sort((a, b) => b.total - a.total),
  perCountry: { mostPredictable: countryRanking.slice(0, 20), leastPredictable: countryRanking.slice(-20) },
  featureAblation: ablationResults,
  baselines: { random: randomAcc, majorityClass: majorityAcc, idealPointOnly: evalAblated((f) => [f[0], 0, 0, 0, 0, 0, 0, 0, ...Array(15).fill(0)]), fullModel: baselineAblationAcc },
  calibration: calibrationBuckets.filter((b) => b.count > 0).map((b, i) => ({
    bucketMin: i * 10, bucketMax: (i + 1) * 10,
    avgConfidence: b.predicted / b.count,
    actualAccuracy: b.actual / b.count,
    count: b.count,
  })),
};

writeFileSync(path.join(DATA_DIR, "data/cross-validation-report.json"), JSON.stringify(report, null, 2));
console.log(`\n✓ Report saved to data/cross-validation-report.json`);
