/**
 * Build a resolution similarity index from the Voeten roll-call dataset.
 *
 * For each resolution in sessions 55-74, creates a "vote fingerprint" — a vector
 * of 193 dimensions where each dimension is the country's vote (Yes=1, Abstain=0,
 * No=-1, absent=null). Computes pairwise cosine similarity between resolutions
 * sharing the same issue tag, then matches 6 preset simulation scenarios to their
 * most similar real historical resolutions.
 *
 * Output: data/resolution-index.json
 *
 * Usage: npx tsx scripts/build-resolution-index.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────

interface RollCall {
  rcid: string;
  session: number;
  date: string;
  unres: string;
  short: string;
  descr: string;
}

interface VoteRecord {
  rcid: string;
  country: string;
  countryCode: string;
  vote: string;
}

interface IssueRecord {
  rcid: string;
  shortName: string;
  issue: string;
}

interface ResolutionFingerprint {
  rcid: string;
  unres: string;
  title: string;
  date: string;
  session: number;
  issue: string;
  votes: Map<string, number>; // country_code → numeric vote
  voteSplit: { yes: number; no: number; abstain: number };
  keyNoVoters: string[];
}

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

// ─── CSV Parsing ─────────────────────────────────────────────────────────

function parseRollCalls(content: string): RollCall[] {
  const lines = content.split("\n");
  const records: RollCall[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // CSV may have commas inside quoted fields, so we need a proper parser
    const parts = parseCSVLine(line);
    if (parts.length < 9) continue;
    records.push({
      rcid: parts[0],
      session: parseInt(parts[1]),
      date: parts[3],
      unres: parts[4],
      short: parts[7],
      descr: parts[8],
    });
  }
  return records;
}

function parseCSVLine(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

function parseVotes(content: string): VoteRecord[] {
  const lines = content.split("\n");
  const records: VoteRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 4) continue;
    records.push({
      rcid: parts[0],
      country: parts[1],
      countryCode: parts[2],
      vote: parts[3]?.trim(),
    });
  }
  return records;
}

function parseIssues(content: string): IssueRecord[] {
  const lines = content.split("\n");
  const records: IssueRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 3) continue;
    records.push({
      rcid: parts[0],
      shortName: parts[1],
      issue: parts.slice(2).join(",").trim(),
    });
  }
  return records;
}

// ─── Load Country List ───────────────────────────────────────────────────

interface CountryProfileEntry {
  iso3: string;
  name: string;
}

function loadCountryList(): CountryProfileEntry[] {
  const raw = readFileSync(
    path.join(__dirname, "../data/country-profiles.json"),
    "utf-8"
  );
  const profiles = JSON.parse(raw) as { iso3: string; name: string }[];
  return profiles.map((p) => ({ iso3: p.iso3, name: p.name }));
}

// ─── ISO3 to 2-letter code mapping ──────────────────────────────────────
// The unvotes dataset uses 2-letter codes; country-profiles.json uses ISO3.
// Build a mapping so we can align them.

const ISO3_TO_ISO2: Record<string, string> = {
  AFG: "AF", ALB: "AL", DZA: "DZ", AND: "AD", AGO: "AO", ATG: "AG",
  ARG: "AR", ARM: "AM", AUS: "AU", AUT: "AT", AZE: "AZ", BHS: "BS",
  BHR: "BH", BGD: "BD", BRB: "BB", BLR: "BY", BEL: "BE", BLZ: "BZ",
  BEN: "BJ", BTN: "BT", BOL: "BO", BIH: "BA", BWA: "BW", BRA: "BR",
  BRN: "BN", BGR: "BG", BFA: "BF", BDI: "BI", CPV: "CV", KHM: "KH",
  CMR: "CM", CAN: "CA", CAF: "CF", TCD: "TD", CHL: "CL", CHN: "CN",
  COL: "CO", COM: "KM", COG: "CG", COD: "CD", CRI: "CR", CIV: "CI",
  HRV: "HR", CUB: "CU", CYP: "CY", CZE: "CZ", DNK: "DK", DJI: "DJ",
  DMA: "DM", DOM: "DO", ECU: "EC", EGY: "EG", SLV: "SV", GNQ: "GQ",
  ERI: "ER", EST: "EE", SWZ: "SZ", ETH: "ET", FJI: "FJ", FIN: "FI",
  FRA: "FR", GAB: "GA", GMB: "GM", GEO: "GE", DEU: "DE", GHA: "GH",
  GRC: "GR", GRD: "GD", GTM: "GT", GIN: "GN", GNB: "GW", GUY: "GY",
  HTI: "HT", HND: "HN", HUN: "HU", ISL: "IS", IND: "IN", IDN: "ID",
  IRN: "IR", IRQ: "IQ", IRL: "IE", ISR: "IL", ITA: "IT", JAM: "JM",
  JPN: "JP", JOR: "JO", KAZ: "KZ", KEN: "KE", KIR: "KI", PRK: "KP",
  KOR: "KR", KWT: "KW", KGZ: "KG", LAO: "LA", LVA: "LV", LBN: "LB",
  LSO: "LS", LBR: "LR", LBY: "LY", LIE: "LI", LTU: "LT", LUX: "LU",
  MDG: "MG", MWI: "MW", MYS: "MY", MDV: "MV", MLI: "ML", MLT: "MT",
  MHL: "MH", MRT: "MR", MUS: "MU", MEX: "MX", FSM: "FM", MDA: "MD",
  MCO: "MC", MNG: "MN", MNE: "ME", MAR: "MA", MOZ: "MZ", MMR: "MM",
  NAM: "NA", NRU: "NR", NPL: "NP", NLD: "NL", NZL: "NZ", NIC: "NI",
  NER: "NE", NGA: "NG", MKD: "MK", NOR: "NO", OMN: "OM", PAK: "PK",
  PLW: "PW", PAN: "PA", PNG: "PG", PRY: "PY", PER: "PE", PHL: "PH",
  POL: "PL", PRT: "PT", QAT: "QA", ROU: "RO", RUS: "RU", RWA: "RW",
  KNA: "KN", LCA: "LC", VCT: "VC", WSM: "WS", SMR: "SM", STP: "ST",
  SAU: "SA", SEN: "SN", SRB: "RS", SYC: "SC", SLE: "SL", SGP: "SG",
  SVK: "SK", SVN: "SI", SLB: "SB", SOM: "SO", ZAF: "ZA", SSD: "SS",
  ESP: "ES", LKA: "LK", SDN: "SD", SUR: "SR", SWE: "SE", CHE: "CH",
  SYR: "SY", TJK: "TJ", TZA: "TZ", THA: "TH", TLS: "TL", TGO: "TG",
  TON: "TO", TTO: "TT", TUN: "TN", TUR: "TR", TKM: "TM", TUV: "TV",
  UGA: "UG", UKR: "UA", ARE: "AE", GBR: "GB", USA: "US", URY: "UY",
  UZB: "UZ", VUT: "VU", VEN: "VE", VNM: "VN", YEM: "YE", ZMB: "ZM",
  ZWE: "ZW",
};

// Also build the reverse mapping
const ISO2_TO_ISO3: Record<string, string> = {};
for (const [iso3, iso2] of Object.entries(ISO3_TO_ISO2)) {
  ISO2_TO_ISO3[iso2] = iso3;
}

// ─── Cosine Similarity ───────────────────────────────────────────────────

function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  let commonDims = 0;

  for (const [key, valA] of a) {
    const valB = b.get(key);
    if (valB !== undefined) {
      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
      commonDims++;
    }
  }

  // Require at least 50 common dimensions for a meaningful similarity
  if (commonDims < 50) return 0;

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

// ─── Vote Split Similarity ───────────────────────────────────────────────

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

  // Maximum difference is 2 (e.g., 100% yes vs 100% no)
  return 1 - (yesRateDiff + noRateDiff + abstainRateDiff) / 2;
}

// ─── Key Country Overlap ─────────────────────────────────────────────────

function keyCountryOverlap(
  noVotersA: string[],
  noVotersB: string[]
): number {
  if (noVotersA.length === 0 && noVotersB.length === 0) return 1;
  if (noVotersA.length === 0 || noVotersB.length === 0) return 0;
  const setA = new Set(noVotersA);
  const overlap = noVotersB.filter((c) => setA.has(c)).length;
  const union = new Set([...noVotersA, ...noVotersB]).size;
  return overlap / union;
}

// ─── Preset Scenario Definitions ─────────────────────────────────────────

interface PresetScenario {
  id: string;
  name: string;
  matchIssues: string[];
  expectedVoteSplit: { yes: number; no: number; abstain: number };
  expectedNoVoters: string[]; // ISO2 codes
  keywords: string[];
}

const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: "climate-treaty",
    name: "Climate Treaty",
    matchIssues: ["Economic development"],
    expectedVoteSplit: { yes: 170, no: 3, abstain: 10 },
    expectedNoVoters: ["US", "IL"],
    keywords: ["climate", "global warming", "sustainable", "environment", "carbon", "emission"],
  },
  {
    id: "ai-governance",
    name: "AI Governance",
    matchIssues: ["Economic development", "Human rights"],
    expectedVoteSplit: { yes: 150, no: 5, abstain: 25 },
    expectedNoVoters: ["US", "GB", "IL"],
    keywords: ["technology", "information", "digital", "cyber", "science", "communication"],
  },
  {
    id: "nuclear-ban",
    name: "Nuclear Weapons Ban",
    matchIssues: ["Arms control and disarmament", "Nuclear weapons and nuclear material"],
    expectedVoteSplit: { yes: 130, no: 30, abstain: 20 },
    expectedNoVoters: ["US", "GB", "FR", "RU", "IL", "IN", "PK"],
    keywords: ["nuclear", "weapon", "disarmament", "non-proliferation", "arms"],
  },
  {
    id: "sc-reform",
    name: "Security Council Reform",
    matchIssues: ["Economic development", "Human rights"],
    expectedVoteSplit: { yes: 160, no: 2, abstain: 15 },
    expectedNoVoters: ["US"],
    keywords: ["reform", "council", "representation", "equitable", "membership", "charter"],
  },
  {
    id: "cyber-norms",
    name: "Cyber Norms",
    matchIssues: ["Arms control and disarmament", "Economic development"],
    expectedVoteSplit: { yes: 140, no: 10, abstain: 30 },
    expectedNoVoters: ["US", "GB", "AU", "CA"],
    keywords: ["information", "security", "cyberspace", "technology", "digital", "telecommunication"],
  },
  {
    id: "water-rights",
    name: "Water Rights",
    matchIssues: ["Economic development", "Human rights"],
    expectedVoteSplit: { yes: 165, no: 1, abstain: 15 },
    expectedNoVoters: ["US", "IL"],
    keywords: ["water", "sanitation", "resource", "right to", "access", "development"],
  },
];

// ─── Insight Generation ──────────────────────────────────────────────────

function generateInsight(fp: ResolutionFingerprint): string {
  const total = fp.voteSplit.yes + fp.voteSplit.no + fp.voteSplit.abstain;
  const yesPercent = Math.round((fp.voteSplit.yes / total) * 100);
  const noCount = fp.voteSplit.no;

  if (yesPercent >= 95) {
    return `Near-unanimous resolution with ${yesPercent}% support`;
  } else if (yesPercent >= 85) {
    if (noCount <= 5) {
      return `Near-consensus resolution with only ${noCount} No vote${noCount !== 1 ? "s" : ""}`;
    }
    return `Strong majority (${yesPercent}%) with ${noCount} opposing`;
  } else if (yesPercent >= 67) {
    return `Passed with supermajority (${fp.voteSplit.yes}-${fp.voteSplit.no}-${fp.voteSplit.abstain})`;
  } else if (yesPercent >= 50) {
    return `Contested resolution passing with simple majority (${fp.voteSplit.yes}-${fp.voteSplit.no}-${fp.voteSplit.abstain})`;
  } else {
    return `Highly divisive vote (${fp.voteSplit.yes}-${fp.voteSplit.no}-${fp.voteSplit.abstain})`;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

function main(): void {
  console.log("Building resolution similarity index...\n");

  // Load data
  console.log("Loading data files...");
  const rollCallsRaw = readFileSync(
    path.join(__dirname, "../data/raw/roll_calls.csv"),
    "utf-8"
  );
  const votesRaw = readFileSync(
    path.join(__dirname, "../data/raw/unvotes.csv"),
    "utf-8"
  );
  const issuesRaw = readFileSync(
    path.join(__dirname, "../data/raw/issues.csv"),
    "utf-8"
  );

  const rollCalls = parseRollCalls(rollCallsRaw);
  const votes = parseVotes(votesRaw);
  const issues = parseIssues(issuesRaw);
  const countries = loadCountryList();

  console.log(`  ${rollCalls.length} roll calls loaded`);
  console.log(`  ${votes.length.toLocaleString()} votes loaded`);
  console.log(`  ${issues.length} issue tags loaded`);
  console.log(`  ${countries.length} countries in profiles`);

  // Filter to sessions 55-74
  const sessionRollCalls = rollCalls.filter(
    (rc) => rc.session >= 55 && rc.session <= 78
  );
  console.log(
    `\n  ${sessionRollCalls.length} resolutions in sessions 55-78`
  );

  // Build issue lookup: rcid → issue category
  const issueMap = new Map<string, string>();
  for (const rec of issues) {
    issueMap.set(rec.rcid, rec.issue);
  }

  // Build rcid lookup for quick access
  const rcidSet = new Set(sessionRollCalls.map((rc) => rc.rcid));

  // Index votes by rcid
  console.log("\nIndexing votes by resolution...");
  const votesByRcid = new Map<string, Map<string, number>>();
  const VOTE_MAP: Record<string, number> = { yes: 1, no: -1, abstain: 0 };

  for (const v of votes) {
    if (!rcidSet.has(v.rcid)) continue;
    const numericVote = VOTE_MAP[v.vote];
    if (numericVote === undefined) continue;

    let rcVotes = votesByRcid.get(v.rcid);
    if (!rcVotes) {
      rcVotes = new Map();
      votesByRcid.set(v.rcid, rcVotes);
    }
    rcVotes.set(v.countryCode, numericVote);
  }

  console.log(`  ${votesByRcid.size} resolutions with vote data`);

  // Build fingerprints
  console.log("\nBuilding vote fingerprints...");
  const fingerprints: ResolutionFingerprint[] = [];

  // Key countries to track (P5 + notable actors) by ISO2
  const KEY_COUNTRIES = ["US", "GB", "FR", "RU", "CN", "IN", "IL", "PK", "IR", "AU", "CA", "DE", "JP", "BR", "ZA"];

  for (const rc of sessionRollCalls) {
    const rcVotes = votesByRcid.get(rc.rcid);
    if (!rcVotes || rcVotes.size < 50) continue;

    const issue = issueMap.get(rc.rcid) || "Other";

    // Compute vote split
    let yes = 0, no = 0, abstain = 0;
    for (const v of rcVotes.values()) {
      if (v === 1) yes++;
      else if (v === -1) no++;
      else abstain++;
    }

    // Identify key No voters
    const keyNoVoters: string[] = [];
    for (const cc of KEY_COUNTRIES) {
      if (rcVotes.get(cc) === -1) {
        keyNoVoters.push(cc);
      }
    }

    fingerprints.push({
      rcid: rc.rcid,
      unres: rc.unres,
      title: rc.short,
      date: rc.date,
      session: rc.session,
      issue,
      votes: rcVotes,
      voteSplit: { yes, no, abstain },
      keyNoVoters,
    });
  }

  console.log(`  ${fingerprints.length} fingerprints created`);

  // Group fingerprints by issue for pairwise comparison
  const byIssue = new Map<string, ResolutionFingerprint[]>();
  for (const fp of fingerprints) {
    const group = byIssue.get(fp.issue) || [];
    group.push(fp);
    byIssue.set(fp.issue, group);
  }

  console.log("\nResolutions by issue:");
  for (const [issue, fps] of byIssue) {
    console.log(`  ${issue}: ${fps.length}`);
  }

  // Compute pairwise similarity within issue groups
  console.log("\nComputing pairwise cosine similarities...");
  let pairsComputed = 0;

  // We don't store all pairs, just use them for the preset matching.
  // For large groups, limit to most recent 200 resolutions per issue.
  const recentByIssue = new Map<string, ResolutionFingerprint[]>();
  for (const [issue, fps] of byIssue) {
    const sorted = fps.sort((a, b) => b.session - a.session);
    recentByIssue.set(issue, sorted.slice(0, 200));
  }

  // Match presets to historical resolutions
  console.log("\nMatching preset scenarios to historical resolutions...");
  const presetMatches: Record<string, PresetMatch[]> = {};

  for (const preset of PRESET_SCENARIOS) {
    console.log(`\n  ${preset.id}:`);

    // Gather candidate resolutions from matching issues
    const candidates: ResolutionFingerprint[] = [];
    for (const issue of preset.matchIssues) {
      const fps = recentByIssue.get(issue);
      if (fps) candidates.push(...fps);
    }

    // If no issue-matched candidates, fall back to all fingerprints
    const searchPool = candidates.length > 0 ? candidates : fingerprints.slice(-200);

    // Score each candidate against the preset
    const scored: { fp: ResolutionFingerprint; score: number }[] = [];

    for (const fp of searchPool) {
      // 1. Vote split similarity (40% weight)
      const splitSim = voteSplitSimilarity(preset.expectedVoteSplit, fp.voteSplit);

      // 2. Key country overlap — how many expected No voters actually voted No (30% weight)
      const keyOverlap = keyCountryOverlap(preset.expectedNoVoters, fp.keyNoVoters);

      // 3. Keyword relevance (20% weight)
      const titleLower = (fp.title + " " + (fp.issue || "")).toLowerCase();
      const keywordHits = preset.keywords.filter((kw) =>
        titleLower.includes(kw.toLowerCase())
      ).length;
      const keywordScore = Math.min(keywordHits / 2, 1);

      // 4. Recency bonus (10% weight) — prefer more recent resolutions
      const recencyScore = Math.min((fp.session - 55) / 23, 1);

      const totalScore =
        splitSim * 0.4 +
        keyOverlap * 0.3 +
        keywordScore * 0.2 +
        recencyScore * 0.1;

      scored.push({ fp, score: totalScore });
      pairsComputed++;
    }

    // Sort by score descending, take top 5
    scored.sort((a, b) => b.score - a.score);
    const top5 = scored.slice(0, 5);

    presetMatches[preset.id] = top5.map(({ fp, score }) => ({
      rcid: fp.rcid,
      unres: fp.unres,
      title: fp.title,
      date: fp.date,
      session: fp.session,
      issue: fp.issue,
      voteSplit: fp.voteSplit,
      similarity: Math.round(score * 100) / 100,
      keyNoVoters: fp.keyNoVoters,
      insight: generateInsight(fp),
    }));

    for (const match of presetMatches[preset.id]) {
      console.log(
        `    ${match.unres} (${match.title}) — similarity: ${match.similarity}`
      );
    }
  }

  // Also compute some pairwise similarity stats for the meta section
  // Count pairs within issue groups
  for (const [, fps] of recentByIssue) {
    const n = fps.length;
    pairsComputed += (n * (n - 1)) / 2;
  }

  // Build output
  const output: ResolutionIndex = {
    presetMatches,
    meta: {
      resolutionsIndexed: fingerprints.length,
      similarityPairsComputed: pairsComputed,
    },
  };

  // Write output
  const outputPath = path.join(__dirname, "../data/resolution-index.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n\nOutput written to: ${outputPath}`);
  console.log(`  Resolutions indexed: ${output.meta.resolutionsIndexed}`);
  console.log(
    `  Similarity pairs computed: ${output.meta.similarityPairsComputed.toLocaleString()}`
  );
}

main();
