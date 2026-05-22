/**
 * Trained Model Inference Engine
 *
 * Loads pre-trained multinomial logistic regression weights and provides
 * a lightweight prediction function that can run client-side.
 *
 * The model was trained on UN General Assembly voting data (sessions 60-72)
 * using country profiles, issue categories, topic history, and peer signals.
 *
 * Forward pass: softmax(W * x + b) where:
 *   W = 3 x 23 weight matrix (3 classes, 23 features)
 *   b = 3-element bias vector
 *   x = 23-element feature vector
 *
 * Classes: 0=no, 1=abstain, 2=yes
 */

import { readFileSync } from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ModelWeights {
  featureNames: string[];
  weights: number[][]; // 3 classes x num_features
  bias: number[];      // 3 elements
  metadata: {
    trainSessions: string;
    testSessions: string;
    accuracy: number;
    f1PerClass: { no: number; abstain: number; yes: number };
    trainedAt: string;
  };
}

export interface VotePrediction {
  yes: number;
  no: number;
  abstain: number;
}

// ─── Model Loading ───────────────────────────────────────────────────────

let _model: ModelWeights | null = null;

function getModel(): ModelWeights {
  if (!_model) {
    const weightsPath = path.join(__dirname, "../data/model-weights.json");
    _model = JSON.parse(readFileSync(weightsPath, "utf-8")) as ModelWeights;
  }
  return _model;
}

// ─── Softmax ─────────────────────────────────────────────────────────────

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// ─── Prediction ──────────────────────────────────────────────────────────

/**
 * Predict vote probabilities given a feature vector.
 *
 * @param features - Array of 23 features in the order specified by featureNames:
 *   [idealPoint, democracyIndex, dim_sovereignty, dim_humanRights, dim_development,
 *    dim_security, dim_environment, dim_decolonization, region_AFRICAN, region_APG,
 *    region_EEG, region_GRULAC, region_WEOG, issue_arms_control, issue_colonialism,
 *    issue_economic_dev, issue_human_rights, issue_nuclear, issue_palestinian,
 *    topic_yesRate, topic_noRate, topic_abstainRate, peerSignal]
 *
 * @returns Probabilities for each vote outcome (summing to 1.0)
 */
export function predictWithModel(features: number[]): VotePrediction {
  const model = getModel();

  if (features.length !== model.featureNames.length) {
    throw new Error(
      `Feature vector length mismatch: expected ${model.featureNames.length}, got ${features.length}`,
    );
  }

  // Forward pass: logits = W * x + b
  const numClasses = model.weights.length;
  const numFeatures = model.featureNames.length;
  const logits: number[] = [];

  for (let c = 0; c < numClasses; c++) {
    let val = model.bias[c];
    for (let f = 0; f < numFeatures; f++) {
      val += model.weights[c][f] * features[f];
    }
    logits.push(val);
  }

  // Softmax to get probabilities
  const probs = softmax(logits);

  return {
    no: probs[0],
    abstain: probs[1],
    yes: probs[2],
  };
}

/**
 * Get the most likely vote as a string.
 */
export function predictVote(features: number[]): "yes" | "no" | "abstain" {
  const probs = predictWithModel(features);
  if (probs.yes >= probs.no && probs.yes >= probs.abstain) return "yes";
  if (probs.no >= probs.yes && probs.no >= probs.abstain) return "no";
  return "abstain";
}

/**
 * Get model metadata (accuracy, training info).
 */
export function getModelMetadata(): ModelWeights["metadata"] {
  return getModel().metadata;
}

/**
 * Get the feature names the model expects.
 */
export function getFeatureNames(): string[] {
  return getModel().featureNames;
}

// ─── Feature Construction Helpers ────────────────────────────────────────

const REGIONS = ["AFRICAN", "APG", "EEG", "GRULAC", "WEOG"] as const;
const ISSUES = [
  "Arms control and disarmament",
  "Colonialism",
  "Economic development",
  "Human rights",
  "Nuclear weapons and nuclear material",
  "Palestinian conflict",
] as const;

export type Region = typeof REGIONS[number];
export type Issue = typeof ISSUES[number];

/**
 * Build a feature vector from structured inputs.
 * This is the convenience function for callers who have country profile data.
 */
export function buildFeatureVector(params: {
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
  region: string;
  issue: string;
  topicYesRate: number;
  topicNoRate: number;
  topicAbstainRate: number;
  peerSignal: number;
}): number[] {
  const regionOneHot = REGIONS.map((r) => (r === params.region ? 1 : 0));
  const issueOneHot = ISSUES.map((iss) => (iss === params.issue ? 1 : 0));

  return [
    params.idealPoint,
    params.democracyIndex,
    params.policyDimensions.sovereignty,
    params.policyDimensions.humanRights,
    params.policyDimensions.development,
    params.policyDimensions.security,
    params.policyDimensions.environment,
    params.policyDimensions.decolonization,
    ...regionOneHot,
    ...issueOneHot,
    params.topicYesRate,
    params.topicNoRate,
    params.topicAbstainRate,
    params.peerSignal,
  ];
}
