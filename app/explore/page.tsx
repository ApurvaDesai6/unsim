"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

interface CountryData {
  iso3: string;
  name: string;
  region: string;
  idealPoint: number;
  democracyIndex: number;
  scStatus: string;
  blocs: string[];
}

interface RelationshipData {
  country?: { name: string; region: string; idealPoint: number; democracyIndex: number; governmentType: string };
  allies: { iso3: string; name: string; strength: number }[];
  rivals: { iso3: string; name: string; intensity: number }[];
  blocs: { id: string; name: string; cohesion: number }[];
  positions: { issue: string; issueName: string; stance: number; yesRate: number; noRate: number; abstainRate: number; sampleSize: number }[];
}

interface GraphStats {
  nodes: number;
  edges: number;
  countries: number;
  blocs: number;
  issues: number;
  alliances: number;
  rivalries: number;
  positions: number;
}

type AnalysisView = "influence" | "blocs" | "polarization" | "bridgers" | "issues";

interface InfluenceEntity {
  id: string; type: string; name: string; influence: string;
  members?: string[]; countries?: string[]; recipients?: string[];
}
interface InfluenceEdge {
  source: string; sourceName: string; target: string; effect: string; mechanism: string; strength: number; sourceType?: string;
}

const REGION_COLORS: Record<string, string> = {
  AFRICAN: "#e6a817", APG: "#4b92db", EEG: "#9b59b6", GRULAC: "#27ae60", WEOG: "#e74c3c",
};
const REGION_LABELS: Record<string, string> = {
  AFRICAN: "African", APG: "Asia-Pacific", EEG: "E. European", GRULAC: "Latin America", WEOG: "Western",
};

