"use client";

interface VoteTallyProps {
  yes: number;
  no: number;
  abstain: number;
  threshold: number;
  total: number;
  passed?: boolean;
  vetoedBy?: string[];
}

export default function VoteTally({
  yes,
  no,
  abstain,
  threshold,
  total,
  passed,
  vetoedBy,
}: VoteTallyProps) {
  const voting = yes + no;
  const passPercent = voting > 0 ? yes / voting : 0;
  const thresholdPercent = threshold;

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="relative h-8 rounded-lg overflow-hidden bg-[var(--color-bg)]">
        {/* Yes portion */}
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
          style={{
            width: `${(yes / total) * 100}%`,
            background: "var(--color-vote-yes)",
          }}
        />
        {/* Abstain portion */}
        <div
          className="absolute inset-y-0 transition-all duration-500 ease-out"
          style={{
            left: `${(yes / total) * 100}%`,
            width: `${(abstain / total) * 100}%`,
            background: "var(--color-vote-abstain)",
          }}
        />
        {/* No portion */}
        <div
          className="absolute inset-y-0 right-0 transition-all duration-500 ease-out"
          style={{
            width: `${(no / total) * 100}%`,
            background: "var(--color-vote-no)",
          }}
        />

        {/* Threshold marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--color-ink)] z-10"
          style={{ left: `${thresholdPercent * 100}%` }}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-[var(--color-muted)] whitespace-nowrap">
            {Math.round(thresholdPercent * 100)}% needed
          </div>
        </div>
      </div>

      {/* Numbers */}
      <div className="flex justify-between items-center text-sm">
        <div className="flex gap-5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-vote-yes)]" />
            <span className="font-semibold">{yes}</span>
            <span className="text-[var(--color-muted)]">Yes</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-vote-no)]" />
            <span className="font-semibold">{no}</span>
            <span className="text-[var(--color-muted)]">No</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-vote-abstain)]" />
            <span className="font-semibold">{abstain}</span>
            <span className="text-[var(--color-muted)]">Abstain</span>
          </span>
        </div>

        {passed !== undefined && (
          <div className="flex items-center gap-2">
            {vetoedBy && vetoedBy.length > 0 ? (
              <span className="text-xs font-semibold text-[var(--color-vote-no)] bg-[var(--color-vote-no-muted)] px-2.5 py-1 rounded-full">
                VETOED by {vetoedBy.join(", ")}
              </span>
            ) : passed ? (
              <span className="text-xs font-semibold text-[var(--color-vote-yes)] bg-[var(--color-vote-yes-muted)] px-2.5 py-1 rounded-full">
                ADOPTED
              </span>
            ) : (
              <span className="text-xs font-semibold text-[var(--color-vote-no)] bg-[var(--color-vote-no-muted)] px-2.5 py-1 rounded-full">
                NOT ADOPTED
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
