import { readFileSync } from "fs";
import path from "path";
import Link from "next/link";

interface ValidationReport {
  meta: {
    generatedAt: string;
    engineVersion: string;
    dataSource: string;
    dataUrl: string;
    originalSource: string;
    totalPredictions: number;
    resolutionsEvaluated: number;
  };
  overall: {
    perVoteAccuracy: number;
    resolutionOutcomeAccuracy: number;
    correctPredictions: number;
    totalPredictions: number;
  };
  perClass: Record<string, { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }>;
  byIssue: Record<string, { accuracy: number; total: number; correct: number }>;
  byRegion: Record<string, { accuracy: number; total: number; correct: number }>;
  calibration: { bucketMin: number; bucketMax: number; avgPredictedProbability: number; actualRate: number; count: number }[];
  methodology: { approach: string; weights: string; limitations: string[]; plannedImprovements: string[] };
}

function loadReport(): ValidationReport | null {
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "data", "validation-report-large.json"),
      "utf-8",
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function MetricCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white">
      <div className="text-xs font-medium text-[var(--color-muted)] mb-1">{label}</div>
      <div className="text-2xl font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
        {value}
      </div>
      {subtext && <div className="text-xs text-[var(--color-muted)] mt-1">{subtext}</div>}
    </div>
  );
}