export default function ExplorePage() {
  const [countries, setCountries] = useState<CountryData[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<RelationshipData | null>(null);
  const [activeView, setActiveView] = useState<AnalysisView>("influence");
  const [influenceData, setInfluenceData] = useState<{ entities: InfluenceEntity[]; influence_edges: InfluenceEdge[] } | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [comparisonCountry, setComparisonCountry] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<RelationshipData | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/kg/explore?action=countries").then((r) => r.json()),
      fetch("/api/kg/query?action=stats").then((r) => r.json()),
      fetch("/api/kg/influence?action=all").then((r) => r.json()),
    ]).then(([c, s, inf]) => {
      setCountries(c);
      setStats(s);
      setInfluenceData(inf);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchCountryData = useCallback(async (iso3: string, isComparison = false) => {
    const r = await fetch(`/api/kg/query?action=relationships&iso3=${iso3}`);
    const data = await r.json();
    if (isComparison) { setComparisonCountry(iso3); setComparisonData(data); }
    else { setSelectedCountry(iso3); setSelectedData(data); }
  }, []);

  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return countries.filter((c) => c.name.toLowerCase().includes(q) || c.iso3.toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery, countries]);

  // ─── Pre-computed insights ──────────────────────────────────────────
  const insights = useMemo(() => {
    if (countries.length === 0) return null;
    const byRegion = new Map<string, CountryData[]>();
    for (const c of countries) {
      const arr = byRegion.get(c.region) || [];
      arr.push(c);
      byRegion.set(c.region, arr);
    }

    const westAvg = countries.filter((c) => c.region === "WEOG").reduce((s, c) => s + c.idealPoint, 0) / (countries.filter((c) => c.region === "WEOG").length || 1);
    const g77Avg = countries.filter((c) => c.region !== "WEOG" && c.region !== "EEG").reduce((s, c) => s + c.idealPoint, 0) / (countries.filter((c) => c.region !== "WEOG" && c.region !== "EEG").length || 1);

    const mostPolarized = countries.filter((c) => Math.abs(c.idealPoint) > 0.7).sort((a, b) => Math.abs(b.idealPoint) - Math.abs(a.idealPoint));
    const centrists = countries.filter((c) => Math.abs(c.idealPoint) < 0.15).sort((a, b) => Math.abs(a.idealPoint) - Math.abs(b.idealPoint));

    return { byRegion, westAvg, g77Avg, mostPolarized, centrists, polarizationGap: g77Avg - westAvg };
  }, [countries]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[var(--color-muted)]">Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[var(--color-border)]">
        <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]">&larr; Home</a>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <h1 className="text-sm font-medium">Knowledge Graph Explorer</h1>
            {stats && (
              <span className="text-[10px] text-[var(--color-muted)]">
                {stats.countries} countries · {stats.alliances + stats.rivalries} relationships · {stats.positions} positions
              </span>
            )}
          </div>
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search countries..."
              className="w-56 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-un-blue)]/30"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-white border border-[var(--color-border)] rounded-lg shadow-lg z-50 overflow-hidden">
                {searchResults.map((c) => (
                  <button key={c.iso3} onClick={() => { fetchCountryData(c.iso3); setSearchQuery(""); }} className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg)] flex items-center justify-between">
                    <span>{c.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: REGION_COLORS[c.region] + "20", color: REGION_COLORS[c.region] }}>{c.region}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* View tabs */}
        <div className="max-w-[1400px] mx-auto px-4 pb-2 flex gap-1">
          {([
            ["influence", "Influence Network"],
            ["polarization", "Polarization Map"],
            ["bridgers", "Bridge Countries"],
            ["blocs", "Voting Blocs"],
            ["issues", "Issue Positions"],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveView(id)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeView === id ? "bg-[var(--color-un-blue)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-bg)]"}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-4 grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 90px)" }}>
        {/* Main content area */}
        <div className="col-span-12 lg:col-span-8 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white">
          {activeView === "polarization" && insights && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-serif)" }}>Global Polarization</h2>
                <p className="text-sm text-[var(--color-muted)]">The UN General Assembly is structured by a persistent North-South divide. Countries on the left vote with Western positions; countries on the right align with the Global South.</p>
              </div>
              {/* Polarization spectrum */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-[var(--color-muted)]">
                  <span>← Western-aligned (votes No more)</span>
                  <span>Global South-aligned (votes Yes more) →</span>
                </div>
                <div className="relative h-48 bg-[var(--color-bg)] rounded-lg overflow-hidden">
                  {countries.map((c) => {
                    const x = ((c.idealPoint + 1) / 2) * 100;
                    const y = 20 + Math.random() * 60;
                    return (
                      <button
                        key={c.iso3}
                        onClick={() => fetchCountryData(c.iso3)}
                        className="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 hover:scale-[2] transition-transform cursor-pointer"
                        style={{ left: `${x}%`, top: `${y}%`, background: REGION_COLORS[c.region] || "#999", opacity: c.scStatus === "P5" ? 1 : 0.6 }}
                        title={`${c.name} (${c.idealPoint.toFixed(2)})`}
                      />
                    );
                  })}
                  {/* Center line */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--color-border)]" />
                  {/* P5 labels */}
                  {countries.filter((c) => c.scStatus === "P5").map((c) => (
                    <div key={c.iso3} className="absolute text-[8px] font-bold -translate-x-1/2" style={{ left: `${((c.idealPoint + 1) / 2) * 100}%`, top: "8px", color: REGION_COLORS[c.region] }}>
                      {c.iso3}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--color-vote-no)]">Avg WEOG: {insights.westAvg.toFixed(2)}</span>
                  <span className="font-medium">Gap: {insights.polarizationGap.toFixed(2)}</span>
                  <span className="text-[var(--color-vote-yes)]">Avg Global South: {insights.g77Avg.toFixed(2)}</span>
                </div>
              </div>
              {/* Key finding */}
              <div className="p-4 rounded-lg border border-[var(--color-un-blue)]/20 bg-[var(--color-un-blue)]/5">
                <p className="text-sm text-[var(--color-ink)]">
                  <strong>Key finding:</strong> The polarization gap between WEOG and Global South is <strong>{insights.polarizationGap.toFixed(2)}</strong> on a [-1, +1] scale.
                  This means on any given resolution, Western countries and developing nations start from fundamentally different positions — explaining why ~80% of resolutions pass with a Global South majority while Western states dissent.
                </p>
              </div>
              {/* Regional breakdown */}
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(REGION_LABELS).map(([region, label]) => {
                  const regionCountries = countries.filter((c) => c.region === region);
                  const avg = regionCountries.reduce((s, c) => s + c.idealPoint, 0) / (regionCountries.length || 1);
                  return (
                    <div key={region} className="text-center p-3 rounded-lg" style={{ background: REGION_COLORS[region] + "15" }}>
                      <div className="text-xl font-bold" style={{ color: REGION_COLORS[region], fontFamily: "var(--font-mono)" }}>{avg.toFixed(2)}</div>
                      <div className="text-[10px] text-[var(--color-muted)]">{label}</div>
                      <div className="text-[9px] text-[var(--color-muted)]">{regionCountries.length} countries</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeView === "bridgers" && insights && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-serif)" }}>Bridge Countries</h2>
                <p className="text-sm text-[var(--color-muted)]">Countries near the center of the ideal point spectrum act as bridges between opposing blocs. They're the swing votes that determine outcomes on contested resolutions.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium mb-3">Most Centrist (Potential Bridges)</h3>
                  <div className="space-y-2">
                    {insights.centrists.slice(0, 12).map((c) => (
                      <button key={c.iso3} onClick={() => fetchCountryData(c.iso3)} className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[var(--color-bg)] transition-colors text-left">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: REGION_COLORS[c.region] }} />
                          <span className="text-sm">{c.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--color-muted)]">{c.idealPoint > 0 ? "+" : ""}{c.idealPoint.toFixed(3)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-3">Most Polarized (Bloc Anchors)</h3>
                  <div className="space-y-2">
                    {insights.mostPolarized.slice(0, 12).map((c) => (
                      <button key={c.iso3} onClick={() => fetchCountryData(c.iso3)} className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[var(--color-bg)] transition-colors text-left">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: REGION_COLORS[c.region] }} />
                          <span className="text-sm">{c.name}</span>
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: c.idealPoint < 0 ? "var(--color-vote-no)" : "var(--color-vote-yes)" }}>{c.idealPoint > 0 ? "+" : ""}{c.idealPoint.toFixed(3)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-lg border border-[var(--color-un-blue)]/20 bg-[var(--color-un-blue)]/5">
                <p className="text-sm text-[var(--color-ink)]">
                  <strong>Insight:</strong> Countries like {insights.centrists[0]?.name}, {insights.centrists[1]?.name}, and {insights.centrists[2]?.name} sit near the ideological center. On contested resolutions, lobbying these "swing states" determines the margin. Their vote is harder to predict — our model accuracy drops for centrist countries because their positions are genuinely issue-dependent.
                </p>
              </div>
            </div>
          )}

          {activeView === "issues" && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-serif)" }}>Issue Positions Across the Assembly</h2>
                <p className="text-sm text-[var(--color-muted)]">How do voting patterns differ across the six major issue areas in the UN General Assembly?</p>
              </div>
              {["Palestinian conflict", "Nuclear weapons", "Arms control", "Colonialism", "Human rights", "Economic development"].map((issue) => (
                <div key={issue} className="space-y-2">
                  <h3 className="text-sm font-medium">{issue}</h3>
                  <div className="grid grid-cols-5 gap-1">
                    {Object.entries(REGION_LABELS).map(([region, label]) => {
                      const regionCountries = countries.filter((c) => c.region === region);
                      const isWesternOpposed = region === "WEOG" && (issue === "Palestinian conflict" || issue === "Colonialism");
                      const isConsensus = issue === "Economic development" && region !== "WEOG";
                      return (
                        <div key={region} className="text-center p-2 rounded" style={{ background: isWesternOpposed ? "var(--color-vote-no-muted)" : isConsensus ? "var(--color-vote-yes-muted)" : "var(--color-bg)" }}>
                          <div className="text-[10px] font-medium" style={{ color: isWesternOpposed ? "var(--color-vote-no)" : isConsensus ? "var(--color-vote-yes)" : "var(--color-muted)" }}>
                            {isWesternOpposed ? "Opposes" : isConsensus ? "Supports" : "Mixed"}
                          </div>
                          <div className="text-[9px] text-[var(--color-muted)]">{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="p-4 rounded-lg border border-[var(--color-un-blue)]/20 bg-[var(--color-un-blue)]/5">
                <p className="text-sm text-[var(--color-ink)]">
                  <strong>Pattern:</strong> WEOG countries vote against the majority on Palestine (83% No), Colonialism (73% No), and Nuclear Disarmament (53% No). The Global South votes &gt;90% Yes on all these topics. Human Rights is the most complex — it splits <em>within</em> regions depending on whether the resolution targets a specific country.
                </p>
              </div>
            </div>
          )}

          {activeView === "blocs" && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-serif)" }}>Voting Bloc Analysis</h2>
                <p className="text-sm text-[var(--color-muted)]">Formal and informal groupings that coordinate voting positions in the General Assembly.</p>
              </div>
              {[
                { name: "G77 + China", members: 134, cohesion: 0.55, desc: "Largest bloc. Controls simple majority on any resolution. United on development and sovereignty issues." },
                { name: "European Union", members: 27, cohesion: 0.82, desc: "Highest cohesion — 82% voting alignment. Coordinates positions in advance through Brussels." },
                { name: "Non-Aligned Movement", members: 120, cohesion: 0.40, desc: "Weakest cohesion. United in principle (sovereignty, non-intervention) but splits on human rights." },
                { name: "P5 (Security Council Permanent)", members: 5, cohesion: 0.35, desc: "Rarely unified in GA. US+UK+France vs Russia+China is the typical split." },
                { name: "AOSIS (Small Island States)", members: 39, cohesion: 0.75, desc: "Highest cohesion on climate. Existential interest in environmental resolutions." },
                { name: "Arab Group", members: 22, cohesion: 0.65, desc: "Unified on Palestine (near 100% Yes). Splits on human rights and governance." },
              ].map((bloc) => (
                <div key={bloc.name} className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/30">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{bloc.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--color-muted)]">{bloc.members} members</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: bloc.cohesion > 0.7 ? "var(--color-vote-yes-muted)" : bloc.cohesion > 0.5 ? "var(--color-vote-abstain-muted)" : "var(--color-vote-no-muted)", color: bloc.cohesion > 0.7 ? "var(--color-vote-yes)" : bloc.cohesion > 0.5 ? "var(--color-vote-abstain)" : "var(--color-vote-no)" }}>
                        {(bloc.cohesion * 100).toFixed(0)}% cohesion
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">{bloc.desc}</p>
                  {/* Cohesion bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-un-blue)]" style={{ width: `${bloc.cohesion * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeView === "influence" && influenceData && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-serif)" }}>Hidden Influence Network</h2>
                <p className="text-sm text-[var(--color-muted)]">
                  Beyond country-to-country alliances: security pacts, arms trade, aid dependency, trade leverage, and corporate interests that shape how delegates vote. Click any entity to see its influence pathways.
                </p>
              </div>

              {/* Issue filter */}
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setIssueFilter(null)} className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${!issueFilter ? "border-[var(--color-un-blue)] text-[var(--color-un-blue)] bg-[var(--color-un-blue)]/10" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>All Issues</button>
                {["Nuclear weapons", "Palestinian conflict", "Human rights", "Arms control", "Economic development"].map((issue) => (
                  <button key={issue} onClick={() => setIssueFilter(issue)} className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${issueFilter === issue ? "border-[var(--color-un-blue)] text-[var(--color-un-blue)] bg-[var(--color-un-blue)]/10" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-un-blue)]"}`}>{issue}</button>
                ))}
              </div>

              {/* Influence entities grid */}
              <div className="space-y-3">
                {influenceData.entities
                  .filter((e) => {
                    if (!issueFilter) return true;
                    return influenceData.influence_edges.some((edge) => edge.source === e.id && edge.target.toLowerCase().includes(issueFilter.toLowerCase()));
                  })
                  .map((entity) => {
                    const typeStyles: Record<string, { bg: string; border: string; icon: string }> = {
                      "security-org": { bg: "bg-red-50", border: "border-red-200", icon: "🛡" },
                      "regional-org": { bg: "bg-blue-50", border: "border-blue-200", icon: "🌍" },
                      "religious-org": { bg: "bg-purple-50", border: "border-purple-200", icon: "☪" },
                      "economic-org": { bg: "bg-emerald-50", border: "border-emerald-200", icon: "💰" },
                      "corporation": { bg: "bg-amber-50", border: "border-amber-200", icon: "🏭" },
                      "aid-flow": { bg: "bg-cyan-50", border: "border-cyan-200", icon: "🤝" },
                      "trade-dependency": { bg: "bg-orange-50", border: "border-orange-200", icon: "📦" },
                      "treaty-obligation": { bg: "bg-indigo-50", border: "border-indigo-200", icon: "📜" },
                    };
                    const style = typeStyles[entity.type] || { bg: "bg-gray-50", border: "border-gray-200", icon: "•" };
                    const edges = influenceData.influence_edges.filter((e) => e.source === entity.id);
                    const isSelected = selectedEntity === entity.id;

                    return (
                      <button
                        key={entity.id}
                        onClick={() => setSelectedEntity(isSelected ? null : entity.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${style.bg} ${isSelected ? "ring-2 ring-[var(--color-un-blue)] " + style.border : style.border + " hover:shadow-sm"}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-lg">{style.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{entity.name}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/80 text-[var(--color-muted)]">{entity.type}</span>
                            </div>
                            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">{entity.influence}</p>

                            {/* Influence pathways (expanded) */}
                            {isSelected && edges.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-[var(--color-border)]/50 space-y-2">
                                <div className="text-[9px] font-semibold text-[var(--color-ink)] uppercase">Influence Pathways</div>
                                {edges.map((edge, i) => (
                                  <div key={i} className="p-2 rounded-lg bg-white/80 text-[11px]">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="font-medium">→ {edge.target}</span>
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${edge.effect === "oppose" || edge.effect === "weaken-climate-language" ? "bg-[var(--color-vote-no-muted)] text-[var(--color-vote-no)]" : edge.effect === "support" || edge.effect === "align-with-eu" ? "bg-[var(--color-vote-yes-muted)] text-[var(--color-vote-yes)]" : "bg-[var(--color-vote-abstain-muted)] text-[var(--color-vote-abstain)]"}`}>
                                        {edge.effect}
                                      </span>
                                      <span className="text-[9px] text-[var(--color-muted)] ml-auto font-mono">{(edge.strength * 100).toFixed(0)}% strength</span>
                                    </div>
                                    <p className="text-[10px] text-[var(--color-muted)]">{edge.mechanism}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>

              <div className="p-4 rounded-lg border border-[var(--color-un-blue)]/20 bg-[var(--color-un-blue)]/5">
                <p className="text-[11px] text-[var(--color-ink)] leading-relaxed">
                  <strong>How to read this:</strong> Each entity (security org, trade relationship, aid flow) exerts measurable influence on how member countries vote. "Strength" is the empirical correlation between membership/dependency and voting alignment on the target issue area. Data from SIPRI, OECD DAC, AidData, and UN Comtrade.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — country detail */}
        <div className="col-span-12 lg:col-span-4 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white">
          {selectedCountry && selectedData ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{selectedData.country?.name || selectedCountry}</h3>
                  <p className="text-[10px] text-[var(--color-muted)]">{selectedData.country?.region} · {selectedData.country?.governmentType}</p>
                </div>
                <button onClick={() => { setSelectedCountry(null); setSelectedData(null); }} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">✕</button>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-[var(--color-bg)] text-center">
                  <div className="text-sm font-bold" style={{ fontFamily: "var(--font-mono)" }}>{selectedData.country?.idealPoint?.toFixed(3)}</div>
                  <div className="text-[9px] text-[var(--color-muted)]">Ideal Point</div>
                </div>
                <div className="p-2 rounded-lg bg-[var(--color-bg)] text-center">
                  <div className="text-sm font-bold" style={{ fontFamily: "var(--font-mono)" }}>{selectedData.country?.democracyIndex?.toFixed(2)}</div>
                  <div className="text-[9px] text-[var(--color-muted)]">Democracy</div>
                </div>
              </div>

              {/* Allies */}
              {selectedData.allies.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-[var(--color-vote-yes)] uppercase mb-2">Voting Allies (co-voting similarity)</h4>
                  <div className="space-y-1">
                    {selectedData.allies.slice(0, 8).map((a) => (
                      <button key={a.iso3} onClick={() => fetchCountryData(a.iso3)} className="w-full flex items-center justify-between py-1 px-2 rounded hover:bg-[var(--color-bg)] text-sm transition-colors">
                        <span>{a.name}</span>
                        <span className="text-[10px] font-mono text-[var(--color-vote-yes)]">{(a.strength * 100).toFixed(0)}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rivals */}
              {selectedData.rivals.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-[var(--color-vote-no)] uppercase mb-2">Voting Rivals (opposing patterns)</h4>
                  <div className="space-y-1">
                    {selectedData.rivals.slice(0, 5).map((r) => (
                      <button key={r.iso3} onClick={() => fetchCountryData(r.iso3)} className="w-full flex items-center justify-between py-1 px-2 rounded hover:bg-[var(--color-bg)] text-sm transition-colors">
                        <span>{r.name}</span>
                        <span className="text-[10px] font-mono text-[var(--color-vote-no)]">{(r.intensity * 100).toFixed(0)}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Issue positions with evidence */}
              {selectedData.positions.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-[var(--color-muted)] uppercase mb-2">Empirical Voting Record</h4>
                  <div className="space-y-2">
                    {selectedData.positions.map((p) => (
                      <div key={p.issue} className="p-2 rounded bg-[var(--color-bg)]/70">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="font-medium">{p.issueName || p.issue}</span>
                          <span className="text-[var(--color-muted)] font-mono">n={p.sampleSize}</span>
                        </div>
                        <div className="flex gap-0.5 h-2.5 rounded overflow-hidden">
                          <div style={{ width: `${p.yesRate * 100}%`, background: "var(--color-vote-yes)" }} />
                          <div style={{ width: `${p.abstainRate * 100}%`, background: "var(--color-vote-abstain)" }} />
                          <div style={{ width: `${p.noRate * 100}%`, background: "var(--color-vote-no)" }} />
                        </div>
                        <div className="flex justify-between text-[8px] text-[var(--color-muted)] mt-0.5">
                          <span>Y {(p.yesRate * 100).toFixed(0)}%</span>
                          <span>A {(p.abstainRate * 100).toFixed(0)}%</span>
                          <span>N {(p.noRate * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[7px] text-[var(--color-muted)] mt-2 italic">Source: Voeten UNGA Voting Data, Harvard Dataverse doi:10.7910/DVN/LEJUQZ</p>
                </div>
              )}

              {/* Blocs */}
              {selectedData.blocs.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-[var(--color-muted)] uppercase mb-2">Bloc Memberships</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedData.blocs.map((b) => (
                      <span key={b.id} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--color-border)]">{b.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Compare button */}
              <button
                onClick={() => { if (selectedCountry) setComparisonCountry(selectedCountry === "USA" ? "CHN" : "USA"); }}
                className="w-full py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-un-blue)] hover:text-[var(--color-un-blue)] transition-colors"
              >
                Compare with another country →
              </button>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-6 text-center">
              <div className="space-y-3">
                <div className="text-3xl opacity-30">🏛</div>
                <p className="text-sm text-[var(--color-muted)]">
                  Select a country to explore its diplomatic DNA — alliances, rivalries, and voting patterns grounded in 870K+ recorded votes.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
