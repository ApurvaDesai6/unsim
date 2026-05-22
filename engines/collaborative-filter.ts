/**
 * Collaborative Filtering for Vote Prediction
 *
 * Uses the empirical vote-similarity matrix to predict how a country will vote
 * based on how its most-similar peers voted. This is the "bilateral relations"
 * component of the engine — grounded in actual co-voting patterns rather than
 * assumed alliances.
 *
 * Technique: Weighted K-Nearest-Neighbors on the vote-similarity graph.
 * For a target country, find its K most similar countries (by cosine similarity
 * on historical vote vectors), check their predicted or actual votes on this
 * resolution, and weight-average the signal.
 *
 * This approach captures:
 * - Bilateral alliances (Belgium-Luxembourg always vote together)
 * - Regional coordination beyond formal blocs
 * - Implicit rivalries (if US votes Yes, North Korea likely votes No)
 * - Drift over time (captured by recency-weighted similarity)
 */

import type { CountryPosition } from "@/types";

interface SimilarCountry {
  country: string;
  similarity: number;
  shared: number;
}

interface SimilarityData {
  mostSimilar: SimilarCountry[];
  mostDissimilar: SimilarCountry[];
}

const K_NEIGHBORS = 10;

/**
 * Compute collaborative filtering score for a country.
 *
 * Given the similarity data and peer positions, returns a score in [-1, 1]:
 * - Positive = peers are voting Yes
 * - Negative = peers are voting No
 * - Near zero = peers are split or insufficient data
 */
export function computeCollaborativeScore(
  countryName: string,
  similarities: Map<string, SimilarityData>,
  peerPositions: Map<string, CountryPosition>,
): number {
  const countryData = similarities.get(countryName);
  if (!countryData || countryData.mostSimilar.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  // Use K most similar countries with known positions
  for (const similar of countryData.mostSimilar.slice(0, K_NEIGHBORS)) {
    const peer = peerPositions.get(similar.country);
    if (!peer) continue;

    // Convert peer's probability to a [-1, 1] score
    const peerSignal = peer.probability.yes - peer.probability.no;

    // Weight by similarity magnitude (stronger similarity = more influence)
    const weight = Math.abs(similar.similarity);
    weightedSum += peerSignal * similar.similarity * weight;
    weightTotal += weight;
  }

  // Also check rivals — their opposition is our support
  for (const rival of countryData.mostDissimilar.slice(0, 5)) {
    const peer = peerPositions.get(rival.country);
    if (!peer) continue;

    const peerSignal = peer.probability.yes - peer.probability.no;
    const weight = Math.abs(rival.similarity) * 0.5; // Rivals get less weight
    // Negative similarity means we invert their signal
    weightedSum += peerSignal * rival.similarity * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) return 0;
  return Math.max(-1, Math.min(1, weightedSum / weightTotal));
}

/**
 * Compute "voting bloc coherence" for a resolution.
 *
 * Given all country positions, measure how coherent each voting bloc is.
 * High coherence = the bloc is unified → individual members should follow.
 * Low coherence = the bloc is split → individual judgment dominates.
 */
export function computeBlocCoherence(
  blocMembers: string[],
  positions: Map<string, CountryPosition>,
): { coherence: number; direction: number } {
  let yesCount = 0;
  let noCount = 0;
  let abstainCount = 0;
  let total = 0;

  for (const member of blocMembers) {
    const pos = positions.get(member);
    if (!pos) continue;
    if (pos.predictedVote === "Yes") yesCount++;
    else if (pos.predictedVote === "No") noCount++;
    else abstainCount++;
    total++;
  }

  if (total === 0) return { coherence: 0, direction: 0 };

  // Coherence = how unified the bloc is (1 = unanimous, 0 = evenly split)
  const maxVote = Math.max(yesCount, noCount, abstainCount);
  const coherence = maxVote / total;

  // Direction = which way the bloc leans (-1 = No, +1 = Yes)
  const direction = (yesCount - noCount) / total;

  return { coherence, direction };
}
