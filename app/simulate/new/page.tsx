"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { Committee, VoteResult, CountryVote, SimulationPhase, PositionFactor } from "@/types";
import Hemicycle from "@/components/viz/Hemicycle";
import VoteTally from "@/components/viz/VoteTally";
import PlaybackControls from "@/components/viz/PlaybackControls";
import { getCommitteeConfig } from "@/engines/committees";

interface ResolutionClause {
  id: string;
  text: string;
  strength: number;
  topics: string[];
}

interface ResolutionData {
  title: string;
  preamble?: { id: string; text: string }[];
  clauses: ResolutionClause[];
}

interface CountryRelationships {
  allies: { iso3: string; name: string; strength: number }[];
  rivals: { iso3: string; name: string; intensity: number }[];
  blocs: { id: string; name: string; cohesion: number }[];
  positions: { issue: string; stance: number; confidence: number }[];
}

function SimulationView() {
  const searchParams = useSearchParams();
  const policy = searchParams.get("policy") || "";
  const preset = searchParams.get("preset") || "";
  const committee = (searchParams.get("committee") || "GA_PLENARY") as Committee;

  const [phase, setPhase] = useState<SimulationPhase>("analyzing");
  const [voteResult, setVoteResult] = useState<VoteResult | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countryRelationships, setCountryRelationships] = useState<CountryRelationships | null>(null);
  const [resolution, setResolution] = useState<ResolutionData | null>(null);
  const [analyzedResolution, setAnalyzedResolution] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"clauses" | "factors" | "blocs">("clauses");
  const [highlightBloc, setHighlightBloc] = useState<string | null>(null);
  const [isResimulating, setIsResimulating] = useState(false);

  const rafRef = useRef<number | null>(null);
  const effectiveCommittee = useRef<Committee>(committee);

  const config = getCommitteeConfig(effectiveCommittee.current);

  // Initial simulation
  useEffect(() => {
    async function runSimulation() {
      try {
        setPhase("analyzing");
        const res = await fetch("/api/analyze-resolution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ policy, preset, committee }),
        });
        if (!res.ok) throw new Error("Failed to analyze resolution");
        const data = await res.json();
        setResolution(data.resolution);
        setAnalyzedResolution(data.analyzedResolution);
        effectiveCommittee.current = data.analyzedResolution.committee || committee;
        setPhase("computing_positions");

        const simRes = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution: data.analyzedResolution, committee: data.analyzedResolution.committee || committee }),
        });
        if (!simRes.ok) throw new Error("Failed to run simulation");
        const simData = await simRes.json();
        setVoteResult(simData.result);
        setPhase("voting");
        setPlaying(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Simulation failed");
      }
    }
    runSimulation();
  }, [policy, preset, committee]);

  // Re-simulate when clause strengths change
  const resimulate = useCallback(async () => {
    if (!analyzedResolution || !resolution) return;
    setIsResimulating(true);
    try {
      const simRes = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: analyzedResolution, committee: effectiveCommittee.current }),
      });
      if (simRes.ok) {
        const simData = await simRes.json();
        setVoteResult(simData.result);
        setRevealedCount(simData.result.countryVotes.length);
        setPhase("complete");
      }
    } finally {
      setIsResimulating(false);
    }
  }, [analyzedResolution, resolution]);

  // Handle clause strength change
  const handleStrengthChange = useCallback((clauseIndex: number, newStrength: number) => {
    if (!resolution || !analyzedResolution) return;
    const updatedClauses = resolution.clauses.map((c, i) =>
      i === clauseIndex ? { ...c, strength: newStrength } : c,
    );
    setResolution({ ...resolution, clauses: updatedClauses });

    // Recompute policy vector based on new strengths
    const updatedAnalyzed = { ...analyzedResolution };
    const opClauses = (updatedAnalyzed.operativeClauses as ResolutionClause[]) || [];
    if (opClauses[clauseIndex]) {
      opClauses[clauseIndex] = { ...opClauses[clauseIndex], strength: newStrength };
      updatedAnalyzed.operativeClauses = opClauses;
    }
    setAnalyzedResolution(updatedAnalyzed);
  }, [resolution, analyzedResolution]);

  // Fetch country relationships when selected
  useEffect(() => {
    if (!selectedCountry) { setCountryRelationships(null); return; }
    fetch(`/api/kg/query?action=relationships&iso3=${selectedCountry}`)
      .then((r) => r.json())
      .then(setCountryRelationships)
      .catch(() => setCountryRelationships(null));
  }, [selectedCountry]);

  // Vote reveal animation
  useEffect(() => {
    if (!playing || !voteResult || phase !== "voting") return;
    const staggerMs = Math.max(5, 30 / speed);
    let count = revealedCount;
    let lastTime = performance.now();

    function tick(now: number) {
      if (now - lastTime >= staggerMs) {
        count++;
        setRevealedCount(count);
        lastTime = now;
        if (count >= voteResult!.countryVotes.length) {
          setPlaying(false);
          setPhase("complete");
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, voteResult, phase, speed]);

  // Derived data
  const progress = voteResult ? revealedCount / voteResult.countryVotes.length : 0;
  const selectedVote = selectedCountry ? voteResult?.countryVotes.find((v) => v.iso3 === selectedCountry) : null;

  const blocVoteSummary = useMemo(() => {
    if (!voteResult || phase !== "complete") return null;
    const blocs: Record<string, { name: string; yes: number; no: number; abstain: number; members: string[] }> = {
      "P5": { name: "P5 (Permanent Members)", yes: 0, no: 0, abstain: 0, members: [] },
      "G77": { name: "G77 + China", yes: 0, no: 0, abstain: 0, members: [] },
      "EU": { name: "European Union", yes: 0, no: 0, abstain: 0, members: [] },
      "WEOG": { name: "Western European & Others", yes: 0, no: 0, abstain: 0, members: [] },
      "AFRICAN": { name: "African Group", yes: 0, no: 0, abstain: 0, members: [] },
      "APG": { name: "Asia-Pacific Group", yes: 0, no: 0, abstain: 0, members: [] },
      "GRULAC": { name: "Latin America & Caribbean", yes: 0, no: 0, abstain: 0, members: [] },
      "EEG": { name: "Eastern European Group", yes: 0, no: 0, abstain: 0, members: [] },
    };
    // We'd need country→region mapping client-side; approximate from vote data
    for (const cv of voteResult.countryVotes) {
      if (["USA", "RUS", "CHN", "GBR", "FRA"].includes(cv.iso3)) {
        blocs["P5"][cv.vote === "Yes" ? "yes" : cv.vote === "No" ? "no" : "abstain"]++;
        blocs["P5"].members.push(cv.iso3);
      }
    }
    return blocs;
  }, [voteResult, phase]);

  // ─── Error State ─────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-12 h-12 rounded-full bg-[var(--color-vote-no-muted)] flex items-center justify-center mx-auto">
            <span className="text-[var(--color-vote-no)] text-lg">!</span>
          </div>
          <p className="text-[var(--color-vote-no)] font-medium">{error}</p>
          <a href="/" className="inline-block text-sm text-[var(--color-un-blue)] hover:underline">
            &larr; Back to scenarios
          </a>
        </div>
      </div>
    );
  }

  // ─── Loading State ───────────────────────────────────────────────────
  if (phase === "analyzing" || phase === "computing_positions") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center space-y-6 max-w-sm">
          <div className="w-12 h-12 border-2 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <p className="font-medium text-[var(--color-ink)]">
              {phase === "analyzing" ? "Analyzing Resolution" : "Computing Country Positions"}
            </p>
            <p className="text-sm text-[var(--color-muted)] mt-1">
              {phase === "analyzing"
                ? "Mapping policy dimensions across 6 axes..."
                : "Querying knowledge graph for 193 countries..."}
            </p>
          </div>
          <div className="flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-[var(--color-un-blue)] animate-pulse-soft" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Simulation View ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[var(--color-border)]">
        <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]">&larr;</a>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <h1 className="text-sm font-medium truncate max-w-[300px]">{resolution?.title}</h1>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-muted)] font-medium">
              {config.shortName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isResimulating && (
              <span className="text-xs text-[var(--color-un-blue)] animate-pulse-soft">Recalculating...</span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 font-medium">
              Simulation
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto grid grid-cols-12 gap-4 p-4 h-[calc(100vh-49px)]">
        {/* Left Panel — Resolution Editor */}
        <div className="col-span-12 lg:col-span-4 xl:col-span-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white">
          {/* Tabs */}
          <div className="sticky top-0 bg-white border-b border-[var(--color-border)] px-3 py-2 flex gap-1 z-10">
            {(["clauses", "factors", "blocs"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab ? "bg-[var(--color-un-blue)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
                }`}
              >
                {tab === "clauses" ? "Resolution" : tab === "factors" ? "Factors" : "Blocs"}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-3">
            {activeTab === "clauses" && resolution?.clauses.map((clause, i) => (
              <div key={clause.id || i} className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/50 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-semibold text-[var(--color-un-blue)]">OP{i + 1}</span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {clause.topics.slice(0, 2).map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-un-blue)]/10 text-[var(--color-un-blue)]">{t}</span>
                    ))}
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-[var(--color-ink)]">{clause.text}</p>
                {/* Strength Slider */}
                <div className="pt-1">
                  <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)] mb-1">
                    <span>Language Strength</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{(clause.strength * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(clause.strength * 100)}
                    onChange={(e) => handleStrengthChange(i, parseInt(e.target.value) / 100)}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, var(--color-un-blue) ${clause.strength * 100}%, var(--color-border) ${clause.strength * 100}%)` }}
                  />
                  <div className="flex justify-between text-[9px] text-[var(--color-muted)] mt-0.5">
                    <span>Notes</span>
                    <span>Demands</span>
                  </div>
                </div>
              </div>
            ))}

            {activeTab === "clauses" && phase === "complete" && (
              <button
                onClick={resimulate}
                disabled={isResimulating}
                className="w-full py-2.5 rounded-lg bg-[var(--color-un-blue)] text-white text-sm font-medium hover:bg-[var(--color-un-blue-dark)] disabled:opacity-50 transition-colors"
              >
                {isResimulating ? "Recalculating..." : "Re-simulate with changes"}
              </button>
            )}

            {activeTab === "factors" && selectedVote && (
              <div className="space-y-3">
                <div className="text-xs font-medium text-[var(--color-ink)]">
                  {selectedVote.name} — Position Factors
                </div>
                {selectedVote.factors.map((f) => (
                  <div key={f.name} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--color-muted)]">{f.name}</span>
                      <span className="font-medium" style={{ fontFamily: "var(--font-mono)", color: f.score > 0 ? "var(--color-vote-yes)" : f.score < 0 ? "var(--color-vote-no)" : "var(--color-muted)" }}>
                        {f.score > 0 ? "+" : ""}{(f.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden relative">
                      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--color-border)]" />
                      <div
                        className="absolute top-0 h-full rounded-full transition-all duration-300"
                        style={{
                          left: f.score >= 0 ? "50%" : `${50 + f.score * 50}%`,
                          width: `${Math.abs(f.score) * 50}%`,
                          background: f.score > 0 ? "var(--color-vote-yes)" : "var(--color-vote-no)",
                        }}
                      />
                    </div>
                    <p className="text-[9px] text-[var(--color-muted)]">{f.description}</p>
                  </div>
                ))}
                {/* Probability bars */}
                <div className="pt-3 border-t border-[var(--color-border)]">
                  <div className="text-[10px] font-medium text-[var(--color-muted)] mb-2">Vote Probability</div>
                  <div className="flex gap-2">
                    {(["yes", "no", "abstain"] as const).map((v) => (
                      <div key={v} className="flex-1 text-center">
                        <div className="text-sm font-semibold" style={{ fontFamily: "var(--font-mono)", color: v === "yes" ? "var(--color-vote-yes)" : v === "no" ? "var(--color-vote-no)" : "var(--color-vote-abstain)" }}>
                          {(selectedVote.probability[v] * 100).toFixed(0)}%
                        </div>
                        <div className="text-[9px] text-[var(--color-muted)] capitalize">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "factors" && !selectedVote && (
              <div className="text-center py-8 text-sm text-[var(--color-muted)]">
                Click a country in the hemicycle to see their position factors
              </div>
            )}

            {activeTab === "blocs" && voteResult && phase === "complete" && (
              <div className="space-y-2">
                <p className="text-[10px] text-[var(--color-muted)]">Hover to highlight members in hemicycle</p>
                {[
                  { id: "p5", label: "P5 Permanent Members", members: ["USA", "RUS", "CHN", "GBR", "FRA"] },
                  { id: "g77-sample", label: "G77 (sample)", members: ["IND", "BRA", "NGA", "ZAF", "EGY", "IDN", "MEX", "ARG", "PAK", "VNM"] },
                  { id: "eu-sample", label: "EU (sample)", members: ["DEU", "FRA", "ITA", "ESP", "NLD", "BEL", "SWE", "POL", "AUT", "IRL"] },
                ].map((bloc) => {
                  const blocVotes = voteResult.countryVotes.filter((cv) => bloc.members.includes(cv.iso3));
                  const yes = blocVotes.filter((v) => v.vote === "Yes").length;
                  const no = blocVotes.filter((v) => v.vote === "No").length;
                  const abstain = blocVotes.filter((v) => v.vote === "Abstain").length;
                  return (
                    <div
                      key={bloc.id}
                      className="p-2.5 rounded-lg border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-un-blue)] transition-colors"
                      onMouseEnter={() => setHighlightBloc(bloc.id)}
                      onMouseLeave={() => setHighlightBloc(null)}
                    >
                      <div className="text-xs font-medium mb-1.5">{bloc.label}</div>
                      <div className="flex gap-3 text-[10px]">
                        <span className="text-[var(--color-vote-yes)]">Yes: {yes}</span>
                        <span className="text-[var(--color-vote-no)]">No: {no}</span>
                        <span className="text-[var(--color-vote-abstain)]">Abstain: {abstain}</span>
                      </div>
                      <div className="flex gap-0.5 mt-1.5">
                        {blocVotes.map((v) => (
                          <div
                            key={v.iso3}
                            className="w-3 h-3 rounded-sm text-[7px] flex items-center justify-center font-bold text-white"
                            style={{ background: v.vote === "Yes" ? "var(--color-vote-yes)" : v.vote === "No" ? "var(--color-vote-no)" : "var(--color-vote-abstain)" }}
                            title={`${v.name}: ${v.vote}`}
                          >
                            {v.iso3[0]}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center — Visualization */}
        <div className="col-span-12 lg:col-span-8 xl:col-span-6 flex flex-col gap-4">
          {/* Vote Tally */}
          {voteResult && (
            <VoteTally
              yes={phase === "complete" ? voteResult.totals.yes : Math.floor(revealedCount * voteResult.totals.yes / voteResult.countryVotes.length)}
              no={phase === "complete" ? voteResult.totals.no : Math.floor(revealedCount * voteResult.totals.no / voteResult.countryVotes.length)}
              abstain={phase === "complete" ? voteResult.totals.abstain : Math.floor(revealedCount * voteResult.totals.abstain / voteResult.countryVotes.length)}
              threshold={config.threshold}
              total={voteResult.countryVotes.length}
              passed={phase === "complete" ? voteResult.passed : undefined}
              vetoedBy={phase === "complete" ? voteResult.vetoedBy : undefined}
            />
          )}

          {/* Hemicycle */}
          {voteResult && (
            <div className="flex-1 bg-white rounded-2xl border border-[var(--color-border)] p-4 min-h-[350px] flex items-center justify-center">
              <Hemicycle
                votes={voteResult.countryVotes}
                revealedCount={phase === "complete" ? voteResult.countryVotes.length : revealedCount}
                onCountryClick={(iso3) => { setSelectedCountry(iso3); setActiveTab("factors"); }}
                onCountryHover={() => {}}
              />
            </div>
          )}

          {/* Playback */}
          <PlaybackControls
            playing={playing}
            speed={speed}
            phase={phase}
            progress={progress}
            onTogglePlay={() => {
              if (phase === "complete") {
                setRevealedCount(0);
                setPhase("voting");
                setPlaying(true);
              } else {
                setPlaying(!playing);
              }
            }}
            onSpeedChange={setSpeed}
            onSeek={(p) => {
              if (voteResult) setRevealedCount(Math.floor(p * voteResult.countryVotes.length));
            }}
          />
        </div>

        {/* Right Panel — Country Detail */}
        <div className="hidden xl:block xl:col-span-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white">
          {selectedCountry && selectedVote ? (
            <div className="p-4 space-y-4">
              {/* Country header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{selectedVote.name}</h3>
                  <p className="text-[10px] text-[var(--color-muted)]">{selectedCountry}</p>
                </div>
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    background: selectedVote.vote === "Yes" ? "var(--color-vote-yes-muted)" : selectedVote.vote === "No" ? "var(--color-vote-no-muted)" : "var(--color-vote-abstain-muted)",
                    color: selectedVote.vote === "Yes" ? "var(--color-vote-yes)" : selectedVote.vote === "No" ? "var(--color-vote-no)" : "var(--color-vote-abstain)",
                  }}
                >
                  {selectedVote.vote}
                </span>
              </div>

              {/* Confidence */}
              <div className="text-center p-3 rounded-lg bg-[var(--color-bg)]">
                <div className="text-2xl font-bold" style={{ fontFamily: "var(--font-mono)" }}>
                  {(selectedVote.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-[var(--color-muted)]">Prediction Confidence</div>
              </div>

              {/* KG Relationships */}
              {countryRelationships && (
                <>
                  {countryRelationships.allies.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">Closest Voting Partners</h4>
                      <div className="space-y-1">
                        {countryRelationships.allies.slice(0, 5).map((a) => (
                          <div key={a.iso3} className="flex items-center justify-between text-xs">
                            <button onClick={() => setSelectedCountry(a.iso3)} className="text-[var(--color-un-blue)] hover:underline">{a.name}</button>
                            <span className="text-[var(--color-muted)]" style={{ fontFamily: "var(--font-mono)" }}>{(a.strength * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {countryRelationships.rivals.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">Voting Rivals</h4>
                      <div className="space-y-1">
                        {countryRelationships.rivals.slice(0, 3).map((r) => (
                          <div key={r.iso3} className="flex items-center justify-between text-xs">
                            <button onClick={() => setSelectedCountry(r.iso3)} className="text-[var(--color-vote-no)] hover:underline">{r.name}</button>
                            <span className="text-[var(--color-muted)]" style={{ fontFamily: "var(--font-mono)" }}>{(r.intensity * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {countryRelationships.positions.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">Issue Positions (Historical)</h4>
                      <div className="space-y-1.5">
                        {countryRelationships.positions.map((p) => (
                          <div key={p.issue} className="space-y-0.5">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-[var(--color-muted)] truncate">{p.issue}</span>
                              <span style={{ fontFamily: "var(--font-mono)", color: p.stance > 0 ? "var(--color-vote-yes)" : "var(--color-vote-no)" }}>
                                {p.stance > 0 ? "+" : ""}{(p.stance * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-[var(--color-bg)] overflow-hidden relative">
                              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--color-border)]" />
                              <div
                                className="absolute top-0 h-full rounded-full"
                                style={{
                                  left: p.stance >= 0 ? "50%" : `${50 + p.stance * 50}%`,
                                  width: `${Math.abs(p.stance) * 50}%`,
                                  background: p.stance > 0 ? "var(--color-vote-yes)" : "var(--color-vote-no)",
                                  opacity: p.confidence,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {countryRelationships.blocs.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">Bloc Memberships</h4>
                      <div className="flex flex-wrap gap-1">
                        {countryRelationships.blocs.map((b) => (
                          <span key={b.id} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
                            {b.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-6 text-center">
              <div>
                <div className="text-3xl mb-3 opacity-30">🏛</div>
                <p className="text-sm text-[var(--color-muted)]">
                  Click any country in the hemicycle to explore their diplomatic relationships and voting rationale
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SimulateNewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="w-10 h-10 border-2 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SimulationView />
    </Suspense>
  );
}
