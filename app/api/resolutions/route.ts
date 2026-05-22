import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────

interface PresetMatch {
  rcid: string;
  unres: string;
  title: string;
  date: string;
  session: number;
  issue: string;
  voteSplit: { yes: number; no: number; abstain: number };
  similarity: number;
  keyNoVoters: string[];
  insight: string;
}

interface ResolutionIndex {
  presetMatches: Record<string, PresetMatch[]>;
  meta: {
    resolutionsIndexed: number;
    similarityPairsComputed: number;
  };
}

// ─── Data Loading ────────────────────────────────────────────────────────

let indexCache: ResolutionIndex | null = null;

function loadIndex(): ResolutionIndex {
  if (indexCache) return indexCache;
  const indexPath = path.join(process.cwd(), "data", "resolution-index.json");
  const raw = readFileSync(indexPath, "utf-8");
  indexCache = JSON.parse(raw) as ResolutionIndex;
  return indexCache;
}

// ─── Vote Pattern Matching ───────────────────────────────────────────────

function voteSplitSimilarity(
  a: { yes: number; no: number; abstain: number },
  b: { yes: number; no: number; abstain: number }
): number {
  const totalA = a.yes + a.no + a.abstain;
  const totalB = b.yes + b.no + b.abstain;
  if (totalA === 0 || totalB === 0) return 0;

  const yesRateDiff = Math.abs(a.yes / totalA - b.yes / totalB);
  const noRateDiff = Math.abs(a.no / totalA - b.no / totalB);
  const abstainRateDiff = Math.abs(a.abstain / totalA - b.abstain / totalB);

  return 1 - (yesRateDiff + noRateDiff + abstainRateDiff) / 2;
}

// ─── API Handler ─────────────────────────────────────────────────────────

/**
 * GET /api/resolutions?preset=climate-treaty
 * GET /api/resolutions?yes=167&no=3&abstain=12
 *
 * Returns similar historical resolutions for a given preset scenario
 * or a custom vote pattern.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const index = loadIndex();
    const { searchParams } = request.nextUrl;

    const preset = searchParams.get("preset");
    const yesParam = searchParams.get("yes");
    const noParam = searchParams.get("no");
    const abstainParam = searchParams.get("abstain");
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "5", 10),
      20
    );

    // Preset-based lookup
    if (preset) {
      const matches = index.presetMatches[preset];
      if (!matches) {
        return NextResponse.json(
          {
            error: `Unknown preset: ${preset}`,
            availablePresets: Object.keys(index.presetMatches),
          },
          { status: 400 }
        );
      }
      return NextResponse.json({
        preset,
        matches: matches.slice(0, limit),
        meta: index.meta,
      });
    }

    // Vote-pattern-based lookup
    if (yesParam && noParam && abstainParam) {
      const targetSplit = {
        yes: parseInt(yesParam, 10),
        no: parseInt(noParam, 10),
        abstain: parseInt(abstainParam, 10),
      };

      // Search across all preset matches for the closest vote split
      const allMatches: (PresetMatch & { presetSource: string })[] = [];
      for (const [presetId, matches] of Object.entries(index.presetMatches)) {
        for (const match of matches) {
          allMatches.push({ ...match, presetSource: presetId });
        }
      }

      // Score by vote split similarity
      const scored = allMatches.map((match) => ({
        ...match,
        similarity: voteSplitSimilarity(targetSplit, match.voteSplit),
      }));

      scored.sort((a, b) => b.similarity - a.similarity);

      // Deduplicate by rcid
      const seen = new Set<string>();
      const deduped = scored.filter((m) => {
        if (seen.has(m.rcid)) return false;
        seen.add(m.rcid);
        return true;
      });

      return NextResponse.json({
        targetVoteSplit: targetSplit,
        matches: deduped.slice(0, limit),
        meta: index.meta,
      });
    }

    // No parameters — return metadata and available presets
    return NextResponse.json({
      availablePresets: Object.keys(index.presetMatches),
      meta: index.meta,
      usage: {
        byPreset: "GET /api/resolutions?preset=climate-treaty",
        byVotePattern: "GET /api/resolutions?yes=167&no=3&abstain=12",
        parameters: {
          preset: "One of the available preset scenario IDs",
          yes: "Number of Yes votes",
          no: "Number of No votes",
          abstain: "Number of Abstain votes",
          limit: "Max results (default 5, max 20)",
        },
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load resolution index", details: message },
      { status: 500 }
    );
  }
}
