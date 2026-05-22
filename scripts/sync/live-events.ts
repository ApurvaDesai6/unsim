/**
 * Live Event Sync — pulls current geopolitical events from open sources
 * and enriches the knowledge graph with temporal context.
 *
 * Sources (all free, no API key required):
 * 1. GDELT Project — real-time event monitoring from global news
 *    API: https://api.gdeltproject.org/api/v2/doc/doc
 * 2. UN News RSS — official UN press releases
 *    Feed: https://news.un.org/feed/subscribe/en/news/all/rss.xml
 * 3. ReliefWeb API — humanitarian crises
 *    API: https://api.reliefweb.int/v1/reports
 *
 * Output: data/live-events.json — recent geopolitical events that could
 * affect voting patterns, with country linkages and impact estimates.
 *
 * Run via: npx tsx scripts/sync/live-events.ts
 * Or via GitHub Action (scheduled, every 6 hours)
 */

interface GDELTEvent {
  url: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

interface LiveEvent {
  id: string;
  title: string;
  date: string;
  source: string;
  sourceUrl: string;
  countries: string[];
  type: "conflict" | "agreement" | "crisis" | "diplomatic" | "vote" | "other";
  relevance: number;
  summary?: string;
}

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  USA: ["united states", "washington", "biden", "trump", "u.s.", "american"],
  CHN: ["china", "beijing", "chinese", "xi jinping"],
  RUS: ["russia", "moscow", "putin", "russian", "kremlin"],
  GBR: ["united kingdom", "britain", "british", "london", "uk"],
  FRA: ["france", "paris", "french", "macron"],
  IND: ["india", "new delhi", "indian", "modi"],
  BRA: ["brazil", "brasilia", "brazilian", "lula"],
  ISR: ["israel", "israeli", "tel aviv", "netanyahu", "gaza"],
  IRN: ["iran", "iranian", "tehran"],
  UKR: ["ukraine", "ukrainian", "kyiv", "zelensky"],
  SAU: ["saudi arabia", "saudi", "riyadh"],
  NGA: ["nigeria", "nigerian", "abuja"],
  ZAF: ["south africa", "pretoria", "south african"],
  EGY: ["egypt", "egyptian", "cairo"],
  TUR: ["turkey", "turkish", "ankara", "erdogan"],
};

const EVENT_TYPE_KEYWORDS: Record<string, string[]> = {
  conflict: ["war", "attack", "strike", "military", "troops", "bomb", "invasion", "killed"],
  agreement: ["treaty", "agreement", "signed", "deal", "accord", "pact", "cooperation"],
  crisis: ["crisis", "humanitarian", "refugee", "famine", "disaster", "emergency"],
  diplomatic: ["ambassador", "summit", "diplomatic", "foreign minister", "sanctions", "embassy"],
  vote: ["resolution", "vote", "general assembly", "security council", "veto", "adopted"],
};

function detectCountries(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [iso3, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) found.push(iso3);
  }
  return found;
}

function detectEventType(text: string): "conflict" | "agreement" | "crisis" | "diplomatic" | "vote" | "other" {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return type as any;
  }
  return "other";
}

async function fetchGDELT(): Promise<LiveEvent[]> {
  const events: LiveEvent[] = [];
  try {
    // GDELT DOC 2.0 API — search for UN-related news
    const queries = [
      "united nations vote resolution",
      "security council veto",
      "general assembly resolution",
      "international sanctions",
    ];

    for (const query of queries) {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=10&format=json&timespan=7d`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const data = await res.json();
      const articles = data.articles || [];

      for (const article of articles.slice(0, 5)) {
        const countries = detectCountries(article.title || "");
        if (countries.length === 0) continue;
        events.push({
          id: `gdelt-${Buffer.from(article.url || "").toString("base64").slice(0, 12)}`,
          title: article.title || "Untitled",
          date: article.seendate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          source: "GDELT",
          sourceUrl: article.url || "",
          countries,
          type: detectEventType(article.title || ""),
          relevance: countries.length > 1 ? 0.8 : 0.5,
        });
      }
    }
  } catch (e) {
    console.warn("GDELT fetch failed:", e);
  }
  return events;
}

async function fetchUNNews(): Promise<LiveEvent[]> {
  const events: LiveEvent[] = [];
  try {
    const res = await fetch("https://news.un.org/feed/subscribe/en/news/all/rss.xml", { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return events;
    const xml = await res.text();

    // Simple XML parse for RSS items
    const items = xml.split("<item>").slice(1, 11);
    for (const item of items) {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      if (!titleMatch) continue;

      const title = titleMatch[1];
      const countries = detectCountries(title);
      events.push({
        id: `un-news-${Buffer.from(title).toString("base64").slice(0, 12)}`,
        title,
        date: dateMatch ? new Date(dateMatch[1]).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        source: "UN News",
        sourceUrl: linkMatch?.[1] || "https://news.un.org",
        countries,
        type: detectEventType(title),
        relevance: countries.length > 0 ? 0.7 : 0.3,
      });
    }
  } catch (e) {
    console.warn("UN News fetch failed:", e);
  }
  return events;
}

async function fetchReliefWeb(): Promise<LiveEvent[]> {
  const events: LiveEvent[] = [];
  try {
    const res = await fetch("https://api.reliefweb.int/v1/reports?appname=unsim&limit=10&preset=latest&fields[include][]=title&fields[include][]=date.created&fields[include][]=country.iso3&fields[include][]=url", { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return events;
    const data = await res.json();

    for (const report of data.data || []) {
      const countries = (report.fields?.country || []).map((c: { iso3: string }) => c.iso3).filter(Boolean);
      events.push({
        id: `reliefweb-${report.id}`,
        title: report.fields?.title || "Untitled",
        date: report.fields?.date?.created?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        source: "ReliefWeb",
        sourceUrl: report.fields?.url || "https://reliefweb.int",
        countries,
        type: "crisis",
        relevance: 0.6,
      });
    }
  } catch (e) {
    console.warn("ReliefWeb fetch failed:", e);
  }
  return events;
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching live geopolitical events...\n");

  const [gdelt, unNews, reliefWeb] = await Promise.all([
    fetchGDELT(),
    fetchUNNews(),
    fetchReliefWeb(),
  ]);

  console.log(`  GDELT: ${gdelt.length} events`);
  console.log(`  UN News: ${unNews.length} events`);
  console.log(`  ReliefWeb: ${reliefWeb.length} events`);

  const allEvents = [...gdelt, ...unNews, ...reliefWeb]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 30);

  console.log(`\n  Total: ${allEvents.length} relevant events`);

  // Save
  const { writeFileSync } = await import("fs");
  const { join } = await import("path");
  const output = {
    lastUpdated: new Date().toISOString(),
    events: allEvents,
    sources: ["GDELT Project (gdeltproject.org)", "UN News (news.un.org)", "ReliefWeb API (reliefweb.int)"],
  };
  writeFileSync(join(__dirname, "../../data/live-events.json"), JSON.stringify(output, null, 2));
  console.log("\n✓ Saved to data/live-events.json");

  // Print some
  for (const e of allEvents.slice(0, 10)) {
    console.log(`  [${e.type}] ${e.title.slice(0, 70)}... (${e.countries.join(",")})`);
  }
}

main().catch(console.error);
