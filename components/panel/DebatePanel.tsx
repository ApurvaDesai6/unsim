"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebateSpeech {
  iso3: string;
  countryName: string;
  position: string;
  speech: string;
  keyPoints: string[];
  rhetorical_strategy: string;
}

interface DebateRound {
  round: number;
  speeches: DebateSpeech[];
}

interface DebatePanelProps {
  preset?: string;
  rounds?: DebateRound[];
  onClose?: () => void;
}

// ─── Position Badge ──────────────────────────────────────────────────────────

function PositionBadge({ position }: { position: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    Yes: { bg: "var(--color-vote-yes-muted, #dcfce7)", text: "var(--color-vote-yes, #16a34a)" },
    No: { bg: "var(--color-vote-no-muted, #fee2e2)", text: "var(--color-vote-no, #dc2626)" },
    Abstain: { bg: "var(--color-vote-abstain-muted, #fef9c3)", text: "var(--color-vote-abstain, #ca8a04)" },
  };
  const c = colors[position] || colors.Abstain;

  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.text }}
    >
      {position}
    </span>
  );
}

// ─── Position Shift Indicator ────────────────────────────────────────────────

function PositionShiftIndicator({
  previousPosition,
  currentPosition,
}: {
  previousPosition: string;
  currentPosition: string;
}) {
  if (previousPosition === currentPosition) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 6h8M7 3l3 3-3 3" />
      </svg>
      <span>
        Position shift: <strong>{previousPosition}</strong> → <strong>{currentPosition}</strong>
      </span>
    </div>
  );
}

// ─── Speech Card ─────────────────────────────────────────────────────────────

