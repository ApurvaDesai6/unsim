import type {
  AnalyzedResolution,
  Committee,
  CountryPosition,
  CountryProfile,
  CountryVote,
  PolicyDimensions,
  PositionFactor,
  VoteResult,
  Bloc,
} from "@/types";
import { getCommitteeConfig, isP5, isSCMember } from "./committees";

const WEIGHTS = {
  idealPoint: 0.25,
  policyDimension: 0.30,
  topicHistory: 0.20,
  blocPressure: 0.15,
  bilateralRelations: 0.10,
} as const;

function dotProduct(a: PolicyDimensions, b: PolicyDimensions): number {
  const keys: (keyof PolicyDimensions)[] = [
    "sovereignty", "humanRights", "development", "security", "environment", "decolonization",
  ];
  let sum = 0;
  let weightSum = 0;
  for (const k of keys) {
    const bVal = b[k] || 0;
    // Weight by resolution's emphasis on each dimension
    const weight = Math.abs(bVal);
    sum += (a[k] || 0) * bVal * weight;
    weightSum += weight;
  }
  // Normalize to [-1, 1] range
  return weightSum > 0 ? Math.max(-1, Math.min(1, sum / weightSum)) : 0;
}

function softmax3(scores: [number, number, number]): [number, number, number] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max)) as [number, number, number];
  const sum = exps[0] + exps[1] + exps[2];
  return [exps[0] / sum, exps[1] / sum, exps[2] / sum];
}

function computeIdealPointAlignment(
  countryIdealPoint: number,
  resolutionVector: PolicyDimensions,
): number {
  // Resolution position: average of all dimensions gives a rough left-right placement
  const vals = Object.values(resolutionVector);
  const resolutionPosition = vals.reduce((a, b) => a + b, 0) / vals.length;

  // Distance-based score: closer = more supportive, farther = more opposed
  // Output range: -1 (maximally opposed) to +1 (perfectly aligned)
  const distance = Math.abs(countryIdealPoint - resolutionPosition);
  // Max possible distance is 2 (from -1 to +1)
  return 1 - distance * 1.5;
}

function computeDimensionScore(
  country: PolicyDimensions,
  resolution: PolicyDimensions,
): number {
  return dotProduct(country, resolution);
}

