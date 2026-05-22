# UNSim v2 — Vision & Architecture

## What This Is

An interactive UN simulation platform that models how 193 member states navigate multilateral diplomacy. Users submit or upload resolutions, watch AI-driven delegates debate and negotiate in real-time across all major UN bodies, and explore how changing clause language, committee context, or geopolitical events shifts voting dynamics.

The system is grounded in real data: actual UN voting records, country policy positions extracted via knowledge graphs, and verifiable diplomatic history. It's both a technical showcase (GraphRAG, multi-agent debate, real-time simulation) and a genuinely useful tool for MUN preparation, IR research, and public education.

---

## Core Experience Flow

### 1. Landing — "The Chamber"
A polished editorial homepage with an animated 3D globe showing all 193 nations. Scroll reveals the platform capabilities. Clean, numbered sections:
- Hero: rotating globe with live "pulse" dots on countries currently in diplomatic tension
- Section 1: "What can you simulate?" — committee type cards
- Section 2: "Powered by real data" — stats on voting records, resolutions indexed
- Section 3: "Recent simulations" — community gallery of interesting scenarios

### 2. Simulation Setup
- **Write a resolution** — guided editor with operative/preambulatory clause structure
- **Upload a resolution** — paste MUN committee resolution text, PDF upload
- **Choose a scenario** — preset hot-topic resolutions (climate, AI governance, nuclear disarmament)
- **Select committee** — GA Plenary, Security Council, HRC, ECOSOC, DISEC (First Committee), SPECPOL (Fourth), ECOFIN (Second), SOCHUM (Third)
- **Set context** — year, current geopolitical events, recent precedent resolutions

### 3. The Simulation — Multi-Phase Playback
Phase A: **Resolution Analysis** — AI breaks down clauses, identifies contentious language, maps to policy dimensions
Phase B: **Position Computation** — Knowledge graph queries determine each country's starting position based on their policy history, treaty obligations, alliances, and voting record
Phase C: **Debate Rounds** — AI agents representing key countries deliver speeches, propose amendments, form coalitions. Other countries shift positions based on bloc dynamics and argument quality.
Phase D: **Vote** — Animated reveal (staggered like PolicySim), with live tally and threshold indicator. P5 veto logic for SC.
Phase E: **Post-Vote Analysis** — What made the difference? Which amendments swung votes? What would have changed the outcome?

### 4. Deep Exploration Mode
- **Country Profiles** — click any country to see their full diplomatic DNA: voting history patterns, bloc memberships, key policy positions, historical consistency score
- **Bloc Dynamics** — visualize how blocs (G77, NAM, EU, WEOG, EEG, GRULAC, African Group) coordinate
- **Resolution Comparison** — how does this resolution compare to similar historical ones? What passed, what didn't, and why?
- **What-If Sandbox** — change a single country's position, modify clause strength, add/remove sponsors, see cascading effects

---

## Technical Architecture

### Frontend (Next.js 16 + React 19 + TypeScript)
```
app/
  page.tsx                    — Landing/hero with globe
  simulate/
    page.tsx                  — Simulation setup wizard
    [id]/page.tsx             — Active simulation view
  explore/
    page.tsx                  — Country/bloc/resolution explorer
    countries/[iso3]/page.tsx — Country deep-dive
    blocs/[id]/page.tsx       — Bloc analysis
    resolutions/[id]/page.tsx — Historical resolution detail
  api/
    analyze-resolution/       — Parse and vectorize resolution
    simulate/                 — Run full simulation
    debate/                   — Generate debate speeches
    country-profile/          — Query knowledge graph for country data
    search/                   — Semantic search over resolutions

components/
  viz/
    Globe.tsx                 — 3D globe (d3-geo orthographic or three.js)
    Hemicycle.tsx             — General Assembly hemicycle (SVG, arc-positioned seats)
    SCTable.tsx               — Security Council horseshoe table
    WorldMap.tsx              — Choropleth vote map
    BlocNetwork.tsx           — Force-directed bloc visualization
    VoteTimeline.tsx          — Animated vote reveal with playback controls
    SankeyFlow.tsx            — Amendment influence flow
  panel/
    CountryPanel.tsx          — Slide-out country detail
    ResolutionPanel.tsx       — Resolution text with clause annotations
    DebatePanel.tsx           — Live debate transcript
  editor/
    ResolutionEditor.tsx      — Structured resolution drafting
    ClauseBuilder.tsx         — Individual clause with strength slider
    AmendmentEditor.tsx       — Propose amendments mid-debate
  ui/
    (shadcn components)

lib/
  knowledge-graph/            — GraphRAG system
  simulation/                 — Vote computation engine
  debate/                     — Multi-agent debate orchestration
  data/                       — Data loading and caching
```

### Knowledge Graph / GraphRAG Layer
The core differentiator. Instead of static JSON scoring, we build a queryable knowledge graph:

**Nodes:**
- Countries (193) — with attributes: region, income level, government type, treaty memberships
- Resolutions (thousands) — with clauses, topics, sponsors, vote outcomes
- Topics/Issues — hierarchical taxonomy (climate → emissions → carbon markets)
- Blocs/Alliances — with membership rosters and coordination strength
- Treaties — with signatories and obligation implications
- Leaders/Diplomats — key decision-makers with known positions

