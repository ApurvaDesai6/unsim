"use client";

import { useMemo, useState, useCallback } from "react";
import type { CountryVote } from "@/types";

interface HemicycleProps {
  votes: CountryVote[];
  revealedCount: number;
  onCountryHover?: (iso3: string | null) => void;
  onCountryClick?: (iso3: string) => void;
  width?: number;
  height?: number;
}

interface SeatPosition {
  x: number;
  y: number;
  iso3: string;
}

const VOTE_COLORS = {
  Yes: "var(--color-vote-yes)",
  No: "var(--color-vote-no)",
  Abstain: "var(--color-vote-abstain)",
  unrevealed: "#d4d0c8",
} as const;

function computeHemicycleLayout(count: number, width: number, height: number): { cx: number; cy: number; positions: { x: number; y: number }[] } {
  const cx = width / 2;
  const cy = height * 0.92;
  const positions: { x: number; y: number }[] = [];

  const baseRadius = Math.min(width, height) * 0.28;
  const rowSpacing = Math.min(width, height) * 0.055;

  // Determine rows needed
  const perRow = Math.ceil(Math.sqrt(count * 1.8));
  let placed = 0;
  let row = 0;

  while (placed < count) {
    const radius = baseRadius + row * rowSpacing;
    const seatsInRow = Math.min(perRow + row * 2, count - placed);
    const arcSpan = Math.PI * 0.88;
    const arcStart = Math.PI * 0.06;

    for (let i = 0; i < seatsInRow && placed < count; i++) {
      const angle = arcStart + (i / Math.max(seatsInRow - 1, 1)) * arcSpan;
      positions.push({
        x: cx - Math.cos(angle) * radius,
        y: cy - Math.sin(angle) * radius,
      });
      placed++;
    }
    row++;
  }

  return { cx, cy, positions };
}

export default function Hemicycle({
  votes,
  revealedCount,
  onCountryHover,
  onCountryClick,
  width = 800,
  height = 450,
}: HemicycleProps) {
  const [hoveredSeat, setHoveredSeat] = useState<string | null>(null);

  const sortedVotes = useMemo(() => {
    return [...votes].sort((a, b) => {
      const order = { Yes: 0, Abstain: 1, No: 2 };
      return order[a.vote] - order[b.vote];
    });
  }, [votes]);

  const layout = useMemo(
    () => computeHemicycleLayout(sortedVotes.length, width, height),
    [sortedVotes.length, width, height],
  );

  const seats: SeatPosition[] = useMemo(
    () =>
      sortedVotes.map((v, i) => ({
        ...layout.positions[i],
        iso3: v.iso3,
      })),
    [sortedVotes, layout],
  );

  const seatRadius = Math.max(3, Math.min(7, 300 / Math.sqrt(votes.length)));

  const handleHover = useCallback(
    (iso3: string | null) => {
      setHoveredSeat(iso3);
      onCountryHover?.(iso3);
    },
    [onCountryHover],
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Hemicycle visualization showing ${votes.length} country votes`}
    >
      {/* Podium arc */}
      <path
        d={`M ${width * 0.15} ${height * 0.95} A ${width * 0.35} ${width * 0.35} 0 0 1 ${width * 0.85} ${height * 0.95}`}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="1"
        opacity="0.5"
      />

      {/* Seats */}
      {seats.map((seat, i) => {
        const vote = sortedVotes[i];
        const isRevealed = i < revealedCount;
        const isHovered = hoveredSeat === seat.iso3;
        const color = isRevealed ? VOTE_COLORS[vote.vote] : VOTE_COLORS.unrevealed;

        return (
          <circle
            key={seat.iso3}
            cx={seat.x}
            cy={seat.y}
            r={isHovered ? seatRadius * 1.6 : seatRadius}
            fill={color}
            opacity={isRevealed ? (isHovered ? 1 : 0.85) : 0.4}
            stroke={isHovered ? "var(--color-ink)" : "none"}
            strokeWidth={isHovered ? 1.5 : 0}
            style={{ transition: "r 150ms ease, opacity 200ms ease, fill 300ms ease" }}
            onMouseEnter={() => handleHover(seat.iso3)}
            onMouseLeave={() => handleHover(null)}
            onClick={() => onCountryClick?.(seat.iso3)}
            cursor="pointer"
          >
            <title>{`${vote.name}: ${isRevealed ? vote.vote : "Not yet revealed"}`}</title>
          </circle>
        );
      })}

      {/* Center label */}
      <text
        x={layout.cx}
        y={height * 0.98}
        textAnchor="middle"
        className="text-[10px] fill-[var(--color-muted)]"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {revealedCount < votes.length
          ? `Revealing... ${revealedCount}/${votes.length}`
          : `${votes.length} votes cast`}
      </text>
    </svg>
  );
}