function SpeechCard({
  speech,
  isRevealing,
  revealedChars,
  previousPosition,
}: {
  speech: DebateSpeech;
  isRevealing: boolean;
  revealedChars: number;
  previousPosition?: string;
}) {
  const fullText = speech.speech;
  const displayText = isRevealing ? fullText.slice(0, revealedChars) : fullText;
  const isComplete = !isRevealing || revealedChars >= fullText.length;

  return (
    <div className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <span className="text-lg" role="img" aria-label={speech.countryName}>
            {getFlagEmoji(speech.iso3)}
          </span>
          <div>
            <div className="font-medium text-sm">{speech.countryName}</div>
            <div className="text-xs text-[var(--color-muted)]">
              {formatStrategy(speech.rhetorical_strategy)}
            </div>
          </div>
        </div>
        <PositionBadge position={speech.position} />
      </div>

      {/* Position Shift */}
      {previousPosition && previousPosition !== speech.position && (
        <div className="px-4 pt-3">
          <PositionShiftIndicator
            previousPosition={previousPosition}
            currentPosition={speech.position}
          />
        </div>
      )}

      {/* Speech Text */}
      <div className="px-4 py-3">
        <div className="text-sm leading-relaxed text-[var(--color-ink)] whitespace-pre-wrap">
          {displayText}
          {isRevealing && revealedChars < fullText.length && (
            <span className="inline-block w-0.5 h-4 bg-[var(--color-un-blue)] animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      </div>

      {/* Key Points */}
      {isComplete && speech.keyPoints.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          <div className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">
            Key Points
          </div>
          {speech.keyPoints.map((point, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-[var(--color-ink)] pl-2 py-1 border-l-2 border-[var(--color-un-blue)] bg-blue-50/50 rounded-r"
            >
              <span className="leading-relaxed">{point}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFlagEmoji(iso3: string): string {
  const iso2Map: Record<string, string> = {
    USA: "US", CHN: "CN", IND: "IN", FRA: "FR", GBR: "GB", RUS: "RU",
    BRA: "BR", SAU: "SA", DEU: "DE", JPN: "JP", NGA: "NG", MHL: "MH",
    KEN: "KE", EST: "EE", SGP: "SG", GHA: "GH", MEX: "MX", FJI: "FJ",
    IRN: "IR", ZAF: "ZA", PAK: "PK", ETH: "ET", TTO: "TT", SOM: "SO",
  };
  const code = iso2Map[iso3] || iso3.slice(0, 2);
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function formatStrategy(strategy: string): string {
  return strategy
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DebatePanel({ preset, rounds: initialRounds, onClose }: DebatePanelProps) {
  const [rounds, setRounds] = useState<DebateRound[]>(initialRounds || []);
  const [loading, setLoading] = useState(!initialRounds);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentSpeech, setCurrentSpeech] = useState(0);
  const [revealedChars, setRevealedChars] = useState(0);
  const [revealedSpeeches, setRevealedSpeeches] = useState<Set<string>>(new Set());

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch debate data for preset
  useEffect(() => {
    if (initialRounds) {
      setRounds(initialRounds);
      setLoading(false);
      return;
    }
    if (!preset) {
      setLoading(false);
      return;
    }

    async function fetchDebate() {
      try {
        setLoading(true);
        const res = await fetch("/api/debate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preset }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || data.error || "Failed to load debate");
        }

        const data = await res.json();
        const debateRounds: DebateRound[] = Array.isArray(data.debate)
          ? data.debate
          : [data.debate];
        setRounds(debateRounds);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load debate");
      } finally {
        setLoading(false);
      }
    }

    fetchDebate();
  }, [preset, initialRounds]);

  // Get current speech object
  const getCurrentSpeechObj = useCallback((): DebateSpeech | null => {
    if (rounds.length === 0) return null;
    const round = rounds[currentRound];
    if (!round) return null;
    return round.speeches[currentSpeech] || null;
  }, [rounds, currentRound, currentSpeech]);

  // Typewriter effect
  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const speechObj = getCurrentSpeechObj();
    if (!speechObj) {
      setPlaying(false);
      return;
    }

    const totalChars = speechObj.speech.length;
    const charsPerTick = 3; // characters revealed per interval tick
    const tickMs = 10; // milliseconds between ticks

    intervalRef.current = setInterval(() => {
      setRevealedChars((prev) => {
        const next = prev + charsPerTick;
        if (next >= totalChars) {
          // Speech complete - mark as revealed and advance
          const key = `${currentRound}-${currentSpeech}`;
          setRevealedSpeeches((s) => new Set(s).add(key));

          // Move to next speech after short delay
          setTimeout(() => {
            advanceToNext();
          }, 800);

          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return totalChars;
        }
        return next;
      });
    }, tickMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, currentRound, currentSpeech, rounds]);

  // Advance to next speech or round
  const advanceToNext = useCallback(() => {
    setRevealedChars(0);

    const round = rounds[currentRound];
    if (!round) {
      setPlaying(false);
      return;
    }

    if (currentSpeech < round.speeches.length - 1) {
      setCurrentSpeech((s) => s + 1);
    } else if (currentRound < rounds.length - 1) {
      setCurrentRound((r) => r + 1);
      setCurrentSpeech(0);
    } else {
      // End of all rounds
      setPlaying(false);
    }
  }, [rounds, currentRound, currentSpeech]);

  // Skip current speech
  const skipSpeech = useCallback(() => {
    const key = `${currentRound}-${currentSpeech}`;
    setRevealedSpeeches((s) => new Set(s).add(key));
    setRevealedChars(Infinity);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setTimeout(() => advanceToNext(), 200);
  }, [currentRound, currentSpeech, advanceToNext]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  // Scroll to bottom when new speeches appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentRound, currentSpeech, revealedChars]);

  // Find previous position for a country (across rounds)
  const findPreviousPosition = (
    roundIdx: number,
    iso3: string
  ): string | undefined => {
    for (let r = roundIdx - 1; r >= 0; r--) {
      const prevSpeech = rounds[r]?.speeches.find((s) => s.iso3 === iso3);
      if (prevSpeech) return prevSpeech.position;
    }
    return undefined;
  };

  // Compute total progress
  const totalSpeeches = rounds.reduce((acc, r) => acc + r.speeches.length, 0);
  const completedSpeeches = revealedSpeeches.size;
  const progress = totalSpeeches > 0 ? completedSpeeches / totalSpeeches : 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <div className="w-6 h-6 border-2 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--color-muted)]">Loading debate speeches...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-vote-no)" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p className="text-sm text-[var(--color-muted)] text-center max-w-xs">{error}</p>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <p className="text-sm text-[var(--color-muted)]">No debate data available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-sm">General Debate</h3>
            <p className="text-xs text-[var(--color-muted)]">
              Round {currentRound + 1} of {rounds.length} &middot; Speech{" "}
              {currentSpeech + 1} of {rounds[currentRound]?.speeches.length || 0}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg)] transition-colors"
              aria-label="Close debate panel"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M2 2l8 8M10 2L2 10" />
              </svg>
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--color-un-blue)] text-white hover:opacity-90 transition-opacity"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="0.5" width="3" height="9" rx="0.5" />
                <rect x="6" y="0.5" width="3" height="9" rx="0.5" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2 0.5l7 4.5-7 4.5z" />
              </svg>
            )}
          </button>

          <button
            onClick={skipSpeech}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg)] transition-colors border border-[var(--color-border)]"
            aria-label="Skip speech"
            title="Skip to next speech"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="var(--color-ink)">
              <path d="M1 1.5l5 4.5-5 4.5z" />
              <path d="M6 1.5l5 4.5-5 4.5z" />
            </svg>
          </button>

          {/* Progress bar */}
          <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-un-blue)] transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <span className="text-xs text-[var(--color-muted)] tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
            {Math.round(progress * 100)}%
          </span>
        </div>
      </div>

      {/* Debate transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {rounds.map((round, roundIdx) => (
          <div key={round.round}>
            {/* Round header */}
            {rounds.length > 1 && (
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-[var(--color-border)]" />
                <span className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">
                  Round {round.round}
                </span>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
            )}

            {/* Speeches */}
            <div className="space-y-3">
              {round.speeches.map((speech, speechIdx) => {
                const key = `${roundIdx}-${speechIdx}`;
                const isCurrentlyRevealing =
                  roundIdx === currentRound && speechIdx === currentSpeech && playing;
                const isRevealed = revealedSpeeches.has(key);
                const isPastSpeech =
                  roundIdx < currentRound ||
                  (roundIdx === currentRound && speechIdx < currentSpeech);
                const shouldShow = isRevealed || isPastSpeech || isCurrentlyRevealing ||
                  (roundIdx === currentRound && speechIdx === currentSpeech);

                if (!shouldShow) return null;

                const previousPos =
                  roundIdx > 0 ? findPreviousPosition(roundIdx, speech.iso3) : undefined;

                return (
                  <SpeechCard
                    key={key}
                    speech={speech}
                    isRevealing={isCurrentlyRevealing}
                    revealedChars={
                      isRevealed || isPastSpeech
                        ? speech.speech.length
                        : roundIdx === currentRound && speechIdx === currentSpeech
                          ? revealedChars
                          : 0
                    }
                    previousPosition={previousPos}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
