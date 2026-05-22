/**
 * GraphRAG Retrieval Layer
 *
 * Implements Microsoft's GraphRAG pattern adapted for UN voting prediction:
 * 1. Entity extraction from resolution text → maps to ontology nodes
 * 2. Local retrieval — direct neighbors and positions from KG
 * 3. Global retrieval — community-level summaries for broader context
 * 4. Context assembly — structured context window for LLM reasoning
 *
 * This module builds the retrieval context that gets passed to the LLM
 * when a user has an API key configured. Without API key, the same
 * retrieval feeds the statistical model as features.
 *
 * References:
 * - Microsoft GraphRAG: https://microsoft.github.io/graphrag/
 * - "From Local to Global: A Graph RAG Approach to Query-Focused Summarization"
 */

import { getGraph, getAlliances, getRivalries, getIssuePositions, getBlocMemberships } from "./index";
import type { CountryProfile } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────

export interface RetrievalContext {
  country: CountryContext;
  resolution: ResolutionContext;
  historicalPrecedents: PrecedentContext[];
  communityContext: CommunityContext;
  retrievalMethod: string;
}

export interface CountryContext {
  iso3: string;
  name: string;
  region: string;
  idealPoint: number;
  governmentType: string;
  blocs: string[];
  topAllies: { name: string; similarity: number }[];
  topRivals: { name: string; intensity: number }[];
  issuePositions: { issue: string; stance: number; yesRate: number; noRate: number; sampleSize: number }[];
  recentVotingPattern: string;
}

export interface ResolutionContext {
  title: string;
  matchedIssue: string;
  policyDimensions: Record<string, number>;
  contentionLevel: "low" | "medium" | "high";
  keyTopics: string[];
}

export interface PrecedentContext {
  issue: string;
  typicalOutcome: string;
  globalSplit: { yesPercent: number; noPercent: number; abstainPercent: number };
  westernPosition: string;
  g77Position: string;
}

export interface CommunityContext {
  blocCoherence: { blocName: string; expectedVote: string; confidence: number }[];
  keyDynamics: string[];
}

// ─── Retrieval Functions ──────────────────────────────────────────────

