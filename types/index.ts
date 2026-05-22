// ─── Committees ───────────────────────────────────────────────────────

export type Committee =
  | "GA_PLENARY"
  | "SECURITY_COUNCIL"
  | "HRC"
  | "ECOSOC"
  | "FIRST_COMMITTEE"   // DISEC — Disarmament & International Security
  | "SECOND_COMMITTEE"  // ECOFIN — Economic & Financial
  | "THIRD_COMMITTEE"   // SOCHUM — Social, Humanitarian & Cultural
  | "FOURTH_COMMITTEE"  // SPECPOL — Special Political & Decolonization
  | "SIXTH_COMMITTEE";  // Legal

export interface CommitteeConfig {
  id: Committee;
  name: string;
  shortName: string;
  memberCount: number;
  threshold: number;
  hasVeto: boolean;
  vetoMembers: string[];
  description: string;
}

// ─── Countries ────────────────────────────────────────────────────────

export type RegionalGroup =
  | "AFRICAN"
  | "APG"      // Asia-Pacific Group
  | "EEG"      // Eastern European Group
  | "GRULAC"   // Latin American & Caribbean
  | "WEOG";    // Western European & Others

export interface CountryProfile {
  iso3: string;
  name: string;
  region: RegionalGroup;
  blocs: string[];
  scStatus: "P5" | "elected" | "none";
  idealPoint: number;
  policyDimensions: PolicyDimensions;
  votingHistory: VotingHistory;
  treaties: string[];
  gdpPerCapita: number;
  population: number;
  governmentType: string;
  democracyIndex: number;
}

export interface PolicyDimensions {
  sovereignty: number;        // -1 (multilateralist) to 1 (sovereigntist)
  humanRights: number;        // -1 (non-interventionist) to 1 (interventionist)
  development: number;        // -1 (market-driven) to 1 (state-led development)
  security: number;           // -1 (disarmament) to 1 (militarist)
  environment: number;        // -1 (development priority) to 1 (climate priority)
  decolonization: number;     // -1 (status quo) to 1 (self-determination advocate)
}

export interface VotingHistory {
  totalVotes: number;
  yesRate: number;
  noRate: number;
  abstainRate: number;
  byTopic: Record<string, TopicVotingPattern>;
}

export interface TopicVotingPattern {
  yesRate: number;
  noRate: number;
  abstainRate: number;
  sampleSize: number;
}

// ─── Resolutions ──────────────────────────────────────────────────────

export interface Resolution {
  id: string;
  title: string;
  committee: Committee;
  preamble: PreambleClause[];
  operativeClauses: OperativeClause[];
  sponsors: string[];
  year?: number;
}

export interface PreambleClause {
  id: string;
  text: string;
  references?: string[];
}

export interface OperativeClause {
  id: string;
  text: string;
  strength: number;           // 0–1: how binding/forceful
  topics: string[];
  policyDimensions: Partial<PolicyDimensions>;
}

export interface AnalyzedResolution extends Resolution {
  policyVector: PolicyDimensions;
  issueWeights: Record<string, number>;
  contentionPoints: ContentionPoint[];
  historicalPrecedents: string[];
}

export interface ContentionPoint {
  clauseId: string;
  reason: string;
  affectedBlocs: string[];
  severity: "low" | "medium" | "high";
}

// ─── Simulation ───────────────────────────────────────────────────────

export interface SimulationConfig {
  resolution: AnalyzedResolution;
  committee: Committee;
  year: number;
  context?: string;
  debateRounds: number;
}

export interface SimulationState {
  id: string;
  config: SimulationConfig;
  phase: SimulationPhase;
  positions: Map<string, CountryPosition>;
  debateLog: DebateEntry[];
  amendments: Amendment[];
  voteResult?: VoteResult;
}

export type SimulationPhase =
  | "analyzing"
  | "computing_positions"
  | "debating"
  | "voting"
  | "complete";

export interface CountryPosition {
  iso3: string;
  probability: { yes: number; no: number; abstain: number };
  predictedVote: "Yes" | "No" | "Abstain";
  confidence: number;
  factors: PositionFactor[];
  shiftHistory: PositionShift[];
}

export interface PositionFactor {
  name: string;
  weight: number;
  score: number;
  description: string;
}

export interface PositionShift {
  round: number;
  trigger: string;
  delta: { yes: number; no: number; abstain: number };
}

// ─── Debate ───────────────────────────────────────────────────────────

export interface DebateEntry {
  round: number;
  speaker: string;
  countryName: string;
  position: "Yes" | "No" | "Abstain";
  speech: string;
  keyPoints: string[];
  proposedAmendment?: Amendment;
}

export interface Amendment {
  id: string;
  proposer: string;
  clauseId: string;
  type: "add" | "modify" | "delete";
  originalText?: string;
  newText: string;
  accepted: boolean;
  votesFor: string[];
  votesAgainst: string[];
}

// ─── Vote Results ─────────────────────────────────────────────────────

export interface VoteResult {
  committee: Committee;
  totals: { yes: number; no: number; abstain: number };
  passed: boolean;
  vetoedBy?: string[];
  countryVotes: CountryVote[];
  timestamp: number;
}

export interface CountryVote {
  iso3: string;
  name: string;
  vote: "Yes" | "No" | "Abstain";
  probability: { yes: number; no: number; abstain: number };
  confidence: number;
  factors: PositionFactor[];
}

// ─── Knowledge Graph ──────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  type: "country" | "resolution" | "topic" | "bloc" | "treaty";
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
  attributes?: Record<string, unknown>;
}

// ─── Blocs ────────────────────────────────────────────────────────────

export interface Bloc {
  id: string;
  name: string;
  shortName: string;
  members: string[];
  cohesionScore: number;
  policyLeanings: Partial<PolicyDimensions>;
  description: string;
}

// ─── UI State ─────────────────────────────────────────────────────────

export type ViewMode = "globe" | "hemicycle" | "map" | "blocs" | "timeline";

export interface PlaybackState {
  playing: boolean;
  speed: number;
  progress: number;
  phase: SimulationPhase;
}
