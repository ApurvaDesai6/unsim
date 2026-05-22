"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { Committee, VoteResult, CountryVote, SimulationPhase, CountryProfile } from "@/types";
import Hemicycle from "@/components/viz/Hemicycle";
import VoteTally from "@/components/viz/VoteTally";
import PlaybackControls from "@/components/viz/PlaybackControls";
import CountryPanel from "@/components/panel/CountryPanel";
import { getCommitteeConfig } from "@/engines/committees";

function SimulationView() {
  const searchParams = useSearchParams();
  const policy = searchParams.get("policy") || "";
  const preset = searchParams.get("preset") || "";
  const committee = (searchParams.get("committee") || "GA_PLENARY") as Committee;

  const [phase, setPhase] = useState<SimulationPhase>("analyzing");
  const [voteResult, setVoteResult] = useState<VoteResult | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [resolution, setResolution] = useState<{ title: string; preamble?: { id: string; text: string }[]; clauses: { id: string; text: string; strength: number; topics: string[] }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const config = getCommitteeConfig(committee);

  // Run simulation
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
        setPhase("computing_positions");

        const simRes = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolution: data.analyzedResolution,
            committee: data.analyzedResolution.committee || committee,
          }),
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

  // Animated vote reveal
  useEffect(() => {
    if (!playing || !voteResult || phase !== "voting") return;

    const staggerMs = Math.max(8, 40 / speed);
    let lastTime = performance.now();
    let count = revealedCount;

    function tick(now: number) {
      const elapsed = now - lastTime;
      if (elapsed >= staggerMs) {
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
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, voteResult, phase, speed]);

  const progress = voteResult
    ? revealedCount / voteResult.countryVotes.length
    : phase === "analyzing"
      ? 0.1
      : phase === "computing_positions"
        ? 0.3
        : 0;

  const selectedProfile: CountryProfile | null = null; // Will be populated from data
  const selectedVote = selectedCountry
    ? voteResult?.countryVotes.find((v) => v.iso3 === selectedCountry)
    : null;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center space-y-4">
          <p className="text-[var(--color-vote-no)] font-medium">{error}</p>
          <a href="/" className="text-sm text-[var(--color-un-blue)] hover:underline">
            Back to home
          </a>
        </div>
      </div>
    );
  }

  if (phase === "analyzing" || phase === "computing_positions") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[var(--color-muted)]">
            {phase === "analyzing"
              ? "Analyzing resolution and mapping policy dimensions..."
              : "Computing country positions from knowledge graph..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">
              &larr; Back
            </a>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <div>
              <h1 className="text-sm font-medium">
                {resolution?.title || "Resolution"}
              </h1>
              <p className="text-xs text-[var(--color-muted)]">{config.name}</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 font-medium">
            Educational Simulation
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Resolution text */}
          <div className="lg:col-span-1 space-y-4">
            <h2
              className="text-xl font-semibold"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {resolution?.title}
            </h2>
            {resolution?.clauses.map((clause, i) => (
              <div
                key={clause.id || i}
                className="p-3 rounded-lg border border-[var(--color-border)] bg-white text-sm leading-relaxed"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[var(--color-muted)]">
                    Operative Clause {i + 1}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
                    strength: {(clause.strength * 100).toFixed(0)}%
                  </span>
                </div>
                <p>{clause.text}</p>
                {clause.topics.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {clause.topics.map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right: Visualization */}
          <div className="lg:col-span-2 space-y-6">
            {/* Vote tally */}
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
              <div className="bg-white rounded-2xl border border-[var(--color-border)] p-6">
                <Hemicycle
                  votes={voteResult.countryVotes}
                  revealedCount={revealedCount}
                  onCountryClick={setSelectedCountry}
                />
              </div>
            )}

            {/* Playback controls */}
            <PlaybackControls
              playing={playing}
              speed={speed}
              phase={phase}
              progress={progress}
              onTogglePlay={() => setPlaying(!playing)}
              onSpeedChange={setSpeed}
              onSeek={(p) => {
                if (voteResult) {
                  setRevealedCount(Math.floor(p * voteResult.countryVotes.length));
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Country detail panel */}
      {selectedCountry && selectedVote && selectedProfile && (
        <CountryPanel
          country={selectedProfile}
          vote={selectedVote}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </div>
  );
}

export default function SimulateNewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
          <div className="w-10 h-10 border-2 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SimulationView />
    </Suspense>
  );
}
