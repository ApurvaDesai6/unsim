"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Search, RotateCcw, Eye, EyeOff } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

interface CountrySearchResult {
  iso3: string;
  name: string;
  region: string;
}

interface GraphControlsProps {
  showAlliances: boolean;
  showRivalries: boolean;
  onToggleAlliances: () => void;
  onToggleRivalries: () => void;
  regionFilters: Record<string, boolean>;
  onToggleRegion: (region: string) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  onResetView: () => void;
  onSelectCountry: (iso3: string) => void;
  visibleNodes: number;
  visibleEdges: number;
}

// ─── Constants ────────────────────────────────────────────────────────

const REGION_COLORS: Record<string, string> = {
  AFRICAN: "#e6a817",
  APG: "#4b92db",
  EEG: "#9b59b6",
  GRULAC: "#27ae60",
  WEOG: "#e74c3c",
};

const REGION_LABELS: Record<string, string> = {
  AFRICAN: "African Group",
  APG: "Asia-Pacific",
  EEG: "Eastern European",
  GRULAC: "Latin America & Caribbean",
  WEOG: "Western European & Others",
};

// ─── Component ────────────────────────────────────────────────────────

export default function GraphControls({
  showAlliances,
  showRivalries,
  onToggleAlliances,
  onToggleRivalries,
  regionFilters,
  onToggleRegion,
  depth,
  onDepthChange,
  onResetView,
  onSelectCountry,
  visibleNodes,
  visibleEdges,
}: GraphControlsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CountrySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Search with debounce
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/kg/explore?action=search&q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowResults(true);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectResult = useCallback(
    (iso3: string) => {
      onSelectCountry(iso3);
      setShowResults(false);
      setSearchQuery("");
    },
    [onSelectCountry]
  );

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Search */}
      <div ref={searchContainerRef} className="relative">
        <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-1.5 block">
          Find Country
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            placeholder="Search by name or ISO3..."
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-un-blue)]/30 focus:border-[var(--color-un-blue)]"
          />
          {isSearching && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-[var(--color-un-blue)] border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
            {searchResults.map((result) => (
              <button
                key={result.iso3}
                onClick={() => handleSelectResult(result.iso3)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-un-blue)]/5 flex items-center gap-2 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: REGION_COLORS[result.region] || "#888" }}
                />
                <span className="truncate">{result.name}</span>
                <span className="text-[10px] text-[var(--color-muted)] ml-auto flex-shrink-0">
                  {result.iso3}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edge Toggles */}
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-2 block">
          Relationships
        </label>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={onToggleAlliances}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
              showAlliances
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-gray-50 border border-gray-200 text-gray-500"
            }`}
          >
            {showAlliances ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
            <span className="w-4 h-0.5 bg-emerald-500 rounded" />
            <span>Alliances</span>
          </button>
          <button
            onClick={onToggleRivalries}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
              showRivalries
                ? "bg-red-50 border border-red-200 text-red-800"
                : "bg-gray-50 border border-gray-200 text-gray-500"
            }`}
          >
            {showRivalries ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
            <span className="w-4 h-0.5 border-t-2 border-dashed border-red-500" />
            <span>Rivalries</span>
          </button>
        </div>
      </div>

      {/* Region Filters */}
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-2 block">
          Regional Groups
        </label>
        <div className="flex flex-col gap-1">
          {Object.entries(REGION_LABELS).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-black/[0.02] cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={regionFilters[key] !== false}
                onChange={() => onToggleRegion(key)}
                className="sr-only"
              />
              <span
                className="w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all"
                style={{
                  borderColor: REGION_COLORS[key],
                  background: regionFilters[key] !== false ? REGION_COLORS[key] : "transparent",
                }}
              >
                {regionFilters[key] !== false && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4L3.5 6L6.5 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-xs">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Depth Slider */}
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center justify-between">
          <span>Expansion Depth</span>
          <span className="text-[var(--color-un-blue)] font-bold">{depth}</span>
        </label>
        <input
          type="range"
          min={1}
          max={2}
          step={1}
          value={depth}
          onChange={(e) => onDepthChange(parseInt(e.target.value))}
          className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[var(--color-un-blue)]"
        />
        <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
          <span>Direct</span>
          <span>Extended</span>
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={onResetView}
        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border border-[var(--color-border)] hover:bg-black/[0.02] transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset View
      </button>

      {/* Stats */}
      <div className="mt-auto pt-3 border-t border-[var(--color-border)]">
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center p-2 rounded-lg bg-black/[0.02]">
            <div className="text-lg font-semibold text-[var(--color-ink)]">{visibleNodes}</div>
            <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide">Nodes</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-black/[0.02]">
            <div className="text-lg font-semibold text-[var(--color-ink)]">{visibleEdges}</div>
            <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide">Edges</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="pt-3 border-t border-[var(--color-border)]">
        <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-2 block">
          Legend
        </label>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 bg-emerald-500 rounded" />
            <span>Alliance (stronger = thicker)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 border-t-2 border-dashed border-red-500" />
            <span>Rivalry</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-white shadow-sm" />
            <span>P5 Member</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-[var(--color-un-blue)] opacity-50" />
            <span>Selected node</span>
          </div>
        </div>
      </div>
    </div>
  );
}
