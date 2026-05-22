"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { COMMITTEES } from "@/engines/committees";
import type { Committee } from "@/types";

const COMMITTEE_LIST = Object.values(COMMITTEES);

const PRESETS = [
  {
    id: "climate-treaty",
    title: "Global Climate Accountability Treaty",
    description: "Binding emissions targets with financial penalties for non-compliance",
    committee: "GA_PLENARY" as Committee,
  },
  {
    id: "ai-governance",
    title: "International AI Governance Framework",
    description: "Establishing a UN body to regulate frontier AI development",
    committee: "GA_PLENARY" as Committee,
  },
  {
    id: "nuclear-ban",
    title: "Universal Nuclear Disarmament Resolution",
    description: "Complete elimination of nuclear weapons with verification regime",
    committee: "FIRST_COMMITTEE" as Committee,
  },
  {
    id: "sc-reform",
    title: "Security Council Expansion",
    description: "Adding 6 permanent members with modified veto rights",
    committee: "GA_PLENARY" as Committee,
  },
  {
    id: "cyber-norms",
    title: "Binding Cyber Warfare Norms",
    description: "Prohibiting state-sponsored cyberattacks on civilian infrastructure",
    committee: "SECURITY_COUNCIL" as Committee,
  },
  {
    id: "water-rights",
    title: "Universal Right to Clean Water",
    description: "Declaring clean water access a binding human right with enforcement mechanisms",
    committee: "THIRD_COMMITTEE" as Committee,
  },
];

interface LiveEvent { id: string; title: string; date: string; source: string; countries: string[]; type: string; relevance: number }

