/**
 * Temporal Simulation Engine
 *
 * Allows simulating the same resolution in different time periods by
 * adjusting country ideal points, relationships, and context based on
 * historical data. The graph state at any year can be reconstructed.
 *
 * Key insight: countries shift position over decades. A nuclear disarmament
 * resolution in 1995 (post-Cold War optimism) produces very different results
 * than in 2023 (renewed great power competition).
 *
 * Uses temporal ideal point drift data from our vote-similarity analysis.
 */

import type { CountryProfile, PolicyDimensions } from "@/types";

interface TemporalConfig {
  baseYear: number;
  targetYear: number;
  eraContext: string;
}

interface EraDefinition {
  name: string;
  years: [number, number];
  description: string;
  globalShifts: Partial<PolicyDimensions>;
  keyEvents: string[];
}

export const ERAS: EraDefinition[] = [
  {
    name: "Cold War Peak",
    years: [1979, 1989],
    description: "US-Soviet bipolar competition. Non-Aligned Movement at peak influence. Decolonization resolutions dominate.",
    globalShifts: { sovereignty: 0.3, security: 0.2, decolonization: 0.3, humanRights: -0.1 },
    keyEvents: ["Soviet-Afghan War", "Iranian Revolution", "Falklands War", "Fall of Berlin Wall"],
  },
  {
    name: "Post-Cold War Optimism",
    years: [1990, 2001],
    description: "Unipolar US moment. Expansion of human rights norms. New states joining UN. Peacekeeping surge.",
    globalShifts: { humanRights: 0.3, sovereignty: -0.2, security: -0.1, development: 0.1 },
    keyEvents: ["Gulf War", "Yugoslav Wars", "Rwanda Genocide", "Expansion of EU/NATO"],
  },
  {
    name: "War on Terror",
    years: [2001, 2011],
    description: "Security dominates agenda. Erosion of multilateralism. North-South divide sharpens on sovereignty vs intervention.",
    globalShifts: { security: 0.4, sovereignty: 0.2, humanRights: -0.1, environment: -0.1 },
    keyEvents: ["9/11", "Iraq War 2003", "Darfur", "Arab Spring begins"],
  },
  {
    name: "Multipolar Transition",
    years: [2011, 2020],
    description: "Rise of BRICS. Climate becomes central. Syria/Yemen deadlock SC. China asserting new role.",
    globalShifts: { environment: 0.3, development: 0.2, sovereignty: 0.1, security: 0.0 },
    keyEvents: ["Paris Agreement", "Syrian Civil War", "Crimea annexation", "COVID-19"],
  },
  {
    name: "New Cold War",
    years: [2020, 2026],
    description: "US-China competition. Russia-West rupture. AI governance emerges. Climate urgency peaks.",
    globalShifts: { sovereignty: 0.3, security: 0.3, environment: 0.2, humanRights: -0.2 },
    keyEvents: ["Ukraine invasion", "Gaza war", "AI governance debates", "AUKUS", "BRICS expansion"],
  },
];

export function getEraForYear(year: number): EraDefinition | null {
  return ERAS.find((e) => year >= e.years[0] && year <= e.years[1]) || null;
}

export function adjustProfileForYear(
  profile: CountryProfile,
  targetYear: number,
  baseYear: number = 2019,
): CountryProfile {
  const yearDiff = targetYear - baseYear;
  const era = getEraForYear(targetYear);

  // Apply era-level global shifts
  const eraShifts = era?.globalShifts || {};
  const scaleFactor = Math.min(1, Math.abs(yearDiff) / 20);

  const adjustedDimensions: PolicyDimensions = {
    sovereignty: clamp(profile.policyDimensions.sovereignty + (eraShifts.sovereignty || 0) * scaleFactor),
    humanRights: clamp(profile.policyDimensions.humanRights + (eraShifts.humanRights || 0) * scaleFactor),
    development: clamp(profile.policyDimensions.development + (eraShifts.development || 0) * scaleFactor),
    security: clamp(profile.policyDimensions.security + (eraShifts.security || 0) * scaleFactor),
    environment: clamp(profile.policyDimensions.environment + (eraShifts.environment || 0) * scaleFactor),
    decolonization: clamp(profile.policyDimensions.decolonization + (eraShifts.decolonization || 0) * scaleFactor),
  };

  // Country-specific temporal adjustments
  const countryShift = getCountryTemporalShift(profile.iso3, targetYear, baseYear);

  return {
    ...profile,
    idealPoint: clamp(profile.idealPoint + countryShift),
    policyDimensions: adjustedDimensions,
  };
}

