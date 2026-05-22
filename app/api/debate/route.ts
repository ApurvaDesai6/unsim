import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

interface DebateSpeech {
  iso3: string;
  countryName: string;
  position: string;
  speech: string;
  keyPoints: string[];
  rhetorical_strategy: string;
}

interface DebateRound {
  round: number;
  speeches: DebateSpeech[];
}

interface PresetDebate {
  rounds: DebateRound[];
}

let debatesCache: Record<string, PresetDebate> | null = null;

function loadDebates(): Record<string, PresetDebate> {
  if (debatesCache) return debatesCache;
  const raw = readFileSync(
    path.join(process.cwd(), "data", "preset-debates.json"),
    "utf-8"
  );
  debatesCache = JSON.parse(raw);
  return debatesCache!;
}

async function generateDebateWithAI(
  resolutionTitle: string,
  resolutionText: string,
  round: number
): Promise<DebateRound> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("NO_API_KEY");
  }

  const { getProvider } = await import("@/lib/ai/provider");
  const provider = getProvider();

  const prompt = `You are a UN General Assembly debate simulator. Generate a round of debate speeches for the following resolution.

Resolution Title: ${resolutionTitle}
Resolution Text: ${resolutionText}
Round: ${round}

Generate exactly 6 speeches from different countries representing diverse positions (Yes, No, Abstain).
Each speech should:
- Use proper UN diplomatic register ("My delegation wishes to express...")
- Be 2-3 paragraphs of realistic diplomatic rhetoric
- Reference real treaties and geopolitical context
- Include strategic arguments reflecting the country's known positions

Return valid JSON matching this structure:
{
  "round": ${round},
  "speeches": [
    {
      "iso3": "USA",
      "countryName": "United States",
      "position": "No",
      "speech": "...",
      "keyPoints": ["point1", "point2", "point3"],
      "rhetorical_strategy": "strategy-name"
    }
  ]
}

Return ONLY the JSON, no markdown fences or explanation.`;

  const response = await provider.generate(
    [
      {
        role: "system",
        content:
          "You generate realistic UN General Assembly debate speeches in JSON format. Your output must be valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0.8, maxTokens: 8000 }
  );

  try {
    const parsed = JSON.parse(response.text) as DebateRound;
    return parsed;
  } catch {
    throw new Error("Failed to parse AI-generated debate response");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { preset, round, resolutionTitle, resolutionText } = body as {
      preset?: string;
      round?: number;
      resolutionTitle?: string;
      resolutionText?: string;
    };

    // Preset debate: return pre-generated content
    if (preset) {
      const debates = loadDebates();
      const debate = debates[preset];

      if (!debate) {
        return NextResponse.json(
          { error: `Unknown preset: ${preset}. Available: ${Object.keys(debates).join(", ")}` },
          { status: 404 }
        );
      }

      // Return specific round or all rounds
      if (round !== undefined) {
        const debateRound = debate.rounds.find((r) => r.round === round);
        if (!debateRound) {
          return NextResponse.json(
            { error: `Round ${round} not found. Available rounds: ${debate.rounds.map((r) => r.round).join(", ")}` },
            { status: 404 }
          );
        }
        return NextResponse.json({ debate: debateRound });
      }

      return NextResponse.json({ debate: debate.rounds });
    }

    // Custom resolution: generate with AI if API key available
    if (resolutionTitle || resolutionText) {
      try {
        const debateRound = await generateDebateWithAI(
          resolutionTitle || "Untitled Resolution",
          resolutionText || "",
          round || 1
        );
        return NextResponse.json({ debate: debateRound });
      } catch (err) {
        if (err instanceof Error && err.message === "NO_API_KEY") {
          return NextResponse.json(
            {
              error: "AI generation unavailable",
              message:
                "Custom resolution debate generation requires an ANTHROPIC_API_KEY environment variable. " +
                "Set ANTHROPIC_API_KEY in your .env.local file to enable AI-generated debates, " +
                "or use one of the preset scenarios (climate-treaty, ai-governance, nuclear-ban, sc-reform, cyber-norms, water-rights) " +
                "which include pre-generated debate content.",
              presets: [
                "climate-treaty",
                "ai-governance",
                "nuclear-ban",
                "sc-reform",
                "cyber-norms",
                "water-rights",
              ],
            },
            { status: 503 }
          );
        }
        throw err;
      }
    }

    return NextResponse.json(
      {
        error: "Invalid request",
        message: "Provide either a 'preset' name or 'resolutionTitle'/'resolutionText' for custom debate generation.",
      },
      { status: 400 }
    );
  } catch (e) {
    console.error("Debate generation failed:", e);
    return NextResponse.json(
      { error: "Debate generation failed", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const preset = searchParams.get("preset");

  if (!preset) {
    const debates = loadDebates();
    return NextResponse.json({
      available: Object.keys(debates),
      message: "Provide ?preset=<name> to retrieve debate speeches, or POST for custom generation.",
    });
  }

  const debates = loadDebates();
  const debate = debates[preset];

  if (!debate) {
    return NextResponse.json(
      { error: `Unknown preset: ${preset}. Available: ${Object.keys(debates).join(", ")}` },
      { status: 404 }
    );
  }

  return NextResponse.json({ debate: debate.rounds });
}
