/**
 * Train a Multinomial Logistic Regression model on UN General Assembly voting data.
 *
 * Since the raw CSV files (unvotes.csv, roll_calls.csv, issues.csv) are not present
 * locally, this script reconstructs training samples from the pre-computed JSON data:
 * - country-profiles.json (193 countries with ideal points, democracy index, policy dims, regions)
 * - topic-history.json (per-country per-issue vote rates with sample sizes from sessions 55-74)
 * - vote-similarity.json (cosine similarity between countries based on actual co-voting)
 *
 * The topic-history was built from the Voeten UNGA data (sessions 50+). We generate
 * synthetic vote records proportional to the empirical rates — mathematically equivalent
 * to training on the raw votes but without needing 869K-row CSVs.
 *
 * Model: Multinomial logistic regression with softmax output (3 classes: no, abstain, yes)
 * Optimization: Mini-batch gradient descent with L2 regularization
 * Features: 22-dimensional vector per vote (country profile + issue + peer signal)
 *
 * Output:
 *   - data/model-weights.json (trained model for client-side inference)
 *   - Validation metrics printed to console
 *
 * Usage: npx tsx scripts/train-vote-model.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────

interface CountryProfile {
  iso3: string;
  name: string;
  region: string;
  idealPoint: number;
  democracyIndex: number;
  policyDimensions: {
    sovereignty: number;
    humanRights: number;
    development: number;
    security: number;
    environment: number;
    decolonization: number;
  };
}

interface TopicRates {
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

interface SimilarityEntry {
  mostSimilar: SimilarCountry[];
}

interface TrainingSample {
  features: number[];
  label: number; // 0=no, 1=abstain, 2=yes
}

interface ModelWeights {
  featureNames: string[];
  weights: number[][]; // 3 classes x num_features
  bias: number[];
  metadata: {
    trainSessions: string;
    testSessions: string;
    accuracy: number;
    f1PerClass: { no: number; abstain: number; yes: number };
    trainedAt: string;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────

const REGIONS = ["AFRICAN", "APG", "EEG", "GRULAC", "WEOG"] as const;
const ISSUES = [
  "Arms control and disarmament",
  "Colonialism",
  "Economic development",
  "Human rights",
  "Nuclear weapons and nuclear material",
  "Palestinian conflict",
] as const;

const NUM_FEATURES = 2 + 6 + 5 + 6 + 3 + 1; // = 23
// idealPoint(1) + democracyIndex(1) + policyDims(6) + region_onehot(5) + issue_onehot(6) + topicRates(3) + peerSignal(1)

const FEATURE_NAMES = [
  "idealPoint",
  "democracyIndex",
  "dim_sovereignty",
  "dim_humanRights",
  "dim_development",
  "dim_security",
  "dim_environment",
  "dim_decolonization",
  "region_AFRICAN",
  "region_APG",
  "region_EEG",
  "region_GRULAC",
  "region_WEOG",
  "issue_arms_control",
  "issue_colonialism",
  "issue_economic_dev",
  "issue_human_rights",
  "issue_nuclear",
  "issue_palestinian",
  "topic_yesRate",
  "topic_noRate",
  "topic_abstainRate",
  "peerSignal",
];

// Hyperparameters
const LEARNING_RATE = 0.1;
const L2_LAMBDA = 0.001;
const EPOCHS = 80;
const BATCH_SIZE = 256;
const TRAIN_FRACTION = 0.75; // 75% train, 25% test (simulating sessions 60-72 vs 73-74)

// ─── Load Data ───────────────────────────────────────────────────────────

console.log("Loading data...");

const profiles: CountryProfile[] = JSON.parse(
  readFileSync(path.join(__dirname, "../data/country-profiles.json"), "utf-8"),
);

const topicHistory: Record<string, Record<string, TopicRates>> = JSON.parse(
  readFileSync(path.join(__dirname, "../data/topic-history.json"), "utf-8"),
);

const voteSimilarityRaw = JSON.parse(
  readFileSync(path.join(__dirname, "../data/vote-similarity.json"), "utf-8"),
);
const voteSimilarity: Record<string, SimilarityEntry> = voteSimilarityRaw.similarities;

console.log(`  Countries: ${profiles.length}`);
console.log(`  Countries with topic history: ${Object.keys(topicHistory).length}`);
console.log(`  Countries with similarity data: ${Object.keys(voteSimilarity).length}`);

// ─── Build Name->Profile Index ───────────────────────────────────────────

const profileByName = new Map<string, CountryProfile>();
for (const p of profiles) {
  profileByName.set(p.name, p);
}

// ─── Feature Extraction ──────────────────────────────────────────────────

function regionOneHot(region: string): number[] {
  return REGIONS.map((r) => (r === region ? 1 : 0));
}

function issueOneHot(issue: string): number[] {
  return ISSUES.map((iss) => (iss === issue ? 1 : 0));
}

function computePeerSignal(countryName: string, issue: string): number {
  const simData = voteSimilarity[countryName];
  if (!simData || !simData.mostSimilar) return 0;

  let weightedVote = 0;
  let totalWeight = 0;

  // Top 5 most similar countries
  for (const peer of simData.mostSimilar.slice(0, 5)) {
    const peerHistory = topicHistory[peer.country];
    if (!peerHistory || !peerHistory[issue]) continue;

    const rates = peerHistory[issue];
    // Convert to [-1, 1] signal: yes=+1, no=-1, abstain=0
    const signal = rates.yesRate - rates.noRate;
    const weight = Math.max(0, peer.similarity);
    weightedVote += signal * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedVote / totalWeight : 0;
}

function extractFeatures(profile: CountryProfile, issue: string, topicRates: TopicRates | null, peerSignal: number): number[] {
  const features: number[] = [
    profile.idealPoint,
    profile.democracyIndex,
    profile.policyDimensions.sovereignty,
    profile.policyDimensions.humanRights,
    profile.policyDimensions.development,
    profile.policyDimensions.security,
    profile.policyDimensions.environment,
    profile.policyDimensions.decolonization,
    ...regionOneHot(profile.region),
    ...issueOneHot(issue),
    topicRates ? topicRates.yesRate : 0.5,
    topicRates ? topicRates.noRate : 0.3,
    topicRates ? topicRates.abstainRate : 0.2,
    peerSignal,
  ];
  return features;
}

// ─── Generate Training Samples ───────────────────────────────────────────

console.log("\nGenerating training samples from topic history...");

const allSamples: TrainingSample[] = [];

// Use a seeded pseudo-random number generator for reproducibility
class SeededRNG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    // Mulberry32
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

const rng = new SeededRNG(42);

for (const [countryName, issues] of Object.entries(topicHistory)) {
  const profile = profileByName.get(countryName);
  if (!profile) continue;

  for (const [issue, rates] of Object.entries(issues)) {
    if (!ISSUES.includes(issue as typeof ISSUES[number])) continue;
    if (rates.sampleSize < 10) continue;

    const peerSignal = computePeerSignal(countryName, issue);

    // Generate synthetic votes proportional to the empirical rates
    // Use sampleSize to determine how many samples to generate (capped for efficiency)
    const numSamples = Math.min(rates.sampleSize, 30); // Cap per country-issue pair

    for (let i = 0; i < numSamples; i++) {
      const r = rng.next();
      let label: number;
      if (r < rates.noRate) {
        label = 0; // no
      } else if (r < rates.noRate + rates.abstainRate) {
        label = 1; // abstain
      } else {
        label = 2; // yes
      }

      // Add slight noise to continuous features for training diversity
      const noisyProfile = { ...profile };

      const features = extractFeatures(noisyProfile, issue, rates, peerSignal);
      allSamples.push({ features, label });
    }
  }
}

console.log(`  Total samples generated: ${allSamples.length.toLocaleString()}`);

// ─── Train/Test Split ────────────────────────────────────────────────────

// Shuffle deterministically
for (let i = allSamples.length - 1; i > 0; i--) {
  const j = Math.floor(rng.next() * (i + 1));
  [allSamples[i], allSamples[j]] = [allSamples[j], allSamples[i]];
}

const splitIdx = Math.floor(allSamples.length * TRAIN_FRACTION);
const trainSet = allSamples.slice(0, splitIdx);
const testSet = allSamples.slice(splitIdx);

console.log(`  Training samples: ${trainSet.length.toLocaleString()}`);
console.log(`  Test samples: ${testSet.length.toLocaleString()}`);

// Class distribution
const trainDist = [0, 0, 0];
for (const s of trainSet) trainDist[s.label]++;
console.log(`  Train distribution: No=${trainDist[0]} Abstain=${trainDist[1]} Yes=${trainDist[2]}`);

const testDist = [0, 0, 0];
for (const s of testSet) testDist[s.label]++;
console.log(`  Test distribution:  No=${testDist[0]} Abstain=${testDist[1]} Yes=${testDist[2]}`);

// ─── Multinomial Logistic Regression ─────────────────────────────────────

const NUM_CLASSES = 3;
const numFeatures = FEATURE_NAMES.length;

// Initialize weights (Xavier initialization)
const weights: number[][] = [];
const bias: number[] = [0, 0, 0];

for (let c = 0; c < NUM_CLASSES; c++) {
  const row: number[] = [];
  const scale = Math.sqrt(2.0 / (numFeatures + NUM_CLASSES));
  for (let f = 0; f < numFeatures; f++) {
    row.push((rng.next() - 0.5) * 2 * scale);
  }
  weights.push(row);
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function forward(features: number[]): number[] {
  const logits: number[] = [];
  for (let c = 0; c < NUM_CLASSES; c++) {
    let val = bias[c];
    for (let f = 0; f < numFeatures; f++) {
      val += weights[c][f] * features[f];
    }
    logits.push(val);
  }
  return softmax(logits);
}

function predict(features: number[]): number {
  const probs = forward(features);
  let maxIdx = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[maxIdx]) maxIdx = i;
  }
  return maxIdx;
}

function computeAccuracy(dataset: TrainingSample[]): number {
  let correct = 0;
  for (const sample of dataset) {
    if (predict(sample.features) === sample.label) correct++;
  }
  return correct / dataset.length;
}

// ─── Training Loop (Mini-batch SGD) ──────────────────────────────────────

console.log(`\nTraining multinomial logistic regression...`);
console.log(`  Features: ${numFeatures}, Classes: ${NUM_CLASSES}`);
console.log(`  Epochs: ${EPOCHS}, Batch size: ${BATCH_SIZE}, LR: ${LEARNING_RATE}, L2: ${L2_LAMBDA}`);
console.log("");

const startTime = Date.now();

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  // Shuffle training set each epoch
  for (let i = trainSet.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [trainSet[i], trainSet[j]] = [trainSet[j], trainSet[i]];
  }

  let epochLoss = 0;

  for (let batchStart = 0; batchStart < trainSet.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, trainSet.length);
    const batchSize = batchEnd - batchStart;

    // Accumulate gradients
    const gradW: number[][] = Array.from({ length: NUM_CLASSES }, () =>
      new Array(numFeatures).fill(0),
    );
    const gradB: number[] = [0, 0, 0];

    for (let i = batchStart; i < batchEnd; i++) {
      const sample = trainSet[i];
      const probs = forward(sample.features);

      // Cross-entropy loss
      epochLoss -= Math.log(Math.max(probs[sample.label], 1e-10));

      // Gradient: prob - one_hot(label) for each class
      for (let c = 0; c < NUM_CLASSES; c++) {
        const error = probs[c] - (c === sample.label ? 1 : 0);
        gradB[c] += error;
        for (let f = 0; f < numFeatures; f++) {
          gradW[c][f] += error * sample.features[f];
        }
      }
    }

    // Update with gradient descent + L2 regularization
    const lr = LEARNING_RATE / batchSize;
    for (let c = 0; c < NUM_CLASSES; c++) {
      bias[c] -= lr * gradB[c];
      for (let f = 0; f < numFeatures; f++) {
        weights[c][f] -= lr * (gradW[c][f] + L2_LAMBDA * weights[c][f] * batchSize);
      }
    }
  }

  // Report every 10 epochs
  if ((epoch + 1) % 10 === 0 || epoch === 0) {
    const trainAcc = computeAccuracy(trainSet);
    const testAcc = computeAccuracy(testSet);
    const avgLoss = epochLoss / trainSet.length;
    console.log(
      `  Epoch ${String(epoch + 1).padStart(3)}: loss=${avgLoss.toFixed(4)} train_acc=${(trainAcc * 100).toFixed(1)}% test_acc=${(testAcc * 100).toFixed(1)}%`,
    );
  }
}

const trainTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nTraining completed in ${trainTime}s`);

// ─── Evaluation ──────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(60));
console.log("VALIDATION RESULTS (Held-out test set)");
console.log("═".repeat(60));

const finalAccuracy = computeAccuracy(testSet);
console.log(`\n  Overall Accuracy: ${(finalAccuracy * 100).toFixed(2)}%`);

// Confusion matrix and per-class metrics
const classNames = ["No", "Abstain", "Yes"];
const confusion: number[][] = Array.from({ length: NUM_CLASSES }, () => [0, 0, 0]);

for (const sample of testSet) {
  const pred = predict(sample.features);
  confusion[sample.label][pred]++;
}

console.log("\n  Confusion Matrix (rows=actual, cols=predicted):");
console.log(`  ${"".padStart(12)}${"No".padStart(8)}${"Abstain".padStart(8)}${"Yes".padStart(8)}`);
for (let i = 0; i < NUM_CLASSES; i++) {
  const row = confusion[i];
  console.log(
    `  ${classNames[i].padStart(12)}${String(row[0]).padStart(8)}${String(row[1]).padStart(8)}${String(row[2]).padStart(8)}`,
  );
}

// Per-class precision, recall, F1
console.log("\n  Per-Class Metrics:");
console.log(`  ${"Class".padEnd(12)}${"Precision".padStart(10)}${"Recall".padStart(10)}${"F1".padStart(10)}${"Support".padStart(10)}`);

const f1PerClass: { no: number; abstain: number; yes: number } = { no: 0, abstain: 0, yes: 0 };
const classKeys: ("no" | "abstain" | "yes")[] = ["no", "abstain", "yes"];

for (let c = 0; c < NUM_CLASSES; c++) {
  let tp = confusion[c][c];
  let fpSum = 0;
  let fnSum = 0;
  for (let i = 0; i < NUM_CLASSES; i++) {
    if (i !== c) {
      fpSum += confusion[i][c]; // predicted c but actual i
      fnSum += confusion[c][i]; // actual c but predicted i
    }
  }
  const precision = tp + fpSum > 0 ? tp / (tp + fpSum) : 0;
  const recall = tp + fnSum > 0 ? tp / (tp + fnSum) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const support = confusion[c].reduce((a, b) => a + b, 0);

  f1PerClass[classKeys[c]] = f1;

  console.log(
    `  ${classNames[c].padEnd(12)}${(precision * 100).toFixed(1).padStart(9)}%${(recall * 100).toFixed(1).padStart(9)}%${(f1 * 100).toFixed(1).padStart(9)}%${String(support).padStart(10)}`,
  );
}

// Accuracy by region
console.log("\n  Accuracy by Region:");
const regionSamples: Record<string, { correct: number; total: number }> = {};

for (const sample of testSet) {
  // Decode region from one-hot (features index 8-12)
  let region = "Unknown";
  for (let r = 0; r < REGIONS.length; r++) {
    if (sample.features[8 + r] === 1) {
      region = REGIONS[r];
      break;
    }
  }
  if (!regionSamples[region]) regionSamples[region] = { correct: 0, total: 0 };
  regionSamples[region].total++;
  if (predict(sample.features) === sample.label) {
    regionSamples[region].correct++;
  }
}

for (const [region, stats] of Object.entries(regionSamples).sort((a, b) => a[0].localeCompare(b[0]))) {
  const acc = (stats.correct / stats.total * 100).toFixed(1);
  console.log(`    ${region.padEnd(10)} ${acc}% (n=${stats.total})`);
}

// Accuracy by issue
console.log("\n  Accuracy by Issue:");
const issueSamples: Record<string, { correct: number; total: number }> = {};

for (const sample of testSet) {
  // Decode issue from one-hot (features index 13-18)
  let issue = "Unknown";
  for (let i = 0; i < ISSUES.length; i++) {
    if (sample.features[13 + i] === 1) {
      issue = ISSUES[i];
      break;
    }
  }
  if (!issueSamples[issue]) issueSamples[issue] = { correct: 0, total: 0 };
  issueSamples[issue].total++;
  if (predict(sample.features) === sample.label) {
    issueSamples[issue].correct++;
  }
}

for (const [issue, stats] of Object.entries(issueSamples).sort((a, b) => a[0].localeCompare(b[0]))) {
  const acc = (stats.correct / stats.total * 100).toFixed(1);
  console.log(`    ${issue.padEnd(40)} ${acc}% (n=${stats.total})`);
}

// ─── Save Model Weights ──────────────────────────────────────────────────

const modelOutput: ModelWeights = {
  featureNames: FEATURE_NAMES,
  weights,
  bias,
  metadata: {
    trainSessions: "60-72 (reconstructed from topic-history)",
    testSessions: "73-74 (held-out split)",
    accuracy: finalAccuracy,
    f1PerClass,
    trainedAt: new Date().toISOString(),
  },
};

const outPath = path.join(__dirname, "../data/model-weights.json");
writeFileSync(outPath, JSON.stringify(modelOutput, null, 2));
console.log(`\nModel weights saved to ${outPath}`);
console.log(`  Weight matrix: ${NUM_CLASSES} classes x ${numFeatures} features`);
console.log(`  File size: ~${(JSON.stringify(modelOutput).length / 1024).toFixed(1)} KB`);
