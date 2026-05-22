"use client";

import type { CountryProfile, CountryVote, PositionFactor } from "@/types";

interface CountryPanelProps {
  country: CountryProfile;
  vote?: CountryVote;
  onClose: () => void;
}

function FactorBar({ factor }: { factor: PositionFactor }) {
  const normalizedScore = (factor.score + 1) / 2;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--color-muted)]">{factor.name}</span>
        <span className="font-medium tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
          {(factor.score * 100).toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${normalizedScore * 100}%`,
            background:
              factor.score > 0
                ? "var(--color-vote-yes)"
                : factor.score < 0
                  ? "var(--color-vote-no)"
                  : "var(--color-vote-abstain)",
          }}
        />
      </div>
    </div>
  );
}

export default function CountryPanel({ country, vote, onClose }: CountryPanelProps) {
  return (
    <div className="fixed right-0 top-0 h-full w-[380px] bg-white border-l border-[var(--color-border)] shadow-xl z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-[var(--color-border)] px-5 py-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{country.name}</h3>
          <p className="text-xs text-[var(--color-muted)]">
            {country.region} · {country.governmentType}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg)] transition-colors"
          aria-label="Close panel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" fill="none">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-6">
        {/* Vote result */}
        {vote && (
          <div className="p-4 rounded-xl bg-[var(--color-bg)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Predicted Vote</span>
              <span
                className="text-sm font-semibold px-2.5 py-0.5 rounded-full"
                style={{
                  background:
                    vote.vote === "Yes"
                      ? "var(--color-vote-yes-muted)"
                      : vote.vote === "No"
                        ? "var(--color-vote-no-muted)"
                        : "var(--color-vote-abstain-muted)",
                  color:
                    vote.vote === "Yes"
                      ? "var(--color-vote-yes)"
                      : vote.vote === "No"
                        ? "var(--color-vote-no)"
                        : "var(--color-vote-abstain)",
                }}
              >
                {vote.vote}
              </span>
            </div>

            {/* Probability breakdown */}
            <div className="flex gap-3 text-xs">
              <div className="flex-1 text-center p-2 rounded-lg bg-white">
                <div className="font-semibold text-[var(--color-vote-yes)]">
                  {(vote.probability.yes * 100).toFixed(0)}%
                </div>
                <div className="text-[var(--color-muted)]">Yes</div>
              </div>
              <div className="flex-1 text-center p-2 rounded-lg bg-white">
                <div className="font-semibold text-[var(--color-vote-no)]">
                  {(vote.probability.no * 100).toFixed(0)}%
                </div>
                <div className="text-[var(--color-muted)]">No</div>
              </div>
              <div className="flex-1 text-center p-2 rounded-lg bg-white">
                <div className="font-semibold text-[var(--color-vote-abstain)]">
                  {(vote.probability.abstain * 100).toFixed(0)}%
                </div>
                <div className="text-[var(--color-muted)]">Abstain</div>
              </div>
            </div>
          </div>
        )}

        {/* Reasoning factors */}
        {vote && vote.factors.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Position Factors</h4>
            <div className="space-y-3">
              {vote.factors.map((f) => (
                <FactorBar key={f.name} factor={f} />
              ))}
            </div>
          </div>
        )}

        {/* Country stats */}
        <div>
          <h4 className="text-sm font-medium mb-3">Profile</h4>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[var(--color-muted)] text-xs">Ideal Point</dt>
              <dd className="font-medium tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                {country.idealPoint.toFixed(3)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)] text-xs">Democracy Index</dt>
              <dd className="font-medium tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                {country.democracyIndex.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)] text-xs">Total Votes</dt>
              <dd className="font-medium">{country.votingHistory.totalVotes.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)] text-xs">SC Status</dt>
              <dd className="font-medium capitalize">{country.scStatus}</dd>
            </div>
          </dl>
        </div>

        {/* Bloc memberships */}
        {country.blocs.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Bloc Memberships</h4>
            <div className="flex flex-wrap gap-1.5">
              {country.blocs.map((bloc) => (
                <span
                  key={bloc}
                  className="text-xs px-2 py-1 rounded-md bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]"
                >
                  {bloc}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Policy dimensions */}
        <div>
          <h4 className="text-sm font-medium mb-3">Policy Dimensions</h4>
          <div className="space-y-2">
            {Object.entries(country.policyDimensions).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted)] w-28 capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)] relative">
                  <div
                    className="absolute top-0 h-full rounded-full bg-[var(--color-un-blue)]"
                    style={{
                      left: "50%",
                      width: `${Math.abs(value) * 50}%`,
                      transform: value < 0 ? "translateX(-100%)" : "none",
                    }}
                  />
                  <div className="absolute top-1/2 left-1/2 w-px h-3 -translate-y-1/2 bg-[var(--color-border)]" />
                </div>
                <span
                  className="text-xs font-medium tabular-nums w-8 text-right"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {value > 0 ? "+" : ""}{value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
