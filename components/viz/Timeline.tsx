"use client";

import { useState, useEffect, useRef } from "react";

interface TimelinePoint {
  year: number;
  era: string;
  eraDescription: string;
  keyEvents: string[];
  totals: { yes: number; no: number; abstain: number };
  passed: boolean;
  delta: { yes: number; no: number; abstain: number };
  notableShifts: { iso3: string; name: string; from: string; to: string; reason: string }[];
}

interface TimelineProps {
  data: TimelinePoint[] | null;
  baseYear: number;
  baseTotals: { yes: number; no: number; abstain: number } | null;
  isLoading: boolean;
  onYearSelect: (year: number) => void;
  selectedYear: number | null;
}

export default function Timeline({ data, baseYear, baseTotals, isLoading, onYearSelect, selectedYear }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <div className="p-4 rounded-xl border border-[var(--color-border)] bg-white animate-pulse">
        <div className="h-4 bg-[var(--color-bg)] rounded w-1/3 mb-3" />
        <div className="h-24 bg-[var(--color-bg)] rounded" />
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  const maxTotal = Math.max(...data.map((d) => d.totals.yes + d.totals.no + d.totals.abstain), 193);
  const selected = data.find((d) => d.year === selectedYear);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Temporal Simulation</h3>
          <p className="text-[10px] text-[var(--color-muted)]">How would this resolution fare across different geopolitical eras?</p>
        </div>
        {selected && (
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-un-blue)]/10 text-[var(--color-un-blue)] font-medium">
            {selected.era}
          </span>
        )}
      </div>

      {/* Timeline Chart */}
      <div className="px-4 py-4" ref={containerRef}>
        <div className="flex items-end gap-1 h-32">
          {data.map((point) => {
            const isSelected = point.year === selectedYear;
            const total = point.totals.yes + point.totals.no + point.totals.abstain;
            const yesH = (point.totals.yes / maxTotal) * 100;
            const noH = (point.totals.no / maxTotal) * 100;
            const abstainH = (point.totals.abstain / maxTotal) * 100;

            return (
              <button
                key={point.year}
                onClick={() => onYearSelect(point.year)}
                className={`flex-1 flex flex-col items-stretch gap-px rounded-t transition-all ${isSelected ? "ring-2 ring-[var(--color-un-blue)] ring-offset-1" : "hover:opacity-80"}`}
                title={`${point.year}: Yes ${point.totals.yes} / No ${point.totals.no} / Abstain ${point.totals.abstain}`}
              >
                <div style={{ height: `${yesH}%`, minHeight: point.totals.yes > 0 ? "2px" : 0 }} className="bg-[var(--color-vote-yes)] rounded-t-sm transition-all" />
                <div style={{ height: `${abstainH}%`, minHeight: point.totals.abstain > 0 ? "2px" : 0 }} className="bg-[var(--color-vote-abstain)] transition-all" />
                <div style={{ height: `${noH}%`, minHeight: point.totals.no > 0 ? "2px" : 0 }} className="bg-[var(--color-vote-no)] rounded-b-sm transition-all" />
              </button>
            );
          })}
        </div>

        {/* Year labels */}
        <div className="flex gap-1 mt-1">
          {data.map((point) => (
            <div key={point.year} className={`flex-1 text-center text-[8px] ${point.year === selectedYear ? "text-[var(--color-un-blue)] font-bold" : "text-[var(--color-muted)]"}`}>
              {point.year % 5 === 0 || point.year === selectedYear ? point.year : ""}
            </div>
          ))}
        </div>

        {/* Era bands */}
        <div className="flex gap-px mt-2 h-1.5 rounded overflow-hidden">
          {data.map((point, i) => {
            const eraColors: Record<string, string> = {
              "Cold War Peak": "#6b7280",
              "Post-Cold War Optimism": "#3b82f6",
              "War on Terror": "#ef4444",
              "Multipolar Transition": "#f59e0b",
              "New Cold War": "#8b5cf6",
            };
            return (
              <div
                key={i}
                className="flex-1"
                style={{ background: eraColors[point.era] || "#d1d5db" }}
                title={point.era}
              />
            );
          })}
        </div>
      </div>

      {/* Selected year detail */}
      {selected && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold">{selected.year}</span>
              <span className="text-xs text-[var(--color-muted)] ml-2">{selected.era}</span>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${selected.passed ? "bg-[var(--color-vote-yes-muted)] text-[var(--color-vote-yes)]" : "bg-[var(--color-vote-no-muted)] text-[var(--color-vote-no)]"}`}>
              {selected.passed ? "Would Pass" : "Would Fail"}
            </span>
          </div>

          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">{selected.eraDescription}</p>

          {/* Delta from base */}
          {baseTotals && (
            <div className="flex gap-3 text-[10px]">
              <span className={selected.delta.yes >= 0 ? "text-[var(--color-vote-yes)]" : "text-[var(--color-vote-no)]"}>
                Yes: {selected.delta.yes >= 0 ? "+" : ""}{selected.delta.yes}
              </span>
              <span className={selected.delta.no >= 0 ? "text-[var(--color-vote-no)]" : "text-[var(--color-vote-yes)]"}>
                No: {selected.delta.no >= 0 ? "+" : ""}{selected.delta.no}
              </span>
              <span className="text-[var(--color-muted)]">
                vs. {baseYear} baseline
              </span>
            </div>
          )}

          {/* Notable shifts */}
          {selected.notableShifts.length > 0 && (
            <div>
              <div className="text-[9px] font-semibold text-[var(--color-muted)] uppercase mb-1">Notable Position Shifts</div>
              {selected.notableShifts.slice(0, 4).map((shift) => (
                <div key={shift.iso3} className="flex items-center gap-2 text-[11px] py-0.5">
                  <span className="font-medium">{shift.name}</span>
                  <span className="text-[var(--color-muted)]">
                    <span style={{ color: shift.from === "Yes" ? "var(--color-vote-yes)" : shift.from === "No" ? "var(--color-vote-no)" : "var(--color-vote-abstain)" }}>{shift.from}</span>
                    {" → "}
                    <span style={{ color: shift.to === "Yes" ? "var(--color-vote-yes)" : shift.to === "No" ? "var(--color-vote-no)" : "var(--color-vote-abstain)" }}>{shift.to}</span>
                  </span>
                  <span className="text-[9px] text-[var(--color-muted)]">({shift.reason})</span>
                </div>
              ))}
            </div>
          )}

          {/* Key events */}
          {selected.keyEvents.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selected.keyEvents.map((event) => (
                <span key={event} className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-[var(--color-border)] text-[var(--color-muted)]">
                  {event}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
