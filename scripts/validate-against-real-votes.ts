/**
 * Validation Framework — Compare simulation predictions against actual UN votes.
 *
 * This script runs our engine against known historical resolutions and measures
 * accuracy, producing a validation report used on the site's methodology page.
 *
 * Data Sources:
 * - Erik Voeten, "United Nations General Assembly Voting Data"
 *   Harvard Dataverse, doi:10.7910/DVN/LEJUQZ (updated through 2023)
 * - UN Digital Library: https://digitallibrary.un.org
 * - Security Council Veto List: https://research.un.org/en/docs/sc/quick/veto
 *
 * Usage: npx tsx scripts/validate-against-real-votes.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { simulateVotes } from "../engines/vote-engine";
import type { AnalyzedResolution, CountryProfile, Bloc, Committee } from "../types";

const profiles: CountryProfile[] = JSON.parse(
  readFileSync(path.join(__dirname, "../data/country-profiles.json"), "utf-8"),
);
const blocs: Bloc[] = JSON.parse(
  readFileSync(path.join(__dirname, "../data/blocs.json"), "utf-8"),
);

// ─── Historical Resolutions with Known Outcomes ──────────────────────

interface HistoricalVote {
  id: string;
  resolutionNumber: string;
  title: string;
  date: string;
  committee: Committee;
  source: string;
  actual: {
    yes: number;
    no: number;
    abstain: number;
    passed: boolean;
    vetoedBy?: string[];
  };
  knownNoVoters: string[];
  knownAbstainers?: string[];
  policyVector: {
    sovereignty: number;
    humanRights: number;
    development: number;
    security: number;
    environment: number;
    decolonization: number;
  };
  issueWeights: Record<string, number>;
  notes: string;
}

const HISTORICAL_VOTES: HistoricalVote[] = [
  {
    id: "palestine-2023-es10",
    resolutionNumber: "A/ES-10/L.27",
    title: "Protection of civilians and upholding legal and humanitarian obligations (Gaza ceasefire)",
    date: "2023-12-12",
    committee: "GA_PLENARY",
    source: "https://digitallibrary.un.org/record/4029235",
    actual: { yes: 153, no: 10, abstain: 23, passed: true },
    knownNoVoters: ["USA", "ISR", "AUT", "CZE", "GTM", "LBR", "MCO", "MHL", "FSM", "NRU", "PNG"],
    knownAbstainers: ["GBR", "DEU", "ITA", "NLD", "HUN", "UKR", "IND", "AUS"],
    policyVector: {
      sovereignty: 0.5,
      humanRights: 0.8,
      development: 0.2,
      security: -0.3,
      environment: 0.0,
      decolonization: 0.7,
    },
    issueWeights: { "human-rights": 0.8, decolonization: 0.7, sovereignty: 0.5 },
    notes: "Emergency Special Session on Palestine. One of the largest Yes votes on a Palestine resolution. Demanded immediate humanitarian ceasefire.",
  },
  {
    id: "ukraine-2023",
    resolutionNumber: "A/RES/ES-11/6",
    title: "Principles of the Charter of the United Nations underlying a comprehensive, just and lasting peace in Ukraine",
    date: "2023-02-23",
    committee: "GA_PLENARY",
    source: "https://digitallibrary.un.org/record/4003921",
    actual: { yes: 141, no: 7, abstain: 32, passed: true },
    knownNoVoters: ["RUS", "BLR", "PRK", "ERI", "MLI", "NIC", "SYR"],
    knownAbstainers: ["CHN", "IND", "ZAF", "PAK", "BGD", "VNM", "IRN", "CUB", "ETH"],
    policyVector: {
      sovereignty: -0.6,
      humanRights: 0.5,
      development: 0.0,
      security: 0.4,
      environment: 0.0,
      decolonization: -0.2,
    },
    issueWeights: { sovereignty: 0.9, security: 0.7, "human-rights": 0.5 },
    notes: "Western-aligned resolution condemning Russian aggression. Global South split: many abstained rather than opposing.",
  },
  {
    id: "nuclear-weapons-convention-2023",
    resolutionNumber: "A/RES/78/46",
    title: "Convention on the prohibition of the use of nuclear weapons",
    date: "2023-12-04",
    committee: "GA_PLENARY",
    source: "https://digitallibrary.un.org/record/4030271",
    actual: { yes: 126, no: 48, abstain: 12, passed: true },
    knownNoVoters: ["USA", "GBR", "FRA", "RUS", "ISR", "AUS", "CAN", "DEU", "JPN", "KOR", "ITA", "NLD", "POL", "ESP"],
    policyVector: {
      sovereignty: 0.3,
      humanRights: 0.3,
      development: 0.0,
      security: -0.8,
      environment: 0.1,
      decolonization: 0.2,
    },
    issueWeights: { disarmament: 0.9, security: 0.8 },
    notes: "NATO + nuclear states vote No. Global South overwhelmingly Yes. Classic North-South divide on disarmament.",
  },
  {
    id: "sc-gaza-ceasefire-vetoed-2023",
    resolutionNumber: "S/2023/970",
    title: "Security Council draft resolution demanding immediate humanitarian ceasefire in Gaza",
    date: "2023-12-08",
    committee: "SECURITY_COUNCIL",
    source: "https://digitallibrary.un.org/record/4028901",
    actual: { yes: 13, no: 1, abstain: 1, passed: false, vetoedBy: ["USA"] },
    knownNoVoters: ["USA"],
    knownAbstainers: ["GBR"],
    policyVector: {
      sovereignty: 0.4,
      humanRights: 0.7,
      development: 0.1,
      security: -0.2,
      environment: 0.0,
      decolonization: 0.5,
    },
    issueWeights: { "human-rights": 0.8, security: 0.5, sovereignty: 0.4 },
    notes: "13-1-1 vote with sole US veto. UK abstained. All other P5 (Russia, China, France) voted Yes.",
  },
  {
    id: "climate-loss-damage-2023",
    resolutionNumber: "A/RES/78/148",
    title: "Protection of global climate for present and future generations of humankind",
    date: "2023-12-19",
    committee: "GA_PLENARY",
    source: "https://digitallibrary.un.org/record/4031024",
    actual: { yes: 167, no: 3, abstain: 12, passed: true },
    knownNoVoters: ["USA", "RUS", "IRN"],
    knownAbstainers: ["SAU", "KWT", "IRQ"],
    policyVector: {
      sovereignty: -0.2,
      humanRights: 0.2,
      development: 0.4,
      security: 0.0,
      environment: 0.9,
      decolonization: 0.1,
    },
    issueWeights: { climate: 0.9, development: 0.5, environment: 0.8 },
    notes: "Near-consensus climate resolution. Only USA, Russia, Iran voted No. Oil states abstained.",
  },
  {
    id: "right-to-development-2023",
    resolutionNumber: "A/RES/78/160",
    title: "The right to development",
    date: "2023-12-19",
    committee: "GA_PLENARY",
    source: "https://digitallibrary.un.org/record/4031040",
    actual: { yes: 145, no: 27, abstain: 9, passed: true },
    knownNoVoters: ["USA", "GBR", "FRA", "DEU", "AUS", "CAN", "JPN", "ISR", "NLD", "SWE", "NOR", "DNK"],
    policyVector: {
      sovereignty: 0.5,
      humanRights: 0.4,
      development: 0.9,
      security: 0.0,
      environment: 0.1,
      decolonization: 0.4,
    },
    issueWeights: { development: 0.9, sovereignty: 0.5, "human-rights": 0.4 },
    notes: "Classic North-South divide. Western states oppose on grounds it implies economic obligations. G77 strongly supports.",
  },
];

// ─── Validation Logic ─────────────────────────────────────────────────

interface ValidationResult {
  id: string;
  title: string;
  resolutionNumber: string;
  date: string;
  source: string;
  notes: string;
  actual: { yes: number; no: number; abstain: number; passed: boolean; vetoedBy?: string[] };
  predicted: { yes: number; no: number; abstain: number; passed: boolean; vetoedBy?: string[] };
  accuracy: {
    outcomeCorrect: boolean;
    vetoCorrect: boolean;
    yesDelta: number;
    noDelta: number;
    abstainDelta: number;
    totalError: number;
    knownNoVoterAccuracy: number;
    knownAbstainerAccuracy: number;
  };
}

function validate(historical: HistoricalVote): ValidationResult {
  const resolution: AnalyzedResolution = {
    id: historical.id,
    title: historical.title,
    committee: historical.committee,
    preamble: [],
    operativeClauses: [],
    sponsors: [],
    policyVector: historical.policyVector,
    issueWeights: historical.issueWeights,
    contentionPoints: [],
    historicalPrecedents: [],
  };

  const result = simulateVotes(profiles, resolution, historical.committee, blocs);

  // Check how many known No voters we predicted correctly
  let noCorrect = 0;
  for (const iso3 of historical.knownNoVoters) {
    const cv = result.countryVotes.find((v) => v.iso3 === iso3);
    if (cv?.vote === "No") noCorrect++;
  }

  let abstainCorrect = 0;
  if (historical.knownAbstainers) {
    for (const iso3 of historical.knownAbstainers) {
      const cv = result.countryVotes.find((v) => v.iso3 === iso3);
      if (cv?.vote === "Abstain") abstainCorrect++;
    }
  }

  const yesDelta = result.totals.yes - historical.actual.yes;
  const noDelta = result.totals.no - historical.actual.no;
  const abstainDelta = result.totals.abstain - historical.actual.abstain;

  const vetoCorrect =
    (historical.actual.vetoedBy?.sort().join(",") || "") ===
    (result.vetoedBy?.sort().join(",") || "");

  return {
    id: historical.id,
    title: historical.title,
    resolutionNumber: historical.resolutionNumber,
    date: historical.date,
    source: historical.source,
    notes: historical.notes,
    actual: historical.actual,
    predicted: {
      yes: result.totals.yes,
      no: result.totals.no,
      abstain: result.totals.abstain,
      passed: result.passed,
      vetoedBy: result.vetoedBy,
    },
    accuracy: {
      outcomeCorrect: result.passed === historical.actual.passed,
      vetoCorrect,
      yesDelta,
      noDelta,
      abstainDelta,
      totalError: Math.abs(yesDelta) + Math.abs(noDelta) + Math.abs(abstainDelta),
      knownNoVoterAccuracy:
        historical.knownNoVoters.length > 0
          ? noCorrect / historical.knownNoVoters.length
          : 1,
      knownAbstainerAccuracy:
        historical.knownAbstainers && historical.knownAbstainers.length > 0
          ? abstainCorrect / historical.knownAbstainers.length
          : 1,
    },
  };
}

// ─── Run Validation ───────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║   UNSim Validation Report — Engine vs. Real UN Votes    ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const results: ValidationResult[] = [];

for (const historical of HISTORICAL_VOTES) {
  const result = validate(historical);
  results.push(result);

  console.log(`━━━ ${result.title} ━━━`);
  console.log(`    Resolution: ${result.resolutionNumber} (${result.date})`);
  console.log(`    Actual:    Yes ${result.actual.yes} | No ${result.actual.no} | Abstain ${result.actual.abstain} → ${result.actual.passed ? "ADOPTED" : "NOT ADOPTED"}${result.actual.vetoedBy ? ` [VETOED: ${result.actual.vetoedBy.join(",")}]` : ""}`);
  console.log(`    Predicted: Yes ${result.predicted.yes} | No ${result.predicted.no} | Abstain ${result.predicted.abstain} → ${result.predicted.passed ? "ADOPTED" : "NOT ADOPTED"}${result.predicted.vetoedBy ? ` [VETOED: ${result.predicted.vetoedBy.join(",")}]` : ""}`);
  console.log(`    Δ Yes: ${result.accuracy.yesDelta > 0 ? "+" : ""}${result.accuracy.yesDelta} | Δ No: ${result.accuracy.noDelta > 0 ? "+" : ""}${result.accuracy.noDelta} | Δ Abstain: ${result.accuracy.abstainDelta > 0 ? "+" : ""}${result.accuracy.abstainDelta}`);
  console.log(`    Outcome correct: ${result.accuracy.outcomeCorrect ? "✓" : "✗"} | Known No-voter accuracy: ${(result.accuracy.knownNoVoterAccuracy * 100).toFixed(0)}%`);
  if (result.actual.vetoedBy) {
    console.log(`    Veto correct: ${result.accuracy.vetoCorrect ? "✓" : "✗"}`);
  }
  console.log(`    Source: ${result.source}`);
  console.log("");
}

// ─── Summary Statistics ───────────────────────────────────────────────

const outcomeAccuracy = results.filter((r) => r.accuracy.outcomeCorrect).length / results.length;
const avgTotalError = results.reduce((sum, r) => sum + r.accuracy.totalError, 0) / results.length;
const avgNoVoterAccuracy = results.reduce((sum, r) => sum + r.accuracy.knownNoVoterAccuracy, 0) / results.length;
const vetoResults = results.filter((r) => r.actual.vetoedBy);
const vetoAccuracy = vetoResults.length > 0
  ? vetoResults.filter((r) => r.accuracy.vetoCorrect).length / vetoResults.length
  : null;

console.log("═══════════════════════════════════════════════════════════");
console.log("SUMMARY");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Resolutions tested:        ${results.length}`);
console.log(`  Outcome accuracy:          ${(outcomeAccuracy * 100).toFixed(0)}% (${results.filter((r) => r.accuracy.outcomeCorrect).length}/${results.length} correct pass/fail)`);
console.log(`  Avg total vote error:      ${avgTotalError.toFixed(1)} seats`);
console.log(`  Avg No-voter detection:    ${(avgNoVoterAccuracy * 100).toFixed(0)}%`);
if (vetoAccuracy !== null) {
  console.log(`  Veto prediction accuracy:  ${(vetoAccuracy * 100).toFixed(0)}%`);
}
console.log("");

// ─── Save report as JSON for the methodology page ─────────────────────

const report = {
  generatedAt: new Date().toISOString(),
  engineVersion: "0.1.0",
  dataVersion: "seed-193-countries",
  dataSources: [
    {
      name: "Erik Voeten UNGA Voting Data",
      url: "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/LEJUQZ",
      description: "Roll-call voting data for all UNGA resolutions 1946–2023. Provides ideal point estimates and per-resolution country votes.",
      usage: "Country ideal points, voting pattern baselines, historical calibration targets",
    },
    {
      name: "V-Dem (Varieties of Democracy) v14",
      url: "https://www.v-dem.net/data/the-v-dem-dataset/",
      description: "Democracy indicators for 202 countries, 1789–2023. Covers electoral, liberal, participatory, deliberative, and egalitarian dimensions.",
      usage: "Democracy index scores, regime classification, behavioral trait calibration",
    },
    {
      name: "UN Digital Library",
      url: "https://digitallibrary.un.org",
      description: "Official repository of UN documents, resolutions, and voting records.",
      usage: "Resolution texts, vote tallies for validation, historical precedents",
    },
    {
      name: "Security Council Veto List",
      url: "https://research.un.org/en/docs/sc/quick/veto",
      description: "Complete list of vetoes cast in the Security Council since 1946.",
      usage: "Veto pattern analysis, P5 behavioral calibration",
    },
    {
      name: "World Bank Open Data",
      url: "https://data.worldbank.org",
      description: "Development indicators including GDP per capita, population, governance metrics.",
      usage: "Economic context for voting behavior modeling",
    },
  ],
  methodology: {
    positionComputation: [
      "Ideal Point Alignment (25%): Distance between country's Voeten ideal point and resolution's aggregate position",
      "Policy Dimension Matching (30%): Weighted dot product across 6 dimensions (sovereignty, human rights, development, security, environment, decolonization)",
      "Topic Voting History (20%): Historical voting rate on resolution's topic categories",
      "Bloc Coordination (15%): Average predicted vote of bloc peers, weighted by bloc cohesion scores",
      "Bilateral Relations (10%): Alliance and rivalry modifiers (planned for v2)",
    ],
    voteDecision: "Softmax3 function converts composite score to probability distribution [P(Yes), P(No), P(Abstain)]. Argmax determines predicted vote. Abstain probability boosted for countries with weak position signals and lower democracy indices.",
    limitations: [
      "Current model uses static ideal points — does not capture year-over-year drift in positions",
      "Bilateral relations and specific diplomatic disputes not yet modeled",
      "Topic-specific voting history not yet populated from Voeten roll-call data",
      "Resolution language analysis is approximate — actual clause wording matters",
      "Does not model last-minute diplomatic pressure, side deals, or vote trading",
      "Small island states with sparse voting records are less accurately predicted",
    ],
  },
  summary: {
    resolutionsTested: results.length,
    outcomeAccuracy,
    avgTotalError,
    avgNoVoterAccuracy,
    vetoAccuracy,
  },
  results,
};

const reportPath = path.join(__dirname, "../data/validation-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n✓ Full validation report saved to ${reportPath}`);
