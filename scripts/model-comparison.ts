/**
 * Model Comparison Study
 *
 * Compares multiple prediction approaches on the same held-out test set:
 * 1. Majority class baseline (always predict Yes)
 * 2. Logistic Regression (class-weighted, current model)
 * 3. K-Nearest Neighbors (using vote-similarity as distance)
 * 4. Random Forest (ensemble of decision trees)
 * 5. Graph-based retrieval (direct history lookup from KG)
 * 6. Ensemble (weighted combination of best methods)
 *
 * All evaluated on sessions 73-74 with identical train/test splits.
 * Reports: accuracy, macro F1, per-class P/R/F1, and which method
 * is best for which scenario (issue, region, country type).
 *
 * Usage: npx tsx scripts/model-comparison.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { RandomForestClassifier } from "ml-random-forest";
import type { CountryProfile } from "../types";

const DATA_DIR = path.join(__dirname, "..");

console.log("Loading data...");
const profiles: CountryProfile[] = JSON.parse(readFileSync(path.join(DATA_DIR, "data/country-profiles.json"), "utf-8"));
const topicHistory: Record<string, Record<string, { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }>> = JSON.parse(readFileSync(path.join(DATA_DIR, "data/topic-history.json"), "utf-8"));
const rawSim = JSON.parse(readFileSync(path.join(DATA_DIR, "data/vote-similarity.json"), "utf-8"));
const similarities: Record<string, { mostSimilar: { country: string; similarity: number }[] }> = rawSim.similarities || {};

const rawVotes = readFileSync(path.join(DATA_DIR, "data/raw/unvotes.csv"), "utf-8");
const rawRollCalls = readFileSync(path.join(DATA_DIR, "data/raw/roll_calls.csv"), "utf-8");
const rawIssues = readFileSync(path.join(DATA_DIR, "data/raw/issues.csv"), "utf-8");

const issueMap = new Map<string, string>();
for (const line of rawIssues.split("\n").slice(1)) {
  const parts = line.split(",");
  if (parts.length >= 3) issueMap.set(parts[0], parts.slice(2).join(",").replace(/"/g, "").trim());
}

const rcSessionMap = new Map<string, number>();
for (const line of rawRollCalls.split("\n").slice(1)) {
  const parts = line.split(",");
  if (parts.length >= 2) rcSessionMap.set(parts[0], parseInt(parts[1]));
}

const profileByName = new Map(profiles.map((p) => [p.name.toLowerCase(), p]));
const VOTE_MAP: Record<string, number> = { no: 0, abstain: 1, yes: 2 };
const REGIONS = ["AFRICAN", "APG", "EEG", "GRULAC", "WEOG"];
const ISSUES = ["Arms control and disarmament", "Colonialism", "Economic development", "Human rights", "Nuclear weapons and nuclear material", "Palestinian conflict"];

// ─── Build dataset ────────────────────────────────────────────────────

function buildFeatures(country: CountryProfile, issue: string): number[] {
  const rates = topicHistory[country.name]?.[issue];
  const yesRate = rates?.yesRate || 0.5;
  const noRate = rates?.noRate || 0.2;
  const abstainRate = rates?.abstainRate || 0.1;
  const sampleSize = rates?.sampleSize || 0;

  let peerSignal = 0;
  const cs = similarities[country.name];
  if (cs?.mostSimilar) {
    let wSum = 0, wTotal = 0;
    for (const sim of cs.mostSimilar.slice(0, 8)) {
      const r = topicHistory[sim.country]?.[issue];
      if (!r) continue;
      wSum += (r.yesRate - r.noRate) * sim.similarity;
      wTotal += Math.abs(sim.similarity);
    }
    if (wTotal > 0) peerSignal = wSum / wTotal;
  }

  return [
    yesRate, noRate, abstainRate,
    sampleSize > 20 ? 1 : 0, Math.log1p(sampleSize) / 6,
    country.idealPoint, country.democracyIndex,
    country.policyDimensions.sovereignty, country.policyDimensions.humanRights,
    country.policyDimensions.development, country.policyDimensions.security,
    country.policyDimensions.environment, country.policyDimensions.decolonization,
    peerSignal,
    country.idealPoint * yesRate, country.idealPoint * noRate,
    country.democracyIndex * abstainRate, peerSignal * country.idealPoint,
    ...REGIONS.map((r) => r === country.region ? 1 : 0),
    ...ISSUES.map((i) => i === issue ? 1 : 0),
  ];
}

console.log("Building dataset...");
interface DataPoint { features: number[]; label: number; country: string; issue: string; region: string }
const trainData: DataPoint[] = [];
const testData: DataPoint[] = [];

for (const line of rawVotes.split("\n").slice(1)) {
  const parts = line.split(",");
  if (parts.length < 4) continue;
  const [rcid, countryName, , vote] = parts;
  const session = rcSessionMap.get(rcid);
  if (!session || session < 60 || session > 74) continue;
  const issue = issueMap.get(rcid);
  if (!issue || !ISSUES.includes(issue)) continue;
  const label = VOTE_MAP[vote.trim()];
  if (label === undefined) continue;
  const profile = profileByName.get(countryName.toLowerCase());
  if (!profile) continue;

  const point = { features: buildFeatures(profile, issue), label, country: profile.name, issue, region: profile.region };
  if (session <= 72) trainData.push(point);
  else testData.push(point);
}

console.log(`  Train: ${trainData.length.toLocaleString()} | Test: ${testData.length.toLocaleString()}\n`);

// ─── Metrics helper ───────────────────────────────────────────────────

function evaluate(predictions: number[], actuals: number[]): { accuracy: number; macroF1: number; perClass: { class: string; precision: number; recall: number; f1: number; support: number }[] } {
  const confusion = Array.from({ length: 3 }, () => Array(3).fill(0));
  let correct = 0;
  for (let i = 0; i < predictions.length; i++) {
    confusion[actuals[i]][predictions[i]]++;
    if (predictions[i] === actuals[i]) correct++;
  }
  const labels = ["No", "Abstain", "Yes"];
  const perClass = [0, 1, 2].map((c) => {
    const tp = confusion[c][c];
    const fp = confusion.reduce((s, row, r) => s + (r !== c ? row[c] : 0), 0);
    const fn = confusion[c].reduce((s, v, col) => s + (col !== c ? v : 0), 0);
    const p = tp / (tp + fp) || 0;
    const r = tp / (tp + fn) || 0;
    return { class: labels[c], precision: p, recall: r, f1: 2 * p * r / (p + r) || 0, support: confusion[c].reduce((a: number, b: number) => a + b, 0) };
  });
  return { accuracy: correct / predictions.length, macroF1: perClass.reduce((s, c) => s + c.f1, 0) / 3, perClass };
}

const testLabels = testData.map((d) => d.label);

// ─── Model 1: Majority Class ─────────────────────────────────────────

console.log("1. Majority Class Baseline...");
const majorityPreds = testData.map(() => 2);
const majorityResult = evaluate(majorityPreds, testLabels);
console.log(`   Accuracy: ${(majorityResult.accuracy * 100).toFixed(1)}% | Macro F1: ${(majorityResult.macroF1 * 100).toFixed(1)}%`);

// ─── Model 2: Graph Retrieval (direct history) ────────────────────────

console.log("2. Graph Retrieval (KG direct lookup)...");
const graphPreds = testData.map((d) => {
  const rates = topicHistory[d.country]?.[d.issue];
  if (!rates || rates.sampleSize < 20) return 2; // fallback to Yes
  // Predict the class with highest rate
  if (rates.yesRate >= rates.noRate && rates.yesRate >= rates.abstainRate) return 2;
  if (rates.noRate >= rates.yesRate && rates.noRate >= rates.abstainRate) return 0;
  return 1;
});
const graphResult = evaluate(graphPreds, testLabels);
console.log(`   Accuracy: ${(graphResult.accuracy * 100).toFixed(1)}% | Macro F1: ${(graphResult.macroF1 * 100).toFixed(1)}%`);

// ─── Model 3: KNN (vote-similarity weighted) ─────────────────────────

console.log("3. KNN (vote-similarity weighted neighbors)...");
const knnPreds = testData.map((d) => {
  const cs = similarities[d.country];
  if (!cs?.mostSimilar) return 2;
  let yesVotes = 0, noVotes = 0, abstainVotes = 0, totalWeight = 0;
  for (const sim of cs.mostSimilar.slice(0, 5)) {
    const neighborRates = topicHistory[sim.country]?.[d.issue];
    if (!neighborRates) continue;
    const w = sim.similarity;
    yesVotes += neighborRates.yesRate * w;
    noVotes += neighborRates.noRate * w;
    abstainVotes += neighborRates.abstainRate * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 2;
  const rates = [noVotes / totalWeight, abstainVotes / totalWeight, yesVotes / totalWeight];
  return rates.indexOf(Math.max(...rates));
});
const knnResult = evaluate(knnPreds, testLabels);
console.log(`   Accuracy: ${(knnResult.accuracy * 100).toFixed(1)}% | Macro F1: ${(knnResult.macroF1 * 100).toFixed(1)}%`);

// ─── Model 4: Random Forest ──────────────────────────────────────────

console.log("4. Random Forest (100 trees)...");
const X_train = trainData.map((d) => d.features);
const y_train = trainData.map((d) => d.label);
const X_test = testData.map((d) => d.features);

const rf = new RandomForestClassifier({
  nEstimators: 100,
  maxFeatures: 0.7,
  replacement: true,
  seed: 42,
});
rf.train(X_train, y_train);
const rfPreds = rf.predict(X_test) as number[];
const rfResult = evaluate(rfPreds, testLabels);
console.log(`   Accuracy: ${(rfResult.accuracy * 100).toFixed(1)}% | Macro F1: ${(rfResult.macroF1 * 100).toFixed(1)}%`);

// ─── Model 5: Ensemble (Graph + RF) ──────────────────────────────────

console.log("5. Ensemble (Graph retrieval + Random Forest)...");
const ensemblePreds = testData.map((d, i) => {
  const rates = topicHistory[d.country]?.[d.issue];
  const hasDirectHistory = rates && rates.sampleSize >= 30;

  if (hasDirectHistory) {
    // Trust direct history for well-documented countries
    if (rates.yesRate >= rates.noRate && rates.yesRate >= rates.abstainRate) return 2;
    if (rates.noRate >= rates.yesRate && rates.noRate >= rates.abstainRate) return 0;
    return 1;
  } else {
    // Fall back to RF for countries without strong history
    return rfPreds[i];
  }
});
const ensembleResult = evaluate(ensemblePreds, testLabels);
console.log(`   Accuracy: ${(ensembleResult.accuracy * 100).toFixed(1)}% | Macro F1: ${(ensembleResult.macroF1 * 100).toFixed(1)}%`);

// ─── Report ───────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║             MODEL COMPARISON RESULTS                         ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");
console.log("  Model                      Accuracy    Macro F1    No F1    Abstain F1    Yes F1");
console.log("  ─────────────────────────  ────────    ────────    ─────    ──────────    ──────");

const results = [
  { name: "Majority Class (baseline)", ...majorityResult },
  { name: "Graph Retrieval (KG)", ...graphResult },
  { name: "KNN (similarity-weighted)", ...knnResult },
  { name: "Random Forest (100 trees)", ...rfResult },
  { name: "Ensemble (Graph + RF)", ...ensembleResult },
];

for (const r of results) {
  console.log(`  ${r.name.padEnd(27)} ${(r.accuracy*100).toFixed(1).padStart(5)}%      ${(r.macroF1*100).toFixed(1).padStart(5)}%     ${(r.perClass[0].f1*100).toFixed(1).padStart(5)}%    ${(r.perClass[1].f1*100).toFixed(1).padStart(5)}%        ${(r.perClass[2].f1*100).toFixed(1).padStart(5)}%`);
}

console.log("\n  Winner: " + results.sort((a, b) => b.macroF1 - a.macroF1)[0].name);

// Save
const report = {
  generatedAt: new Date().toISOString(),
  testSet: "Sessions 73-74 (2018-2019)",
  testSize: testData.length,
  trainSize: trainData.length,
  results: results.map((r) => ({ name: r.name, accuracy: r.accuracy, macroF1: r.macroF1, perClass: r.perClass })),
};
writeFileSync(path.join(DATA_DIR, "data/model-comparison.json"), JSON.stringify(report, null, 2));
console.log("\n✓ Report saved to data/model-comparison.json");
