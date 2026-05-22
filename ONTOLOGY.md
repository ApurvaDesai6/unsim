# UNSim Knowledge Graph Ontology

## Overview

A formal ontology for modeling international relations dynamics relevant to UN General Assembly, Security Council, and specialized committee simulations. Designed for temporal reasoning (how relationships evolve), causal inference (why countries vote certain ways), and counterfactual analysis (what changes if X relationship shifts).

## Design Principles

1. **Temporal-first**: All relationships have valid-time intervals. The graph state at any point in history can be reconstructed.
2. **Evidence-grounded**: Every edge links to source evidence (resolution votes, treaty texts, diplomatic events).
3. **Multi-granular**: Relationships exist at country-to-country, country-to-bloc, bloc-to-issue, and country-to-issue levels.
4. **Simulation-oriented**: The ontology is designed to answer "how would X vote on Y given Z context?" not just "what happened?"

---

## Node Types

### `Country`
A UN member state.
```
Properties:
  iso3: string (PK)           — ISO 3166-1 alpha-3
  name: string
  region: RegionalGroup       — AFRICAN | APG | EEG | GRULAC | WEOG
  governmentType: string      — from V-Dem regime classification
  independenceYear: int
  gdpPerCapita: float         — World Bank, timestamped
  population: int             — World Bank, timestamped
  democracyIndex: float       — V-Dem polyarchy, timestamped
  idealPoint: float           — Voeten estimate, timestamped
```

### `Bloc`
A formal or informal group that coordinates voting.
```
Properties:
  id: string (PK)
  name: string
  shortName: string
  foundedYear: int
  type: "formal" | "informal" | "regional" | "issue-based"
  cohesionScore: float        — empirical from voting data
  description: string
```

### `Resolution`
A UN resolution (adopted or not).
```
Properties:
  id: string (PK)             — e.g., "A/RES/78/46"
  title: string
  body: Committee
  session: int
  date: date
  outcome: "adopted" | "rejected" | "vetoed"
  voteTally: {yes, no, abstain}
  policyVector: float[6]      — sovereignty, humanRights, development, security, environment, decolonization
  embedding: float[768]       — semantic embedding of full text
  topics: string[]
```

### `Treaty`
An international agreement that constrains behavior.
```
Properties:
  id: string (PK)
  name: string
  adoptedDate: date
  entryForceDate: date
  type: "multilateral" | "bilateral" | "regional"
  domain: string              — e.g., "arms-control", "human-rights", "trade"
  obligationStrength: float   — 0=aspirational, 1=binding with enforcement
```

### `Issue`
A policy domain in the UN taxonomy.
```
Properties:
  id: string (PK)
  name: string
  parent: string | null       — hierarchical (e.g., "climate" → "environment")
  voetanCategory: string      — mapping to Voeten's 6 categories
  description: string
  embedding: float[768]       — semantic embedding
```

### `Leader`
A head of state or key diplomat whose personal position matters.
```
Properties:
  id: string (PK)
  name: string
  country: string
  role: string
  startDate: date
  endDate: date | null
  ideology: float             — left-right positioning
```

### `Event`
A geopolitical event that shifts relationships.
```
Properties:
  id: string (PK)
  title: string
  date: date
  type: "conflict" | "agreement" | "crisis" | "election" | "sanction" | "intervention"
  description: string
  embedding: float[768]
  impactMagnitude: float      — 0=minor, 1=paradigm-shifting
```

---

## Edge Types (Relationships)

### Country ↔ Country

#### `ALLIES_WITH`
Strong alignment in voting and/or formal alliance.
```
Properties:
  since: date
  until: date | null
  strength: float             — 0-1, from vote-similarity matrix
  type: "formal-alliance" | "strategic-partnership" | "voting-bloc" | "bilateral-treaty"
  evidence: string[]          — resolution IDs showing co-voting
```

#### `RIVALS_WITH`
Persistent opposition in voting and/or geopolitical conflict.
```
Properties:
  since: date
  until: date | null
  intensity: float            — 0-1, from negative vote-similarity
  type: "geopolitical" | "ideological" | "territorial" | "economic"
  evidence: string[]
```

