import { NextRequest, NextResponse } from "next/server";
import type { Committee, PolicyDimensions, AnalyzedResolution } from "@/types";
import { COMMITTEES } from "@/engines/committees";
import { readFileSync } from "fs";
import path from "path";

interface PresetResolution {
  title: string;
  committee: Committee;
  preamble: { id: string; text: string }[];
  operativeClauses: { id: string; text: string; strength: number; topics: string[] }[];
  policyVector: PolicyDimensions;
  issueWeights: Record<string, number>;
}

let presetsCache: Record<string, PresetResolution> | null = null;

function loadPresets(): Record<string, PresetResolution> {
  if (presetsCache) return presetsCache;
  const raw = readFileSync(path.join(process.cwd(), "data", "preset-resolutions.json"), "utf-8");
  presetsCache = JSON.parse(raw);
  return presetsCache!;
}

function computePolicyVector(clauses: { strength: number; topics: string[] }[]): PolicyDimensions {
  const topicToDimension: Record<string, keyof PolicyDimensions> = {
    sovereignty: "sovereignty", "international-law": "sovereignty",
    climate: "environment", environment: "environment", water: "environment",
    "human-rights": "humanRights", refugees: "humanRights", "gender-equality": "humanRights",
    development: "development", trade: "development", "food-security": "development",
    education: "development", technology: "development",
    security: "security", terrorism: "security", peacekeeping: "security",
    nuclear: "security", disarmament: "security",
    decolonization: "decolonization",
    health: "humanRights",
  };

  const dims: PolicyDimensions = { sovereignty: 0, humanRights: 0, development: 0, security: 0, environment: 0, decolonization: 0 };
  const counts: Record<string, number> = {};

  for (const clause of clauses) {
    for (const topic of clause.topics) {
      const dim = topicToDimension[topic];
      if (dim) {
        dims[dim] += clause.strength;
        counts[dim] = (counts[dim] || 0) + 1;
      }
    }
  }

  for (const key of Object.keys(dims) as (keyof PolicyDimensions)[]) {
    if (counts[key]) dims[key] = Math.min(1, dims[key] / counts[key]);
  }

  return dims;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { policy, preset, committee } = body;

    // Preset path — no AI required, instant response
    if (preset) {
      const presets = loadPresets();
      const presetData = presets[preset];
      if (!presetData) {
        return NextResponse.json({ error: `Unknown preset: ${preset}` }, { status: 400 });
      }

      const analyzedResolution: AnalyzedResolution = {
        id: `sim-${preset}-${Date.now()}`,
        title: presetData.title,
        committee: presetData.committee,
        preamble: presetData.preamble,
        operativeClauses: presetData.operativeClauses.map((c) => ({
          ...c,
          policyDimensions: {},
        })),
        sponsors: [],
        policyVector: presetData.policyVector,
        issueWeights: presetData.issueWeights,
        contentionPoints: [],
        historicalPrecedents: [],
      };

      return NextResponse.json({
        resolution: {
          title: presetData.title,
          preamble: presetData.preamble,
          clauses: presetData.operativeClauses.map((c) => ({
            id: c.id,
            text: c.text,
            strength: c.strength,
            topics: c.topics,
          })),
        },
        analyzedResolution,
      });
    }

    // Custom policy path — requires AI provider
    if (!policy) {
      return NextResponse.json({ error: "No policy idea or preset provided" }, { status: 400 });
    }

    const targetCommittee = (committee || "GA_PLENARY") as Committee;

    // Try AI generation, fall back to heuristic if no API key
    try {
      const { getProvider } = await import("@/lib/ai/provider");
      const { RESOLUTION_SYSTEM_PROMPT, RESOLUTION_USER_PROMPT } = await import("@/lib/ai/prompts/resolution-draft");

      const committeeName = COMMITTEES[targetCommittee]?.name || "General Assembly";
      const provider = getProvider();

      const result = await provider.generateStructured<{
        title: string;
        preamble: { id: string; text: string }[];
        operativeClauses: { id: string; text: string; strength: number; topics: string[] }[];
      }>(
        [
          { role: "system", content: RESOLUTION_SYSTEM_PROMPT },
          { role: "user", content: RESOLUTION_USER_PROMPT(policy, committeeName) },
        ],
        {},
        { temperature: 0.6 },
      );

      const policyVector = computePolicyVector(result.operativeClauses);
      const issueWeights: Record<string, number> = {};
      for (const clause of result.operativeClauses) {
        for (const topic of clause.topics) {
          issueWeights[topic] = (issueWeights[topic] || 0) + clause.strength;
        }
      }
      const maxWeight = Math.max(...Object.values(issueWeights), 1);
      for (const key of Object.keys(issueWeights)) issueWeights[key] /= maxWeight;

      const analyzedResolution: AnalyzedResolution = {
        id: `sim-${Date.now()}`,
        title: result.title,
        committee: targetCommittee,
        preamble: result.preamble,
        operativeClauses: result.operativeClauses.map((c) => ({ ...c, policyDimensions: {} })),
        sponsors: [],
        policyVector,
        issueWeights,
        contentionPoints: [],
        historicalPrecedents: [],
      };

      return NextResponse.json({
        resolution: {
          title: result.title,
          preamble: result.preamble,
          clauses: result.operativeClauses.map((c) => ({ id: c.id, text: c.text, strength: c.strength, topics: c.topics })),
        },
        analyzedResolution,
      });
    } catch (aiError) {
      return NextResponse.json(
        { error: "AI provider not configured. Set ANTHROPIC_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable to use custom policy input." },
        { status: 503 },
      );
    }
  } catch (e) {
    console.error("Resolution analysis failed:", e);
    return NextResponse.json(
      { error: "Failed to analyze resolution. Please try again." },
      { status: 500 },
    );
  }
}
