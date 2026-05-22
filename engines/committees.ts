import type { Committee, CommitteeConfig } from "@/types";

export const P5_MEMBERS = ["USA", "RUS", "CHN", "GBR", "FRA"] as const;

export const SC_ELECTED_2026 = [
  "DNK", "GRC", "PAK", "PAN", "SOM",
  "BHR", "COL", "COD", "LVA", "LBR",
] as const;

export const COMMITTEES: Record<Committee, CommitteeConfig> = {
  GA_PLENARY: {
    id: "GA_PLENARY",
    name: "General Assembly Plenary",
    shortName: "GA",
    memberCount: 193,
    threshold: 0.5,
    hasVeto: false,
    vetoMembers: [],
    description: "All 193 member states, simple majority on most issues, 2/3 on important questions",
  },
  SECURITY_COUNCIL: {
    id: "SECURITY_COUNCIL",
    name: "Security Council",
    shortName: "SC",
    memberCount: 15,
    threshold: 9 / 15,
    hasVeto: true,
    vetoMembers: [...P5_MEMBERS],
    description: "15 members (5 permanent with veto, 10 elected). 9 affirmative votes required, no P5 veto.",
  },
  HRC: {
    id: "HRC",
    name: "Human Rights Council",
    shortName: "HRC",
    memberCount: 47,
    threshold: 0.5,
    hasVeto: false,
    vetoMembers: [],
    description: "47 elected members, simple majority. Addresses human rights situations worldwide.",
  },
  ECOSOC: {
    id: "ECOSOC",
    name: "Economic and Social Council",
    shortName: "ECOSOC",
    memberCount: 54,
    threshold: 0.5,
    hasVeto: false,
    vetoMembers: [],
    description: "54 members coordinating economic, social, and environmental policy.",
  },
  FIRST_COMMITTEE: {
    id: "FIRST_COMMITTEE",
    name: "Disarmament & International Security",
    shortName: "DISEC",
    memberCount: 193,
    threshold: 0.5,
    hasVeto: false,
    vetoMembers: [],
    description: "All member states. Covers disarmament, nuclear non-proliferation, and international security threats.",
  },
  SECOND_COMMITTEE: {
    id: "SECOND_COMMITTEE",
    name: "Economic & Financial",
    shortName: "ECOFIN",
    memberCount: 193,
    threshold: 0.5,
    hasVeto: false,
    vetoMembers: [],
    description: "All member states. Handles macroeconomic policy, trade, development financing, and debt.",
  },
  THIRD_COMMITTEE: {
    id: "THIRD_COMMITTEE",
    name: "Social, Humanitarian & Cultural",
    shortName: "SOCHUM",
    memberCount: 193,
    threshold: 0.5,
    hasVeto: false,
    vetoMembers: [],
    description: "All member states. Addresses human rights, indigenous peoples, refugees, and social development.",
  },
  FOURTH_COMMITTEE: {
    id: "FOURTH_COMMITTEE",
    name: "Special Political & Decolonization",
    shortName: "SPECPOL",
    memberCount: 193,
    threshold: 0.5,
    hasVeto: false,
    vetoMembers: [],
    description: "All member states. Covers peacekeeping, decolonization, information, and atomic radiation.",
  },
  SIXTH_COMMITTEE: {
    id: "SIXTH_COMMITTEE",
    name: "Legal",
    shortName: "Legal",
    memberCount: 193,
    threshold: 0.5,
    hasVeto: false,
    vetoMembers: [],
    description: "All member states. International law, terrorism conventions, and Charter reform.",
  },
};

export function getCommitteeConfig(committee: Committee): CommitteeConfig {
  return COMMITTEES[committee];
}

export function isP5(iso3: string): boolean {
  return (P5_MEMBERS as readonly string[]).includes(iso3);
}

export function isSCMember(iso3: string): boolean {
  return isP5(iso3) || (SC_ELECTED_2026 as readonly string[]).includes(iso3);
}
