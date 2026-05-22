/**
 * Trained Model Inference Engine
 *
 * Loads pre-trained class-weighted multinomial logistic regression and provides
 * lightweight prediction that runs server-side in Vercel functions.
 *
 * Model: 29 features, 3 classes (No/Abstain/Yes)
 * Trained on sessions 60-72 (152K examples), tested on 73-74 (20K examples)
 * Cross-validated accuracy: 65.1%, Macro F1: 49.8%
 * Key improvement: No-vote F1 = 40.4% (vs 0% in unweighted baseline)
 *
 * Technique: Class-weighted loss (4.39× for No, 2.96× for Abstain, 0.41× for Yes)
 * with interaction features and mini-batch SGD.
 */

import { readFileSync } from "fs";
import path from "path";

export interface ModelWeights {
  featureNames: string[];
  weights: number[][];
  bias: number[];
  metadata: {
    trainSessions: string;
    testSessions: string;
    accuracy: number;
    macroF1: number;
    f1PerClass: { no: number; abstain: number; yes: number };
    classWeights: number[];
    trainedAt: string;
    numFeatures: number;
    numTrainExamples: number;
    numTestExamples: number;
    technique: string;
  };
}

export interface VotePrediction {
  yes: number;
  no: number;
  abstain: number;
}

let _model: ModelWeights | null = null;

function getModel(): ModelWeights {
  if (!_model) {
    _model = JSON.parse(readFileSync(path.join(process.cwd(), "data", "model-weights.json"), "utf-8")) as ModelWeights;
  }
  return _model;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function predictWithModel(features: number[]): VotePrediction {
  const model = getModel();
  const numClasses = model.weights.length;
  const logits: number[] = [];

  for (let c = 0; c < numClasses; c++) {
    let val = model.bias[c];
    for (let f = 0; f < features.length; f++) {
      val += model.weights[c][f] * (features[f] || 0);
    }
    logits.push(val);
  }

  const probs = softmax(logits);
  return { no: probs[0], abstain: probs[1], yes: probs[2] };
}

export function predictVote(features: number[]): "yes" | "no" | "abstain" {
  const probs = predictWithModel(features);
  if (probs.yes >= probs.no && probs.yes >= probs.abstain) return "yes";
  if (probs.no >= probs.yes && probs.no >= probs.abstain) return "no";
  return "abstain";
}

export function getModelMetadata() {
  return getModel().metadata;
}

// ─── Feature Construction ─────────────────────────────────────────────

const REGIONS = ["AFRICAN", "APG", "EEG", "GRULAC", "WEOG"] as const;
const ISSUES = [
  "Arms control and disarmament",
  "Colonialism",
  "Economic development",
  "Human rights",
  "Nuclear weapons and nuclear material",
  "Palestinian conflict",
] as const;

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
  sampleSize: number;
  peerSignal: number;
}): number[] {
  const hasHistory = params.sampleSize > 20 ? 1 : 0;
  const logSampleSize = Math.log1p(params.sampleSize) / 6;

  const regionOneHot = REGIONS.map((r) => r === params.region ? 1 : 0);
  const issueOneHot = ISSUES.map((i) => i === params.issue ? 1 : 0);

  // Interaction features
  const idealXyes = params.idealPoint * params.topicYesRate;
  const idealXno = params.idealPoint * params.topicNoRate;
  const democXabstain = params.democracyIndex * params.topicAbstainRate;
  const peerXideal = params.peerSignal * params.idealPoint;

  return [
    params.topicYesRate, params.topicNoRate, params.topicAbstainRate,
    hasHistory, logSampleSize,
    params.idealPoint, params.democracyIndex,
    params.policyDimensions.sovereignty, params.policyDimensions.humanRights,
    params.policyDimensions.development, params.policyDimensions.security,
    params.policyDimensions.environment, params.policyDimensions.decolonization,
    params.peerSignal,
    idealXyes, idealXno, democXabstain, peerXideal,
    ...regionOneHot,
    ...issueOneHot,
  ];
}
