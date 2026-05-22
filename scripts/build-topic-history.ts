/**
 * Build per-country topic-specific voting history from Voeten data.
 *
 * For each country, compute their Yes/No/Abstain rates on each of the 6
 * Voeten issue categories. This fills the engine's "Topic Voting History"
 * weight (20%) with real empirical data rather than estimates.
 *
 * Output: data/topic-history.json
 * Structure: { [countryName]: { [issue]: { yes, no, abstain, total } } }
 *
 * Usage: npx tsx scripts/build-topic-history.ts
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";

// Load data
const rawVotes = readFileSync(path.join(__dirname, "../data/raw/unvotes.csv"), "utf-8");
const rawIssues = readFileSync(path.join(__dirname, "../data/raw/issues.csv"), "utf-8");
const rawRollCalls = readFileSync(path.join(__dirname, "../data/raw/roll_calls.csv"), "utf-8");

// Parse issues
const issueMap = new Map<string, string>();
const issueLines = rawIssues.split("\n");
for (let i = 1; i < issueLines.length; i++) {
  const parts = issueLines[i].split(",");
  if (parts.length >= 3) {
    issueMap.set(parts[0], parts.slice(2).join(",").replace(/"/g, "").trim());
  }
}

// Filter to recent sessions (50+)
const rcLines = rawRollCalls.split("\n");
const recentRcids = new Set<string>();
for (let i = 1; i < rcLines.length; i++) {
  const parts = rcLines[i].split(",");
  if (parts.length >= 2 && parseInt(parts[1]) >= 50) {
    recentRcids.add(parts[0]);
  }
}

// Aggregate votes by country × issue
interface TopicStats { yes: number; no: number; abstain: number; total: number }
const history = new Map<string, Map<string, TopicStats>>();

const voteLines = rawVotes.split("\n");
console.log(`Processing ${voteLines.length.toLocaleString()} vote records...`);

for (let i = 1; i < voteLines.length; i++) {
  const parts = voteLines[i].split(",");
  if (parts.length < 4) continue;

  const rcid = parts[0];
  const country = parts[1];
  const vote = parts[3]?.trim();

  if (!recentRcids.has(rcid)) continue;

  const issue = issueMap.get(rcid);
  if (!issue) continue;

  let countryTopics = history.get(country);
  if (!countryTopics) {
    countryTopics = new Map();
    history.set(country, countryTopics);
  }

  let stats = countryTopics.get(issue);
  if (!stats) {
    stats = { yes: 0, no: 0, abstain: 0, total: 0 };
    countryTopics.set(issue, stats);
  }

  if (vote === "yes") stats.yes++;
  else if (vote === "no") stats.no++;
  else if (vote === "abstain") stats.abstain++;
  stats.total++;
}

// Convert to output format with rates
interface TopicRates {
  yesRate: number;
  noRate: number;
  abstainRate: number;
  sampleSize: number;
}

const output: Record<string, Record<string, TopicRates>> = {};

for (const [country, topics] of history) {
  output[country] = {};
  for (const [issue, stats] of topics) {
    if (stats.total < 10) continue; // Need minimum sample
    output[country][issue] = {
      yesRate: stats.yes / stats.total,
      noRate: stats.no / stats.total,
      abstainRate: stats.abstain / stats.total,
      sampleSize: stats.total,
    };
  }
}

const outPath = path.join(__dirname, "../data/topic-history.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(`\n✓ Topic history for ${Object.keys(output).length} countries saved to ${outPath}`);

// Print some examples
const examples = ["United States", "China", "India", "Brazil", "Nigeria"];
for (const country of examples) {
  const data = output[country];
  if (!data) continue;
  console.log(`\n  ${country}:`);
  for (const [issue, rates] of Object.entries(data)) {
    console.log(`    ${issue.padEnd(45)} Yes=${(rates.yesRate * 100).toFixed(0)}% No=${(rates.noRate * 100).toFixed(0)}% Abs=${(rates.abstainRate * 100).toFixed(0)}% (n=${rates.sampleSize})`);
  }
}