function BarChart({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${(value / max) * 100}%`, background: color }}
      />
    </div>
  );
}

export default function MethodologyPage() {
  const report = loadReport();

  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="bg-white border-b border-[var(--color-border)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            &larr; Back to UNSim
          </Link>
          <span className="text-xs text-[var(--color-muted)]">
            Last validated: {report?.meta.generatedAt ? new Date(report.meta.generatedAt).toLocaleDateString() : "N/A"}
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-16 space-y-20">
        {/* Title */}
        <section>
          <h1
            className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Methodology &amp; Validation
          </h1>
          <p className="text-lg text-[var(--color-muted)] leading-relaxed max-w-2xl">
            UNSim's predictions are validated against{" "}
            <strong className="text-[var(--color-ink)]">
              {report?.meta.totalPredictions?.toLocaleString() || "181,000+"}
            </strong>{" "}
            real recorded votes from the UN General Assembly. Here's how the engine works
            and how it performs.
          </p>
        </section>

        {/* Key Metrics */}
        {report && (
          <section>
            <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
              01 · Performance at a glance
            </div>
            <h2 className="text-2xl font-semibold mb-8" style={{ fontFamily: "var(--font-serif)" }}>
              Validation Results
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <MetricCard
                label="Per-Vote Accuracy"
                value={`${(report.overall.perVoteAccuracy * 100).toFixed(1)}%`}
                subtext={`${report.overall.correctPredictions.toLocaleString()} / ${report.overall.totalPredictions.toLocaleString()} correct`}
              />
              <MetricCard
                label="Resolution Outcome"
                value={`${(report.overall.resolutionOutcomeAccuracy * 100).toFixed(1)}%`}
                subtext="Pass/fail prediction"
              />
              <MetricCard
                label="Resolutions Tested"
                value={report.meta.resolutionsEvaluated.toLocaleString()}
                subtext="Sessions 60–74 (2005–2019)"
              />
              <MetricCard
                label="Yes-Vote F1"
                value={`${(report.perClass.yes.f1 * 100).toFixed(1)}%`}
                subtext={`P=${(report.perClass.yes.precision * 100).toFixed(0)}% R=${(report.perClass.yes.recall * 100).toFixed(0)}%`}
              />
            </div>

            {/* Per-class breakdown */}
            <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white">
              <h3 className="text-sm font-medium mb-4">Per-Class Performance</h3>
              <div className="space-y-4">
                {(["yes", "no", "abstain"] as const).map((cls) => {
                  const data = report.perClass[cls];
                  return (
                    <div key={cls}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium capitalize">{cls}</span>
                        <span className="text-[var(--color-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
                          F1 = {(data.f1 * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-[var(--color-muted)]">
                        <div>
                          <span>Precision: {(data.precision * 100).toFixed(1)}%</span>
                          <BarChart
                            value={data.precision}
                            max={1}
                            color={cls === "yes" ? "var(--color-vote-yes)" : cls === "no" ? "var(--color-vote-no)" : "var(--color-vote-abstain)"}
                          />
                        </div>
                        <div>
                          <span>Recall: {(data.recall * 100).toFixed(1)}%</span>
                          <BarChart
                            value={data.recall}
                            max={1}
                            color={cls === "yes" ? "var(--color-vote-yes)" : cls === "no" ? "var(--color-vote-no)" : "var(--color-vote-abstain)"}
                          />
                        </div>
                        <div>
                          <span>TP: {data.tp.toLocaleString()} | FP: {data.fp.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Accuracy by Issue */}
        {report && (
          <section>
            <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
              02 · Breakdown by topic
            </div>
            <h2 className="text-2xl font-semibold mb-6" style={{ fontFamily: "var(--font-serif)" }}>
              Performance by Issue Area
            </h2>
            <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white space-y-3">
              {Object.entries(report.byIssue)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([issue, data]) => (
                  <div key={issue} className="flex items-center gap-3">
                    <span className="text-sm w-[280px] truncate">{issue}</span>
                    <div className="flex-1">
                      <BarChart value={data.accuracy} max={1} color="var(--color-un-blue)" />
                    </div>
                    <span className="text-xs text-[var(--color-muted)] w-20 text-right" style={{ fontFamily: "var(--font-mono)" }}>
                      {(data.accuracy * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-[var(--color-muted)] w-24 text-right">
                      n={data.total.toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Accuracy by Region */}
        {report && (
          <section>
            <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
              03 · Regional performance
            </div>
            <h2 className="text-2xl font-semibold mb-6" style={{ fontFamily: "var(--font-serif)" }}>
              Performance by Regional Group
            </h2>
            <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white space-y-3">
              {Object.entries(report.byRegion)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([region, data]) => {
                  const labels: Record<string, string> = {
                    APG: "Asia-Pacific Group",
                    AFRICAN: "African Group",
                    WEOG: "Western European & Others",
                    GRULAC: "Latin American & Caribbean",
                    EEG: "Eastern European Group",
                  };
                  return (
                    <div key={region} className="flex items-center gap-3">
                      <span className="text-sm w-[220px]">{labels[region] || region}</span>
                      <div className="flex-1">
                        <BarChart value={data.accuracy} max={1} color="var(--color-un-blue)" />
                      </div>
                      <span className="text-xs text-[var(--color-muted)] w-20 text-right" style={{ fontFamily: "var(--font-mono)" }}>
                        {(data.accuracy * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs text-[var(--color-muted)] w-24 text-right">
                        n={data.total.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-3 leading-relaxed">
              WEOG and EEG accuracy is lower because these groups vote No/Abstain more frequently,
              and the current model (v0.1) has weaker minority-class prediction. This is a known
              limitation being addressed with topic-specific voting history and bilateral relation modeling.
            </p>
          </section>
        )}

        {/* How the Engine Works */}
        <section>
          <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
            04 · Under the hood
          </div>
          <h2 className="text-2xl font-semibold mb-6" style={{ fontFamily: "var(--font-serif)" }}>
            How the Simulation Engine Works
          </h2>

          <div className="space-y-6">
            <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white">
              <h3 className="text-sm font-medium mb-3">Position Computation Pipeline</h3>
              <ol className="space-y-2 text-sm text-[var(--color-muted)] leading-relaxed">
                <li><strong className="text-[var(--color-ink)]">1. Resolution Analysis:</strong> AI parses the resolution into policy dimensions (sovereignty, human rights, development, security, environment, decolonization) with weighted emphasis.</li>
                <li><strong className="text-[var(--color-ink)]">2. Ideal Point Alignment (25%):</strong> Compares country's empirical left-right position (from Voeten ideal point estimates) against the resolution's aggregate position.</li>
                <li><strong className="text-[var(--color-ink)]">3. Policy Dimension Matching (30%):</strong> Weighted dot product between country's 6-dimensional policy profile and the resolution's dimensional emphasis. Dimensions with stronger resolution language contribute more.</li>
                <li><strong className="text-[var(--color-ink)]">4. Topic Voting History (20%):</strong> Historical Yes/No/Abstain rates for the country on the resolution's topic categories (6 Voeten issue areas).</li>
                <li><strong className="text-[var(--color-ink)]">5. Bloc Coordination (15%):</strong> Two-pass algorithm. First pass computes independent positions; second pass applies peer pressure from bloc partners weighted by bloc cohesion scores.</li>
                <li><strong className="text-[var(--color-ink)]">6. Bilateral Relations (10%):</strong> Alliance and rivalry modifiers based on voting similarity patterns. (Planned for v0.2)</li>
                <li><strong className="text-[var(--color-ink)]">7. Vote Decision:</strong> Composite score fed through softmax3 to produce probability distribution [P(Yes), P(No), P(Abstain)]. Abstain probability is boosted for countries with weak signals or cross-pressures.</li>
              </ol>
            </div>

            <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white">
              <h3 className="text-sm font-medium mb-3">Data Sources</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-medium">Erik Voeten, "United Nations General Assembly Voting Data"</dt>
                  <dd className="text-[var(--color-muted)]">
                    Harvard Dataverse, doi:10.7910/DVN/LEJUQZ. 6,202 roll-call votes, 869,937 individual country-votes, 1946–2019. Provides ideal point estimates and per-resolution voting records.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">V-Dem (Varieties of Democracy) v14</dt>
                  <dd className="text-[var(--color-muted)]">
                    Democracy indicators for 202 countries. Used for polyarchy scores, regime classification, and behavioral trait calibration.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">UN Digital Library</dt>
                  <dd className="text-[var(--color-muted)]">
                    Official resolution texts and voting records for recent sessions (post-2019) used in targeted validation.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Security Council Veto List</dt>
                  <dd className="text-[var(--color-muted)]">
                    Complete veto history since 1946 for P5 behavioral calibration.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* Limitations & Roadmap */}
        <section>
          <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
            05 · Honest limitations
          </div>
          <h2 className="text-2xl font-semibold mb-6" style={{ fontFamily: "var(--font-serif)" }}>
            Known Limitations
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white">
              <h3 className="text-sm font-medium mb-3 text-[var(--color-vote-no)]">Current Weaknesses</h3>
              <ul className="space-y-2 text-sm text-[var(--color-muted)]">
                <li>No/Abstain prediction is weak (F1 ~14–17%) — minority class problem</li>
                <li>WEOG countries poorly predicted — they vote No more often on Global South resolutions</li>
                <li>Static ideal points — doesn't capture position drift over time</li>
                <li>No bilateral relations model — misses US-Israel alignment, Russia-Syria, etc.</li>
                <li>Resolution language not analyzed per-clause — same issue vector for all resolutions in a category</li>
                <li>Cannot model last-minute diplomatic pressure or vote trading</li>
              </ul>
            </div>
            <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white">
              <h3 className="text-sm font-medium mb-3 text-[var(--color-vote-yes)]">Planned Improvements</h3>
              <ul className="space-y-2 text-sm text-[var(--color-muted)]">
                <li>Per-resolution text analysis → unique policy vectors</li>
                <li>Temporal ideal point tracking (yearly drift detection)</li>
                <li>Full topic-specific voting history from Voeten data</li>
                <li>Bilateral similarity scores from vote-correlation matrices</li>
                <li>Knowledge graph with treaty obligations as hard constraints</li>
                <li>Clause-level sensitivity analysis (language strength → vote shifts)</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Reproducibility */}
        <section className="pb-8">
          <div className="text-[13px] font-medium text-[var(--color-muted)] tracking-tight mb-2">
            06 · Reproducibility
          </div>
          <h2 className="text-2xl font-semibold mb-6" style={{ fontFamily: "var(--font-serif)" }}>
            Run It Yourself
          </h2>
          <div className="p-5 rounded-xl border border-[var(--color-border)] bg-white">
            <pre className="text-sm overflow-x-auto" style={{ fontFamily: "var(--font-mono)" }}>
{`# Clone the repo
git clone https://github.com/[your-repo]/unsim-v2
cd unsim-v2

# Build country profiles (193 nations)
npx tsx scripts/build-country-profiles.ts

# Download Voeten/TidyTuesday voting data (870K votes)
mkdir -p data/raw
curl -o data/raw/unvotes.csv https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2021/2021-03-23/unvotes.csv
curl -o data/raw/roll_calls.csv https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2021/2021-03-23/roll_calls.csv
curl -o data/raw/issues.csv https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2021/2021-03-23/issues.csv

# Run large-scale validation (181K predictions)
npx tsx scripts/validate-large-scale.ts

# Run targeted validation (6 recent resolutions, manual comparison)
npx tsx scripts/validate-against-real-votes.ts`}
            </pre>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] bg-white">
        <div className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-[var(--color-muted)]">
          <span>UNSim — Educational Simulation Platform</span>
          <span>Engine v0.1 · Validated {new Date().toISOString().split("T")[0]}</span>
        </div>
      </footer>
    </main>
  );
}
