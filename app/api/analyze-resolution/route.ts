import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/ai/provider";
import {
  RESOLUTION_SYSTEM_PROMPT,
  RESOLUTION_USER_PROMPT,
} from "@/lib/ai/prompts/resolution-draft";
import type { Committee, PolicyDimensions, AnalyzedResolution } from "@/types";
import { COMMITTEES } from "@/engines/committees";

const PRESETS: Record<string, { policy: string; committee: Committee }> = {
  "climate-treaty": {
    policy: "A binding global climate accountability treaty with financial penalties for nations exceeding emissions targets, funded climate adaptation transfers to vulnerable nations, and an independent monitoring body with enforcement powers",
    committee: "GA_PLENARY",
  },
  "ai-governance": {
    policy: "Establishing an International AI Governance Agency under the UN system with authority to audit frontier AI systems, set safety standards, and impose moratoriums on dangerous capabilities research",
    committee: "GA_PLENARY",
  },
  "nuclear-ban": {
    policy: "Complete elimination of all nuclear weapons within 15 years with a verification regime, fissile material controls, and security guarantees for disarming states",
    committee: "FIRST_COMMITTEE",
  },
  "sc-reform": {
    policy: "Expanding the Security Council to 21 members with 6 new permanent seats (2 Africa, 2 Asia-Pacific, 1 Latin America, 1 WEOG) with a modified veto requiring 2 concurrent vetoes to block a resolution",
    committee: "GA_PLENARY",
  },
  "cyber-norms": {
    policy: "Legally binding norms prohibiting state-sponsored cyberattacks on civilian critical infrastructure including hospitals, power grids, water systems, and financial networks, with attribution mechanisms and proportional response frameworks",
    committee: "SECURITY_COUNCIL",
  },
  "water-rights": {
    policy: "Declaring access to clean water and sanitation a binding human right with enforcement mechanisms, mandatory reporting, and a global fund to achieve universal access by 2035",
    committee: "THIRD_COMMITTEE",
  },
};

function computePolicyVector(
  clauses: { strength: number; topics: string[] }[],
): PolicyDimensions {
  const topicToDimension: Record<string, keyof PolicyDimensions> = {
    sovereignty: "sovereignty",
    "international-law": "sovereignty",
    climate: "environment",
    environment: "environment",
    water: "environment",
    "human-rights": "humanRights",
    refugees: "humanRights",
    "gender-equality": "humanRights",
    development: "development",
    trade: "development",
    "food-security": "development",
    education: "development",
    security: "security",
    terrorism: "security",
    peacekeeping: "security",
    nuclear: "security",
    disarmament: "security",
    decolonization: "decolonization",
    technology: "development",
    health: "humanRights",
  };

  const dims: PolicyDimensions = {
    sovereignty: 0,
    humanRights: 0,
    development: 0,
    security: 0,
    environment: 0,
    decolonization: 0,
  };

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
    if (counts[key]) {
      dims[key] = Math.min(1, dims[key] / counts[key]);
    }
  }

  return dims;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { policy, preset, committee } = body;

    let policyIdea = policy;
    let targetCommittee = committee as Committee;

    if (preset && PRESETS[preset]) {
      policyIdea = PRESETS[preset].policy;
      targetCommittee = PRESETS[preset].committee;
    }

    if (!policyIdea) {
      return NextResponse.json({ error: "No policy idea provided" }, { status: 400 });
    }

    const committeeName = COMMITTEES[targetCommittee]?.name || "General Assembly";
    const provider = getProvider();

    const result = await provider.generateStructured<{
      title: string;
      preamble: { id: string; text: string }[];
      operativeClauses: { id: string; text: string; strength: number; topics: string[] }[];
    }>(
      [
        { role: "system", content: RESOLUTION_SYSTEM_PROMPT },
        { role: "user", content: RESOLUTION_USER_PROMPT(policyIdea, committeeName) },
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
    for (const key of Object.keys(issueWeights)) {
      issueWeights[key] /= maxWeight;
    }

    const analyzedResolution: AnalyzedResolution = {
      id: `sim-${Date.now()}`,
      title: result.title,
      committee: targetCommittee,
      preamble: result.preamble,
      operativeClauses: result.operativeClauses.map((c) => ({
        ...c,
        policyDimensions: {},
      })),
      sponsors: [],
      policyVector,
      issueWeights,
      contentionPoints: [],
      historicalPrecedents: [],
    };

    return NextResponse.json({
      resolution: {
        title: result.title,
        clauses: result.operativeClauses.map((c) => c.text),
      },
      analyzedResolution,
    });
  } catch (e) {
    console.error("Resolution analysis failed:", e);
    return NextResponse.json(
      { error: "Failed to analyze resolution" },
      { status: 500 },
    );
  }
}