**Edges:**
- country → VOTED_ON → resolution (yes/no/abstain)
- country → MEMBER_OF → bloc
- country → SIGNED → treaty
- resolution → ADDRESSES → topic
- country → ALLIES_WITH → country (weighted by voting similarity)
- resolution → REFERENCES → resolution (precedent chain)

**Query patterns:**
- "How has Brazil voted on climate resolutions in the last 10 years?" → traverse country→VOTED_ON→resolution→ADDRESSES→topic
- "Which countries always vote with China on human rights?" → find countries with >90% vote alignment on HRC resolutions
- "What treaties constrain India's position on nuclear disarmament?" → country→SIGNED→treaty→OBLIGATES→position

**Implementation:** Start with a JSON-based graph structure (adjacency lists) for the MVP. Can migrate to Neo4j/Memgraph later. The GraphRAG piece uses the graph to provide structured context to the LLM when generating debate speeches and predicting positions.

### Simulation Engine (TypeScript, runs client-side + server hybrid)
```
engines/
  positionComputer.ts     — Given resolution + country + graph context, compute initial position
  debateSimulator.ts      — Multi-agent debate with position shifting
  votePredictor.ts        — Final vote probability computation
  blocDynamics.ts         — How bloc coordination affects individual votes
  amendmentEngine.ts      — How proposed amendments shift the landscape
  vetoPrediction.ts       — P5 veto likelihood based on red-line analysis
  historicalCalibration.ts — Validate predictions against actual UN votes
```

**Position computation pipeline:**
1. Extract policy dimensions from resolution (climate, sovereignty, human rights, development, security)
2. Query knowledge graph for country's historical positions on each dimension
3. Apply treaty obligation constraints
4. Apply bloc coordination pressure (weighted by bloc cohesion score)
5. Apply bilateral relationship modifiers (allies boost, rivals counter)
6. Apply current geopolitical context overlays
7. Output: probability distribution [P(yes), P(no), P(abstain)] + confidence + reasoning factors

### AI Layer (Configurable: Claude / Gemini)
```
lib/
  ai/
    provider.ts           — Abstract LLM interface
    claude.ts             — Anthropic Claude implementation
    gemini.ts             — Google Gemini implementation
    prompts/
      resolution-draft.ts — Generate UN-style resolution from policy idea
      debate-speech.ts    — Generate country delegate speech
      position-explain.ts — Explain why a country votes a certain way
      amendment-propose.ts — Generate realistic amendments
      context-enrich.ts   — Pull current events context for a topic
```

### Data Sources
- **UN Digital Library** — resolution texts, voting records (UNGA, SC)
- **Voeten Ideal Points** — empirical left-right positioning of countries
- **V-Dem** — democracy indicators, institutional quality
- **UN Voting Data (Erik Voeten)** — all GA votes since 1946
- **UNSC Veto List** — historical veto usage
- **Treaty databases** — UNTC (UN Treaty Collection)
- **Bloc membership rosters** — G77, NAM, EU, AU, ASEAN, etc.
- **World Bank** — GDP, development indicators (for economic context)

---

## Design Language

### Palette
- **Primary**: UN Blue `#4b92db` — used sparingly for key actions
- **Background**: Warm white `#faf8f5` (light mode), Deep navy `#0a0f1a` (simulation playback mode)
- **Text**: `#1a1510` (warm black), `#6b604e` (muted)
- **Vote colors**: Yes `#2a7d4f`, No `#c14333`, Abstain `#d4a843`
- **Accent**: Gold `#c9a94e` (for highlights, notable countries)

### Typography
- Headings: Serif (`'Iowan Old Style', 'Palatino Linotype', Georgia, serif`)
- Body/UI: System sans (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- Data: Monospace for numbers, vote counts

### Animation Philosophy
- **Purposeful**: every animation conveys information (vote reveals show drama, panel transitions show hierarchy)
- **Performance**: RAF-driven for simulation playback (60fps), CSS transitions for UI state
- **Skippable**: all animations can be skipped or sped up
- **Stagger**: vote reveals use 12–20ms stagger per country for engagement

---

## MVP Scope (Phase 1)

Build the foundation that demonstrates the vision:

1. **Landing page** with globe hero and simulation setup
2. **Resolution input** (text input + preset scenarios)
3. **GA Plenary simulation** with animated hemicycle vote
4. **Security Council simulation** with veto mechanics
5. **Country profiles** with real voting history data
6. **Bloc visualization** showing coordination patterns
7. **AI debate** (2 rounds, 6 speakers per round)
8. **Clause sensitivity sliders** — adjust language strength, watch votes shift

Phase 2 adds: all 6 main committees, full knowledge graph, amendment system, historical calibration, user accounts, MUN mode (assign countries to students).

Phase 3 adds: real-time current events integration, multiplayer debate rooms, API for researchers, embeddable widgets.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19, Server Components)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui
- **Visualization**: Custom SVG + d3-geo + d3-force (no heavy charting libs)
- **Animation**: framer-motion for panels, RAF for simulation playback
- **AI**: Anthropic Claude SDK + Google GenAI SDK (abstracted)
- **Data**: Static JSON knowledge graph (MVP), potential Neo4j later
- **Testing**: Vitest + Playwright
- **Deployment**: Vercel