export default function LandingPage() {
  const router = useRouter();
  const [policyIdea, setPolicyIdea] = useState("");
  const [committee, setCommittee] = useState<Committee>("GA_PLENARY");
  const [mode, setMode] = useState<"write" | "presets">("presets");
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  useEffect(() => {
    fetch("/api/events").then((r) => r.json()).then((d) => setLiveEvents(d.events || [])).catch(() => {});
  }, []);

  const canSubmit = mode === "write" ? policyIdea.trim().length >= 20 : true;

  function handleSubmit(preset?: (typeof PRESETS)[0]) {
    const params = new URLSearchParams();
    if (preset) {
      params.set("preset", preset.id);
      params.set("committee", preset.committee);
    } else {
      params.set("policy", policyIdea);
      params.set("committee", committee);
    }
    router.push(`/simulate/new?${params.toString()}`);
  }

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex flex-col items-center justify-center px-6">
        {/* Subtle background gradient */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: "radial-gradient(ellipse at 50% 30%, var(--color-un-blue) 0%, transparent 60%)",
          }}
          aria-hidden
        />

        <div className="relative z-10 max-w-3xl w-full text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border)] bg-white/60 backdrop-blur-sm text-xs font-medium text-[var(--color-muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-vote-yes)] animate-pulse-soft" />
            Interactive Simulation Platform
          </div>

          {/* Title */}
          <h1
            className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Simulate the
            <br />
            <span className="text-[var(--color-un-blue)]">United Nations</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-[var(--color-muted)] max-w-2xl mx-auto leading-relaxed">
            Submit a policy idea, watch AI-powered delegates debate across committees,
            and see how 193 member states would vote — grounded in real voting records
            and diplomatic history.
          </p>

          {/* Stats */}
          <div className="flex justify-center gap-8 text-sm text-[var(--color-muted)]">
            <div>
              <span className="text-2xl font-semibold text-[var(--color-ink)] block">193</span>
              Countries
            </div>
            <div>
              <span className="text-2xl font-semibold text-[var(--color-ink)] block">9</span>
              Committees
            </div>
            <div>
              <span className="text-2xl font-semibold text-[var(--color-ink)] block">75+</span>
              Years of Data
            </div>
          </div>
        </div>
      </section>

      {/* Simulation Setup Section */}
      <section className="relative z-10 border-t border-[var(--color-border)] bg-white">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
            01 · Begin simulation
          </div>
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-10"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Choose your scenario
          </h2>

          {/* Mode Toggle */}
          <div className="flex gap-1 p-1 bg-[var(--color-bg)] rounded-lg w-fit mb-8">
            <button
              onClick={() => setMode("presets")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "presets"
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              Preset Scenarios
            </button>
            <button
              onClick={() => setMode("write")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "write"
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              Write Your Own
            </button>
          </div>

          {mode === "presets" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSubmit(preset)}
                  className="group text-left p-5 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-un-blue)] hover:shadow-md transition-all bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-[var(--color-ink)] group-hover:text-[var(--color-un-blue)] transition-colors">
                        {preset.title}
                      </h3>
                      <p className="text-sm text-[var(--color-muted)] mt-1">
                        {preset.description}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-muted)] font-medium">
                      {COMMITTEES[preset.committee].shortName}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Policy Input */}
              <div>
                <label
                  htmlFor="policy-idea"
                  className="block text-sm font-medium text-[var(--color-ink)] mb-2"
                >
                  Your policy idea
                </label>
                <textarea
                  id="policy-idea"
                  value={policyIdea}
                  onChange={(e) => setPolicyIdea(e.target.value)}
                  placeholder="A binding international treaty establishing liability frameworks for autonomous AI systems that cause cross-border harm..."
                  className="w-full h-36 px-4 py-3 rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-un-blue)]/30 focus:border-[var(--color-un-blue)] resize-none text-[15px] leading-relaxed"
                />
                <p className="text-xs text-[var(--color-muted)] mt-1.5">
                  Describe the policy in plain language. The AI will draft a formal UN resolution.
                </p>
              </div>

              {/* Committee Select */}
              <div>
                <label
                  htmlFor="committee-select"
                  className="block text-sm font-medium text-[var(--color-ink)] mb-2"
                >
                  UN Committee
                </label>
                <select
                  id="committee-select"
                  value={committee}
                  onChange={(e) => setCommittee(e.target.value as Committee)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-un-blue)]/30 focus:border-[var(--color-un-blue)] text-[15px]"
                >
                  {COMMITTEE_LIST.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.description.slice(0, 60)}...
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit */}
              <button
                onClick={() => handleSubmit()}
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-xl bg-[var(--color-un-blue)] text-white font-medium hover:bg-[var(--color-un-blue-dark)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[15px]"
              >
                Generate Resolution & Simulate
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Capabilities Section */}
      <section className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
            02 · How it works
          </div>
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-12"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            From policy idea to vote
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Resolution Drafting",
                desc: "AI drafts a formal UN resolution with proper preamble and operative clauses, mapped to policy dimensions.",
              },
              {
                step: "02",
                title: "Position Computing",
                desc: "Knowledge graph queries 75 years of voting data, treaty obligations, and bloc dynamics to predict each nation's stance.",
              },
              {
                step: "03",
                title: "Debate & Vote",
                desc: "AI delegates debate, propose amendments, and shift positions. Watch the animated vote reveal in real-time.",
              },
            ].map((item) => (
              <div key={item.step} className="space-y-3">
                <span className="text-xs font-semibold text-[var(--color-un-blue)]">
                  {item.step}
                </span>
                <h3 className="text-lg font-medium">{item.title}</h3>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Situation Monitor */}
      {liveEvents.length > 0 && (
        <section className="border-t border-[var(--color-border)] bg-white">
          <div className="max-w-4xl mx-auto px-6 py-16">
            <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2 flex items-center gap-2">
              03 · Live context
              <span className="w-2 h-2 rounded-full bg-[var(--color-vote-yes)] animate-pulse-soft" />
            </div>
            <h2
              className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-4"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Recent events shaping votes
            </h2>
            <p className="text-[var(--color-muted)] mb-8 text-sm max-w-2xl">
              Real geopolitical events from UN News, GDELT, and ReliefWeb that affect how countries vote. These inform our simulation context.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {liveEvents.slice(0, 6).map((event) => {
                const typeColors: Record<string, string> = { vote: "var(--color-un-blue)", conflict: "var(--color-vote-no)", diplomatic: "var(--color-vote-yes)", crisis: "var(--color-vote-abstain)", agreement: "var(--color-vote-yes)" };
                return (
                  <div key={event.id} className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: typeColors[event.type] || "var(--color-muted)" }} />
                      <span className="text-[10px] font-medium uppercase text-[var(--color-muted)]">{event.type}</span>
                      <span className="text-[10px] text-[var(--color-muted)]">{event.date}</span>
                    </div>
                    <p className="text-sm font-medium text-[var(--color-ink)] leading-snug">{event.title}</p>
                    <div className="flex gap-1 flex-wrap">
                      {event.countries.slice(0, 4).map((c) => (
                        <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-muted)] font-mono">{c}</span>
                      ))}
                      {event.countries.length > 4 && <span className="text-[9px] text-[var(--color-muted)]">+{event.countries.length - 4}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[var(--color-muted)] mt-4 italic">Sources: GDELT Project · UN News · ReliefWeb API — updated every 6 hours via GitHub Action</p>
          </div>
        </section>
      )}

      {/* Explore Section */}
      <section className="border-t border-[var(--color-border)] bg-white">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
            03 · Explore the data
          </div>
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Knowledge Graph Explorer
          </h2>
          <p className="text-[var(--color-muted)] mb-8 max-w-2xl">
            Visualize the network of alliances, rivalries, and voting patterns between all 193 UN member states.
            Built from 870,000+ real recorded votes spanning 75 years of General Assembly history.
          </p>
          <div className="flex gap-4">
            <a
              href="/explore"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-ink)] text-white text-sm font-medium hover:bg-[var(--color-ink)]/90 transition-colors"
            >
              Open Graph Explorer
              <span className="text-base">→</span>
            </a>
            <a
              href="/methodology"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-muted)] hover:border-[var(--color-un-blue)] hover:text-[var(--color-un-blue)] transition-colors"
            >
              Methodology & Validation
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-[var(--color-muted)]">
          <span>UNSim — Educational Simulation Platform</span>
          <div className="flex gap-4">
            <a href="/explore" className="hover:text-[var(--color-ink)] transition-colors">Explorer</a>
            <a href="/methodology" className="hover:text-[var(--color-ink)] transition-colors">Methodology</a>
          </div>
          <span>Data: Voeten/Harvard Dataverse, V-Dem v14</span>
        </div>
      </footer>
    </main>
  );
}