export function buildRetrievalContext(
  iso3: string,
  resolutionTitle: string,
  matchedIssue: string,
  policyVector: Record<string, number>,
  profiles: CountryProfile[],
  topicHistory: Record<string, Record<string, { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }>>,
): RetrievalContext {
  const g = getGraph();
  const profile = profiles.find((p) => p.iso3 === iso3);
  if (!profile) {
    return emptyContext(iso3, resolutionTitle, matchedIssue, policyVector);
  }

  // ─── Local retrieval: direct entity context ─────────────────────────
  const allies = getAlliances(iso3).slice(0, 5);
  const rivals = getRivalries(iso3).slice(0, 3);
  const positions = getIssuePositions(iso3);
  const blocs = getBlocMemberships(iso3);

  const matchedPosition = positions.find((p) =>
    p.issueName.toLowerCase().includes(matchedIssue.toLowerCase().split(" ")[0]) ||
    matchedIssue.toLowerCase().includes(p.issue),
  );

  let recentPattern = "unknown";
  if (matchedPosition) {
    if (matchedPosition.yesRate > 0.8) recentPattern = "consistently votes Yes";
    else if (matchedPosition.noRate > 0.5) recentPattern = "consistently votes No";
    else if (matchedPosition.abstainRate > 0.3) recentPattern = "frequently abstains";
    else recentPattern = "mixed voting pattern";
  }

  // ─── Global retrieval: community/bloc-level context ─────────────────
  const blocCoherence = blocs.map((b) => {
    // Check how the bloc typically votes on this issue
    const blocMembers = profiles.filter((p) => p.blocs.includes(b.id) || p.blocs.includes(b.name));
    let yesCount = 0, noCount = 0, abstainCount = 0;
    for (const member of blocMembers) {
      const memberPos = topicHistory[member.name]?.[matchedIssue];
      if (!memberPos) continue;
      if (memberPos.yesRate > memberPos.noRate && memberPos.yesRate > memberPos.abstainRate) yesCount++;
      else if (memberPos.noRate > memberPos.yesRate) noCount++;
      else abstainCount++;
    }
    const total = yesCount + noCount + abstainCount;
    const dominantVote = yesCount >= noCount && yesCount >= abstainCount ? "Yes" : noCount > yesCount ? "No" : "Abstain";
    const confidence = total > 0 ? Math.max(yesCount, noCount, abstainCount) / total : 0;
    return { blocName: b.name, expectedVote: dominantVote, confidence };
  });

  // Key dynamics — what makes this resolution politically interesting
  const keyDynamics: string[] = [];
  const envScore = Math.abs(policyVector.environment || 0);
  const sovScore = Math.abs(policyVector.sovereignty || 0);
  const secScore = Math.abs(policyVector.security || 0);

  if (sovScore > 0.5) keyDynamics.push("Sovereignty concerns create North-South divide");
  if (envScore > 0.7) keyDynamics.push("Climate provisions face fossil-fuel state opposition");
  if (secScore > 0.5) keyDynamics.push("Security dimensions trigger P5 veto considerations");
  if (matchedIssue === "Palestinian conflict") keyDynamics.push("Palestine resolutions produce strongest US-Global South divide");
  if (matchedIssue === "Human rights") keyDynamics.push("Human rights resolutions face sovereignty-based opposition from authoritarian states");

  // Contention level
  let contentionLevel: "low" | "medium" | "high" = "low";
  if (matchedIssue === "Palestinian conflict" || matchedIssue === "Human rights") contentionLevel = "high";
  else if (matchedIssue === "Nuclear weapons and nuclear material") contentionLevel = "high";
  else if (sovScore > 0.4) contentionLevel = "medium";

  // ─── Historical precedents ──────────────────────────────────────────
  const historicalPrecedents: PrecedentContext[] = [];

  // Aggregate voting pattern for this issue across all countries
  let globalYes = 0, globalNo = 0, globalAbstain = 0, globalTotal = 0;
  let westernYes = 0, westernNo = 0, westernTotal = 0;
  let g77Yes = 0, g77No = 0, g77Total = 0;

  for (const [countryName, topics] of Object.entries(topicHistory)) {
    const rates = topics[matchedIssue];
    if (!rates) continue;
    const countryProfile = profiles.find((p) => p.name === countryName);
    if (!countryProfile) continue;

    globalYes += rates.yesRate;
    globalNo += rates.noRate;
    globalAbstain += rates.abstainRate;
    globalTotal++;

    if (countryProfile.region === "WEOG") {
      westernYes += rates.yesRate;
      westernNo += rates.noRate;
      westernTotal++;
    }
    if (countryProfile.blocs.includes("G77")) {
      g77Yes += rates.yesRate;
      g77No += rates.noRate;
      g77Total++;
    }
  }

  if (globalTotal > 0) {
    historicalPrecedents.push({
      issue: matchedIssue,
      typicalOutcome: globalYes / globalTotal > 0.6 ? "Typically passes with large majority" : "Contested — outcome varies",
      globalSplit: {
        yesPercent: (globalYes / globalTotal) * 100,
        noPercent: (globalNo / globalTotal) * 100,
        abstainPercent: (globalAbstain / globalTotal) * 100,
      },
      westernPosition: westernTotal > 0 ? (westernYes / westernTotal > 0.5 ? "Majority support" : westernNo / westernTotal > 0.5 ? "Majority oppose" : "Split/abstain") : "Unknown",
      g77Position: g77Total > 0 ? (g77Yes / g77Total > 0.7 ? "Strong support" : "Mixed") : "Unknown",
    });
  }

  return {
    country: {
      iso3,
      name: profile.name,
      region: profile.region,
      idealPoint: profile.idealPoint,
      governmentType: profile.governmentType,
      blocs: blocs.map((b) => b.name),
      topAllies: allies.map((a) => ({ name: a.name, similarity: a.strength })),
      topRivals: rivals.map((r) => ({ name: r.name, intensity: r.intensity })),
      issuePositions: positions.map((p) => ({ issue: p.issueName, stance: p.stance, yesRate: p.yesRate, noRate: p.noRate, sampleSize: p.sampleSize })),
      recentVotingPattern: recentPattern,
    },
    resolution: {
      title: resolutionTitle,
      matchedIssue,
      policyDimensions: policyVector,
      contentionLevel,
      keyTopics: Object.entries(policyVector).filter(([, v]) => Math.abs(v) > 0.3).map(([k]) => k),
    },
    historicalPrecedents,
    communityContext: { blocCoherence, keyDynamics },
    retrievalMethod: "graphrag-local+global",
  };
}

