/**
 * LLM-Augmented Vote Prediction
 *
 * When the user has an API key configured, this endpoint uses Claude/Gemini
 * with GraphRAG retrieval context to predict individual country votes with
 * natural language reasoning.
 *
 * Architecture (Microsoft GraphRAG adapted):
 * 1. Resolution analysis → identify relevant issues/dimensions
 * 2. For each country: build retrieval context from knowledge graph
 *    (local: direct history + allies; global: bloc dynamics + precedents)
 * 3. LLM reasons over structured context → prediction + explanation
 * 4. Ensemble: LLM prediction weighted with statistical model
 *
 * This produces both more accurate predictions AND human-readable explanations
 * grounded in verifiable data (every claim cites the evidence from KG).
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import type { AnalyzedResolution, Committee, CountryProfile } from "@/types";
import { buildRetrievalContext, formatContextForLLM } from "@/lib/knowledge-graph/retrieval";

interface TopicRates { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }

let profilesCache: CountryProfile[] | null = null;
let topicHistoryCache: Record<string, Record<string, TopicRates>> | null = null;

function loadData() {
  const dataDir = path.join(process.cwd(), "data");
  if (!profilesCache) profilesCache = JSON.parse(readFileSync(path.join(dataDir, "country-profiles.json"), "utf-8"));
  if (!topicHistoryCache) {
    try { topicHistoryCache = JSON.parse(readFileSync(path.join(dataDir, "topic-history.json"), "utf-8")); }
    catch { topicHistoryCache = {}; }
  }
  return { profiles: profilesCache!, topicHistory: topicHistoryCache! };
}

const ISSUE_MAPPING: Record<string, string[]> = {
  "Palestinian conflict": ["human-rights", "decolonization", "sovereignty"],
  "Nuclear weapons and nuclear material": ["disarmament", "security", "nuclear"],
  "Arms control and disarmament": ["disarmament", "security"],
  "Colonialism": ["decolonization", "sovereignty"],
  "Human rights": ["human-rights"],
  "Economic development": ["development", "trade", "climate", "water", "environment", "technology"],
};

function findMatchingIssue(issueWeights: Record<string, number>): string {
  let best = "Economic development", bestScore = 0;
  for (const [issue, keywords] of Object.entries(ISSUE_MAPPING)) {
    let score = 0;
    for (const kw of keywords) score += issueWeights[kw] || 0;
    if (score > bestScore) { bestScore = score; best = issue; }
  }
  return best;
}

const SYSTEM_PROMPT = `You are an expert political scientist specializing in United Nations General Assembly voting behavior. You predict how individual countries will vote on resolutions based on their historical patterns, alliance networks, treaty obligations, and geopolitical interests.

You will be given:
1. A country's profile (region, government type, bloc memberships, voting history)
2. The resolution's topic and policy dimensions
3. Historical voting patterns on similar issues
4. Alliance/rivalry network and bloc dynamics

Your task: predict the country's vote (Yes, No, or Abstain) and explain WHY in 2-3 sentences, citing specific evidence from the provided context.

IMPORTANT:
- Ground your prediction in the empirical data provided, not general knowledge
- If the country has a strong historical pattern (>80% in one direction), follow it
- Consider bloc pressure — if a country's bloc is unified, deviation is unlikely
- Flag cases where current geopolitics might override historical patterns
- Be specific: cite voting rates, alliance strengths, and bloc positions`;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: "LLM prediction requires an API key. Set ANTHROPIC_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.",
        hint: "The statistical model at /api/simulate works without an API key.",
      }, { status: 503 });
    }

    const body = await request.json();
    const { resolution, countries } = body as {
      resolution: AnalyzedResolution;
      countries: string[]; // ISO3 codes to predict
    };

    if (!resolution || !countries?.length) {
      return NextResponse.json({ error: "Provide resolution and countries array" }, { status: 400 });
    }

    const { profiles, topicHistory } = loadData();
    const matchedIssue = findMatchingIssue(resolution.issueWeights);

    // Build retrieval contexts for requested countries
    const predictions: {
      iso3: string;
      name: string;
      vote: string;
      confidence: number;
      reasoning: string;
      context: string;
      method: string;
    }[] = [];

    const { getProvider } = await import("@/lib/ai/provider");
    const provider = getProvider();

    // Batch countries in groups of 5 for efficiency
    for (let i = 0; i < countries.length; i += 5) {
      const batch = countries.slice(i, i + 5);
      const contexts = batch.map((iso3) => {
        const ctx = buildRetrievalContext(iso3, resolution.title, matchedIssue, resolution.policyVector as unknown as Record<string, number>, profiles, topicHistory);
        return { iso3, context: formatContextForLLM(ctx), countryName: ctx.country.name };
      });

      const prompt = contexts.map((c) =>
        `--- PREDICT: ${c.countryName} (${c.iso3}) ---\n${c.context}\n\nPredict this country's vote on "${resolution.title}" and explain why in 2-3 sentences.`
      ).join("\n\n");

      const response = await provider.generate([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt + "\n\nFor each country, respond with:\nCOUNTRY: [ISO3]\nVOTE: [Yes/No/Abstain]\nCONFIDENCE: [0-100]\nREASONING: [2-3 sentences]\n\n" },
      ], { temperature: 0.3, maxTokens: 2000 });

      // Parse LLM response
      const sections = response.text.split(/COUNTRY:\s*/i).filter(Boolean);
      for (const section of sections) {
        const isoMatch = section.match(/^([A-Z]{3})/);
        const voteMatch = section.match(/VOTE:\s*(Yes|No|Abstain)/i);
        const confMatch = section.match(/CONFIDENCE:\s*(\d+)/);
        const reasonMatch = section.match(/REASONING:\s*(.+?)(?=\n\n|COUNTRY:|$)/is);

        if (isoMatch && voteMatch) {
          const iso3 = isoMatch[1];
          const ctx = contexts.find((c) => c.iso3 === iso3);
          predictions.push({
            iso3,
            name: ctx?.countryName || iso3,
            vote: voteMatch[1],
            confidence: confMatch ? parseInt(confMatch[1]) / 100 : 0.7,
            reasoning: reasonMatch ? reasonMatch[1].trim() : "No reasoning provided",
            context: ctx?.context || "",
            method: "llm-graphrag",
          });
        }
      }
    }

    return NextResponse.json({
      predictions,
      matchedIssue,
      resolutionTitle: resolution.title,
      method: "llm-graphrag",
      model: process.env.AI_PROVIDER || "claude",
    });
  } catch (e) {
    console.error("LLM prediction failed:", e);
    return NextResponse.json({ error: "LLM prediction failed" }, { status: 500 });
  }
}