function computeTopicScore(
  country: CountryProfile,
  resolution: AnalyzedResolution,
): number {
  let score = 0;
  let totalWeight = 0;

  for (const [topic, weight] of Object.entries(resolution.issueWeights)) {
    const history = country.votingHistory.byTopic[topic];
    if (!history || history.sampleSize < 3) continue;
    const topicScore = history.yesRate - history.noRate;
    score += topicScore * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? score / totalWeight : 0;
}

function computeBlocScore(
  country: CountryProfile,
  blocs: Bloc[],
  peerPositions: Map<string, CountryPosition>,
): number {
  let blocInfluence = 0;
  let totalCohesion = 0;

  for (const blocId of country.blocs) {
    const bloc = blocs.find((b) => b.id === blocId);
    if (!bloc) continue;

    let blocVoteSum = 0;
    let peerCount = 0;

    for (const memberId of bloc.members) {
      if (memberId === country.iso3) continue;
      const peer = peerPositions.get(memberId);
      if (!peer) continue;
      blocVoteSum += peer.probability.yes - peer.probability.no;
      peerCount++;
    }

    if (peerCount > 0) {
      blocInfluence += (blocVoteSum / peerCount) * bloc.cohesionScore;
      totalCohesion += bloc.cohesionScore;
    }
  }

  return totalCohesion > 0 ? blocInfluence / totalCohesion : 0;
}

export function computeCountryPosition(
  country: CountryProfile,
  resolution: AnalyzedResolution,
  blocs: Bloc[],
  peerPositions: Map<string, CountryPosition>,
): CountryPosition {
  const factors: PositionFactor[] = [];

  const idealScore = computeIdealPointAlignment(country.idealPoint, resolution.policyVector);
  factors.push({
    name: "Ideal Point Alignment",
    weight: WEIGHTS.idealPoint,
    score: idealScore,
    description: `Country ideology alignment with resolution position`,
  });

  const dimScore = computeDimensionScore(country.policyDimensions, resolution.policyVector);
  factors.push({
    name: "Policy Dimensions",
    weight: WEIGHTS.policyDimension,
    score: dimScore,
    description: `Alignment across sovereignty, human rights, development, security, environment, decolonization`,
  });

  const topicScore = computeTopicScore(country, resolution);
  factors.push({
    name: "Topic Voting History",
    weight: WEIGHTS.topicHistory,
    score: topicScore,
    description: `Historical voting pattern on resolution topics`,
  });

  const blocScore = computeBlocScore(country, blocs, peerPositions);
  factors.push({
    name: "Bloc Coordination",
    weight: WEIGHTS.blocPressure,
    score: blocScore,
    description: `Voting pressure from bloc partners`,
  });

  const composite =
    WEIGHTS.idealPoint * idealScore +
    WEIGHTS.policyDimension * dimScore +
    WEIGHTS.topicHistory * topicScore +
    WEIGHTS.blocPressure * blocScore;

  // Abstain calibration: countries abstain when their composite signal is weak
  // OR when they face cross-pressures (e.g., allies on both sides).
  const compositeStrength = Math.abs(composite);
  const crossPressure = (1 - compositeStrength) * 0.6;
  const regimeCaution = (1 - country.democracyIndex) * 0.2;
  const abstainBias = crossPressure + regimeCaution;
  const rawScores: [number, number, number] = [
    composite * 3.2,
    -composite * 3.2,
    abstainBias - 0.5,
  ];

  const [pYes, pNo, pAbstain] = softmax3(rawScores);

  let vote: "Yes" | "No" | "Abstain";
  if (pYes >= pNo && pYes >= pAbstain) vote = "Yes";
  else if (pNo >= pYes && pNo >= pAbstain) vote = "No";
  else vote = "Abstain";

  return {
    iso3: country.iso3,
    probability: { yes: pYes, no: pNo, abstain: pAbstain },
    predictedVote: vote,
    confidence: Math.max(pYes, pNo, pAbstain),
    factors,
    shiftHistory: [],
  };
}

export function simulateVotes(
  profiles: CountryProfile[],
  resolution: AnalyzedResolution,
  committee: Committee,
  blocs: Bloc[],
): VoteResult {
  const config = getCommitteeConfig(committee);

  const members = committee === "SECURITY_COUNCIL"
    ? profiles.filter((p) => isSCMember(p.iso3))
    : profiles;

  // First pass — no bloc effects
  const firstPass = new Map<string, CountryPosition>();
  for (const country of members) {
    const pos = computeCountryPosition(country, resolution, blocs, new Map());
    firstPass.set(country.iso3, pos);
  }

  // Second pass — with bloc effects from first pass
  const positions = new Map<string, CountryPosition>();
  for (const country of members) {
    const pos = computeCountryPosition(country, resolution, blocs, firstPass);
    positions.set(country.iso3, pos);
  }

  const countryVotes: CountryVote[] = [];
  const totals = { yes: 0, no: 0, abstain: 0 };

  for (const country of members) {
    const pos = positions.get(country.iso3)!;
    countryVotes.push({
      iso3: country.iso3,
      name: country.name,
      vote: pos.predictedVote,
      probability: pos.probability,
      confidence: pos.confidence,
      factors: pos.factors,
    });

    if (pos.predictedVote === "Yes") totals.yes++;
    else if (pos.predictedVote === "No") totals.no++;
    else totals.abstain++;
  }

  let passed: boolean;
  let vetoedBy: string[] | undefined;

  if (config.hasVeto) {
    vetoedBy = countryVotes
      .filter((v) => isP5(v.iso3) && v.vote === "No")
      .map((v) => v.iso3);

    if (vetoedBy.length > 0) {
      passed = false;
    } else {
      const voting = totals.yes + totals.no;
      passed = voting > 0 && totals.yes / voting >= config.threshold;
    }
  } else {
    const voting = totals.yes + totals.no;
    passed = voting > 0 && totals.yes / voting >= config.threshold;
  }

  return {
    committee,
    totals,
    passed,
    vetoedBy: vetoedBy && vetoedBy.length > 0 ? vetoedBy : undefined,
    countryVotes,
    timestamp: Date.now(),
  };
}
