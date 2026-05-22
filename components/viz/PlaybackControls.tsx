"use client";

import type { SimulationPhase } from "@/types";

interface PlaybackControlsProps {
  playing: boolean;
  speed: number;
  phase: SimulationPhase;
  progress: number;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (progress: number) => void;
}

const SPEEDS = [0.5, 1, 2, 4];

const PHASE_LABELS: Record<SimulationPhase, string> = {
  analyzing: "Analyzing Resolution",
  computing_positions: "Computing Positions",
  debating: "Debate in Progress",
  voting: "Voting",
  complete: "Complete",
};

export default function PlaybackControls({
  playing,
  speed,
  phase,
  progress,
  onTogglePlay,
  onSpeedChange,
  onSeek,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-white border border-[var(--color-border)] shadow-sm">
      {/* Play/Pause */}
      <button
        onClick={onTogglePlay}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg)] transition-colors"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--color-ink)">
            <rect x="2" y="1" width="3.5" height="12" rx="1" />
            <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--color-ink)">
            <path d="M3 1.5l9 5.5-9 5.5z" />
          </svg>
        )}
      </button>

      {/* Progress bar */}
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)] relative cursor-pointer group">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-un-blue)] transition-all duration-100"
          style={{ width: `${progress * 100}%` }}
        />
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={progress}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          aria-label="Simulation progress"
        />
      </div>

      {/* Phase label */}
      <span className="text-xs font-medium text-[var(--color-muted)] min-w-[140px] text-right">
        {PHASE_LABELS[phase]}
      </span>

      {/* Speed control */}
      <div className="flex items-center gap-1 border-l border-[var(--color-border)] pl-3">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              speed === s
                ? "bg-[var(--color-un-blue)] text-white"
                : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