/**
 * Format retrieval context as a prompt for LLM-based prediction.
 * This is what gets sent to Claude/Gemini when the user has an API key.
 */
export function formatContextForLLM(ctx: RetrievalContext): string {
  const lines: string[] = [];

  lines.push(`## Country: ${ctx.country.name} (${ctx.country.iso3})`);
  lines.push(`Region: ${ctx.country.region} | Government: ${ctx.country.governmentType} | Ideal Point: ${ctx.country.idealPoint.toFixed(3)}`);
  lines.push(`Bloc Memberships: ${ctx.country.blocs.join(", ") || "None"}`);
  lines.push("");

  lines.push(`## Resolution: ${ctx.resolution.title}`);
  lines.push(`Matched Issue Area: ${ctx.resolution.matchedIssue}`);
  lines.push(`Contention Level: ${ctx.resolution.contentionLevel}`);
  lines.push(`Key Policy Dimensions: ${ctx.resolution.keyTopics.join(", ")}`);
  lines.push("");

  lines.push(`## Historical Voting Pattern`);
  lines.push(`${ctx.country.name} on ${ctx.resolution.matchedIssue}: ${ctx.country.recentVotingPattern}`);
  for (const pos of ctx.country.issuePositions.slice(0, 3)) {
    lines.push(`  - ${pos.issue}: Yes ${(pos.yesRate * 100).toFixed(0)}% / No ${(pos.noRate * 100).toFixed(0)}% (n=${pos.sampleSize})`);
  }
  lines.push("");

  lines.push(`## Alliance Network`);
  lines.push(`Top voting partners: ${ctx.country.topAllies.map((a) => `${a.name} (${(a.similarity * 100).toFixed(0)}%)`).join(", ")}`);
  if (ctx.country.topRivals.length > 0) {
    lines.push(`Voting rivals: ${ctx.country.topRivals.map((r) => `${r.name} (${(r.intensity * 100).toFixed(0)}%)`).join(", ")}`);
  }
  lines.push("");

  lines.push(`## Bloc Dynamics`);
  for (const bc of ctx.communityContext.blocCoherence) {
    lines.push(`  - ${bc.blocName}: expected ${bc.expectedVote} (confidence ${(bc.confidence * 100).toFixed(0)}%)`);
  }
  lines.push("");

  if (ctx.historicalPrecedents.length > 0) {
    lines.push(`## Historical Precedent`);
    const p = ctx.historicalPrecedents[0];
    lines.push(`On ${p.issue} resolutions: ${p.typicalOutcome}`);
    lines.push(`Global split: Yes ${p.globalSplit.yesPercent.toFixed(0)}% / No ${p.globalSplit.noPercent.toFixed(0)}% / Abstain ${p.globalSplit.abstainPercent.toFixed(0)}%`);
    lines.push(`Western position: ${p.westernPosition} | G77 position: ${p.g77Position}`);
    lines.push("");
  }

  if (ctx.communityContext.keyDynamics.length > 0) {
    lines.push(`## Key Political Dynamics`);
    for (const d of ctx.communityContext.keyDynamics) lines.push(`  - ${d}`);
  }

  return lines.join("\n");
}

function emptyContext(iso3: string, title: string, issue: string, policyVector: Record<string, number>): RetrievalContext {
  return {
    country: { iso3, name: iso3, region: "unknown", idealPoint: 0, governmentType: "unknown", blocs: [], topAllies: [], topRivals: [], issuePositions: [], recentVotingPattern: "unknown" },
    resolution: { title, matchedIssue: issue, policyDimensions: policyVector, contentionLevel: "medium", keyTopics: [] },
    historicalPrecedents: [],
    communityContext: { blocCoherence: [], keyDynamics: [] },
    retrievalMethod: "empty-fallback",
  };
}