function getCountryTemporalShift(iso3: string, targetYear: number, baseYear: number): number {
  // Known major position shifts (empirical from Voeten temporal data)
  const shifts: Record<string, { yearStart: number; yearEnd: number; delta: number }[]> = {
    // Russia became much more oppositional after 2014
    RUS: [{ yearStart: 2014, yearEnd: 2024, delta: 0.3 }],
    // China became more assertive post-2012
    CHN: [{ yearStart: 2012, yearEnd: 2024, delta: 0.15 }],
    // Turkey shifted after 2016
    TUR: [{ yearStart: 2016, yearEnd: 2024, delta: 0.2 }],
    // India became more aligned with West on some issues post-2014
    IND: [{ yearStart: 2014, yearEnd: 2024, delta: -0.05 }],
    // Brazil shifted right 2019-2022, back left 2023+
    BRA: [
      { yearStart: 2019, yearEnd: 2022, delta: -0.15 },
      { yearStart: 2023, yearEnd: 2026, delta: 0.1 },
    ],
    // US became more isolated under Trump
    USA: [
      { yearStart: 2017, yearEnd: 2020, delta: -0.1 },
      { yearStart: 2021, yearEnd: 2024, delta: 0.05 },
    ],
    // Germany became more progressive on multilateralism
    DEU: [{ yearStart: 2015, yearEnd: 2024, delta: 0.1 }],
    // Saudi Arabia modernization shift
    SAU: [{ yearStart: 2016, yearEnd: 2024, delta: -0.05 }],
  };

  const countryShifts = shifts[iso3];
  if (!countryShifts) return 0;

  let totalShift = 0;
  for (const s of countryShifts) {
    if (targetYear >= s.yearStart && targetYear <= s.yearEnd) {
      const progress = (targetYear - s.yearStart) / (s.yearEnd - s.yearStart);
      totalShift += s.delta * progress;
    } else if (targetYear > s.yearEnd && baseYear < s.yearEnd) {
      totalShift += s.delta;
    }
  }

  return totalShift;
}

function clamp(value: number, min: number = -1, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

export interface TemporalSimulationResult {
  year: number;
  era: string;
  eraDescription: string;
  keyEvents: string[];
  totals: { yes: number; no: number; abstain: number };
  passed: boolean;
  delta: { yes: number; no: number; abstain: number };
  notableShifts: { iso3: string; name: string; from: string; to: string; reason: string }[];
}

export function compareAcrossYears(
  baseResult: { totals: { yes: number; no: number; abstain: number }; countryVotes: { iso3: string; name: string; vote: string }[] },
  targetResult: { totals: { yes: number; no: number; abstain: number }; countryVotes: { iso3: string; name: string; vote: string }[] },
  targetYear: number,
): TemporalSimulationResult {
  const era = getEraForYear(targetYear);

  const notableShifts: TemporalSimulationResult["notableShifts"] = [];
  for (const baseVote of baseResult.countryVotes) {
    const targetVote = targetResult.countryVotes.find((v) => v.iso3 === baseVote.iso3);
    if (targetVote && targetVote.vote !== baseVote.vote) {
      const isP5 = ["USA", "RUS", "CHN", "GBR", "FRA"].includes(baseVote.iso3);
      const isLarge = ["IND", "BRA", "NGA", "IDN", "DEU", "JPN"].includes(baseVote.iso3);
      if (isP5 || isLarge) {
        notableShifts.push({
          iso3: baseVote.iso3,
          name: baseVote.name,
          from: baseVote.vote,
          to: targetVote.vote,
          reason: getShiftReason(baseVote.iso3, targetYear),
        });
      }
    }
  }

  return {
    year: targetYear,
    era: era?.name || "Unknown",
    eraDescription: era?.description || "",
    keyEvents: era?.keyEvents || [],
    totals: targetResult.totals,
    passed: targetResult.totals.yes > targetResult.totals.no,
    delta: {
      yes: targetResult.totals.yes - baseResult.totals.yes,
      no: targetResult.totals.no - baseResult.totals.no,
      abstain: targetResult.totals.abstain - baseResult.totals.abstain,
    },
    notableShifts,
  };
}

function getShiftReason(iso3: string, year: number): string {
  const reasons: Record<string, Record<string, string>> = {
    USA: { "2003": "Post-9/11 unilateralism", "2017": "America First policy", "2021": "Return to multilateralism" },
    RUS: { "2014": "Post-Crimea isolation", "2022": "Ukraine war positions" },
    CHN: { "2012": "Xi era assertiveness", "2020": "COVID diplomacy shift" },
    BRA: { "2019": "Bolsonaro rightward shift", "2023": "Lula return to G77 alignment" },
    TUR: { "2016": "Post-coup foreign policy shift" },
    IND: { "2014": "Modi pragmatic multilateralism" },
  };

  const countryReasons = reasons[iso3];
  if (!countryReasons) return "Changed geopolitical context";

  let closest = "";
  let closestDist = Infinity;
  for (const [y, reason] of Object.entries(countryReasons)) {
    const dist = Math.abs(parseInt(y) - year);
    if (dist < closestDist) { closestDist = dist; closest = reason; }
  }
  return closest || "Era-specific position shift";
}