#### `TRADES_WITH`
Economic interdependence (affects voting on economic resolutions).
```
Properties:
  year: int
  volumeUSD: float
  dependenceRatio: float      — how dependent is source on target
```

#### `SANCTIONS`
One country/group sanctions another.
```
Properties:
  since: date
  until: date | null
  type: "economic" | "arms" | "diplomatic" | "comprehensive"
  imposedBy: string           — can be country or "UNSC"
```

### Country → Bloc

#### `MEMBER_OF`
```
Properties:
  since: date
  until: date | null
  status: "full" | "observer" | "associate"
  loyaltyScore: float         — how closely they follow bloc consensus
```

### Country → Resolution

#### `VOTED_ON`
```
Properties:
  vote: "yes" | "no" | "abstain" | "absent"
  explanation: string | null  — explanation of vote (when available)
  predictedVote: string       — what our model predicted
  surprise: float             — how unexpected this vote was (0=expected, 1=shocking)
```

#### `SPONSORED`
```
Properties:
  role: "sponsor" | "co-sponsor"
```

### Country → Treaty

#### `SIGNED`
```
Properties:
  signedDate: date
  ratifiedDate: date | null
  reservations: string[]
  status: "signed" | "ratified" | "withdrawn" | "not-signed"
```

### Country → Issue

#### `POSITION_ON`
The country's stance on an issue (temporal).
```
Properties:
  validFrom: date
  validUntil: date | null
  stance: float               — -1 (strongly against) to +1 (strongly for)
  confidence: float           — based on voting sample size
  evidence: string[]          — resolution IDs
```

### Resolution → Issue

#### `ADDRESSES`
```
Properties:
  relevance: float            — 0-1, how centrally this resolution addresses the issue
```

### Event → Country

#### `AFFECTS`
```
Properties:
  direction: "positive" | "negative" | "neutral"
  magnitude: float
  mechanism: string           — e.g., "territorial-loss", "regime-change", "economic-shock"
```

### Event → Relationship

#### `SHIFTS`
An event that changes a country-country relationship.
```
Properties:
  beforeStrength: float
  afterStrength: float
  explanation: string
```

---

## Temporal Model

Every relationship edge has `validFrom` and `validUntil` properties. This enables:

1. **Timeline scrubbing**: "Show me the alliance graph in 2003 vs 2023"
2. **Drift detection**: "Which relationships changed most in the last decade?"
3. **Counterfactual**: "If the 2003 Iraq invasion hadn't happened, how would US-France relations look?"
4. **Era-specific simulation**: "Simulate this resolution as if it were 1995" — use the graph state from that year.

## Inference Rules

The knowledge graph supports these inference patterns:

1. **Transitivity**: If A allies with B, and B allies with C, there's weak positive pressure on A→C.
2. **Bloc coherence**: If >80% of a bloc votes Yes, remaining members face high pressure to conform.
3. **Treaty obligation**: If a country ratified treaty T that mandates position P on issue I, that's a hard constraint.
4. **Leader effect**: When a leader changes, relationships with ideologically similar/dissimilar leaders shift.
5. **Event propagation**: A conflict event between A and B weakens A's relations with B's allies.

---

## Data Population Strategy

### Phase 1: Automated extraction from structured sources
- Voeten voting data → `VOTED_ON` edges (870K+)
- Vote-similarity matrix → `ALLIES_WITH` / `RIVALS_WITH` edges
- UN Treaty Collection → `SIGNED` edges
- V-Dem + World Bank → `Country` node properties
- Topic history → `POSITION_ON` edges

### Phase 2: NLP extraction from unstructured sources
- Resolution texts → `ADDRESSES` edges, `Issue` refinement
- Explanations of Vote → `VOTED_ON.explanation`
- News corpus → `Event` nodes, `AFFECTS`/`SHIFTS` edges
- Diplomatic statements → `Leader` positions

### Phase 3: LLM-assisted inference
- Gap-filling: infer missing relationships from patterns
- Temporal interpolation: fill gaps between known states
- Causal reasoning: why did relationship X shift at time T?
