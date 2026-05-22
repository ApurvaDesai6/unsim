import { readFileSync } from "fs";
import path from "path";
import { simulateVotes } from "../engines/vote-engine";
import type { AnalyzedResolution, CountryProfile, Bloc } from "../types";

const profiles: CountryProfile[] = JSON.parse(
  readFileSync(path.join(__dirname, "../data/country-profiles.json"), "utf-8")
);
const blocs: Bloc[] = JSON.parse(
  readFileSync(path.join(__dirname, "../data/blocs.json"), "utf-8")
);

// Test 1: Climate resolution (should pass with some opposition)
const climate: AnalyzedResolution = {
  id: "test-climate",
  title: "Binding Climate Accountability Treaty",
  committee: "GA_PLENARY",
  preamble: [],
  operativeClauses: [],
  sponsors: [],
  policyVector: {
    sovereignty: -0.4,
    humanRights: 0.1,
    development: 0.3,
    security: 0.0,
    environment: 0.9,
    decolonization: 0.0,
  },
  issueWeights: { climate: 0.9, development: 0.4 },
  contentionPoints: [],
  historicalPrecedents: [],
};

const r1 = simulateVotes(profiles, climate, "GA_PLENARY", blocs);
console.log("=== Climate Accountability Treaty (GA) ===");
console.log(`  Yes: ${r1.totals.yes} | No: ${r1.totals.no} | Abstain: ${r1.totals.abstain}`);
console.log(`  Passed: ${r1.passed ? "ADOPTED" : "NOT ADOPTED"}`);

// Test 2: Nuclear disarmament (P5 should oppose, Global South support)
const nuclear: AnalyzedResolution = {
  id: "test-nuclear",
  title: "Complete Nuclear Disarmament",
  committee: "SECURITY_COUNCIL",
  preamble: [],
  operativeClauses: [],
  sponsors: [],
  policyVector: {
    sovereignty: 0.3,
    humanRights: 0.4,
    development: 0.0,
    security: -0.9,
    environment: 0.2,
    decolonization: 0.3,
  },
  issueWeights: { disarmament: 0.9, security: 0.7 },
  contentionPoints: [],
  historicalPrecedents: [],
};

const r2 = simulateVotes(profiles, nuclear, "SECURITY_COUNCIL", blocs);
console.log("\n=== Nuclear Disarmament (Security Council) ===");
console.log(`  Yes: ${r2.totals.yes} | No: ${r2.totals.no} | Abstain: ${r2.totals.abstain}`);
console.log(`  Passed: ${r2.passed ? "ADOPTED" : "NOT ADOPTED"}`);
console.log(`  Vetoed by: ${r2.vetoedBy?.join(", ") || "none"}`);
// Show P5 votes
const p5 = ["USA", "RUS", "CHN", "GBR", "FRA"];
for (const iso3 of p5) {
  const v = r2.countryVotes.find(cv => cv.iso3 === iso3);
  console.log(`  ${iso3}: ${v?.vote} (confidence: ${(v?.confidence ?? 0).toFixed(2)})`);
}

// Test 3: Israel-Palestine resolution (highly divisive)
const palestine: AnalyzedResolution = {
  id: "test-palestine",
  title: "Protection of Palestinian Civilians",
  committee: "GA_PLENARY",
  preamble: [],
  operativeClauses: [],
  sponsors: [],
  policyVector: {
    sovereignty: 0.6,
    humanRights: 0.7,
    development: 0.2,
    security: -0.3,
    environment: 0.0,
    decolonization: 0.8,
  },
  issueWeights: { "human-rights": 0.7, decolonization: 0.8, sovereignty: 0.5 },
  contentionPoints: [],
  historicalPrecedents: [],
};

const r3 = simulateVotes(profiles, palestine, "GA_PLENARY", blocs);
console.log("\n=== Protection of Palestinian Civilians (GA) ===");
console.log(`  Yes: ${r3.totals.yes} | No: ${r3.totals.no} | Abstain: ${r3.totals.abstain}`);
console.log(`  Passed: ${r3.passed ? "ADOPTED" : "NOT ADOPTED"}`);
// Check specific countries
for (const iso3 of ["USA", "ISR", "GBR", "FRA", "EGY", "SAU", "CHN", "RUS", "IND", "BRA"]) {
  const v = r3.countryVotes.find(cv => cv.iso3 === iso3);
  if (v) console.log(`  ${iso3} (${v.name}): ${v.vote}`);
}
