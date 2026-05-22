/**
 * Knowledge Graph Ingestion — populates Neo4j from our data files.
 *
 * This is the ETL pipeline that transforms our validated data (country profiles,
 * voting records, similarity matrices, topic history) into a proper graph structure.
 *
 * Run via: npx tsx scripts/ingest-knowledge-graph.ts
 */

import { runWrite, runQuery } from "./driver";
import { initializeSchema, ISSUE_TAXONOMY } from "./schema";
import { readFileSync } from "fs";
import path from "path";
import type { CountryProfile, Bloc } from "@/types";

interface TopicRates { yesRate: number; noRate: number; abstainRate: number; sampleSize: number }
interface SimilarCountry { country: string; similarity: number; shared: number }
interface SimilarityData { mostSimilar: SimilarCountry[]; mostDissimilar: SimilarCountry[] }

export async function ingestAll(dataDir: string): Promise<void> {
  console.log("Initializing schema...");
  await initializeSchema();

  console.log("Loading data files...");
  const profiles: CountryProfile[] = JSON.parse(readFileSync(path.join(dataDir, "country-profiles.json"), "utf-8"));
  const blocs: Bloc[] = JSON.parse(readFileSync(path.join(dataDir, "blocs.json"), "utf-8"));
  const topicHistory: Record<string, Record<string, TopicRates>> = JSON.parse(readFileSync(path.join(dataDir, "topic-history.json"), "utf-8"));
  const rawSimilarity = JSON.parse(readFileSync(path.join(dataDir, "vote-similarity.json"), "utf-8"));
  const similarities: Record<string, SimilarityData> = rawSimilarity.similarities || {};
  const topAlliances: { country1: string; country2: string; similarity: number; sharedVotes: number }[] = rawSimilarity.topAlliances || [];
  const topRivalries: { country1: string; country2: string; similarity: number; sharedVotes: number }[] = rawSimilarity.topRivalries || [];

  // ─── Countries ──────────────────────────────────────────────────────
  console.log(`Ingesting ${profiles.length} countries...`);
  for (const p of profiles) {
    await runWrite(`
      MERGE (c:Country {iso3: $iso3})
      SET c.name = $name,
          c.region = $region,
          c.governmentType = $govType,
          c.gdpPerCapita = $gdp,
          c.population = $pop,
          c.democracyIndex = $democracy,
          c.idealPoint = $idealPoint,
          c.sovereignty = $sov,
          c.humanRights = $hr,
          c.development = $dev,
          c.security = $sec,
          c.environment = $env,
          c.decolonization = $decol,
          c.scStatus = $scStatus
    `, {
      iso3: p.iso3, name: p.name, region: p.region,
      govType: p.governmentType, gdp: p.gdpPerCapita, pop: p.population,
      democracy: p.democracyIndex, idealPoint: p.idealPoint,
      sov: p.policyDimensions.sovereignty, hr: p.policyDimensions.humanRights,
      dev: p.policyDimensions.development, sec: p.policyDimensions.security,
      env: p.policyDimensions.environment, decol: p.policyDimensions.decolonization,
      scStatus: p.scStatus,
    });
  }

  // ─── Blocs ──────────────────────────────────────────────────────────
  console.log(`Ingesting ${blocs.length} blocs...`);
  for (const b of blocs) {
    await runWrite(`
      MERGE (bl:Bloc {id: $id})
      SET bl.name = $name, bl.shortName = $shortName,
          bl.cohesionScore = $cohesion, bl.description = $desc
    `, { id: b.id, name: b.name, shortName: b.shortName, cohesion: b.cohesionScore, desc: b.description });

    // Create MEMBER_OF edges
    for (const memberIso3 of b.members) {
      await runWrite(`
        MATCH (c:Country {iso3: $iso3}), (bl:Bloc {id: $blocId})
        MERGE (c)-[r:MEMBER_OF]->(bl)
        SET r.status = 'full'
      `, { iso3: memberIso3, blocId: b.id });
    }
  }

  // ─── Issues ─────────────────────────────────────────────────────────
  console.log(`Ingesting ${ISSUE_TAXONOMY.length} issues...`);
  for (const issue of ISSUE_TAXONOMY) {
    await runWrite(`
      MERGE (i:Issue {id: $id})
      SET i.name = $name, i.parent = $parent, i.voetanCategory = $voetan
    `, { id: issue.id, name: issue.name, parent: issue.parent, voetan: issue.voetanCategory });
  }

  // ─── Country positions on issues (from topic history) ───────────────
  console.log("Ingesting country-issue positions...");
  let posCount = 0;
  for (const [countryName, topics] of Object.entries(topicHistory)) {
    for (const [issueName, rates] of Object.entries(topics)) {
      if (rates.sampleSize < 20) continue;
      const stance = rates.yesRate - rates.noRate; // [-1, +1]
      const matchedIssue = ISSUE_TAXONOMY.find((i) => i.voetanCategory === issueName);
      if (!matchedIssue) continue;

      await runWrite(`
        MATCH (c:Country {name: $country}), (i:Issue {id: $issueId})
        MERGE (c)-[r:POSITION_ON]->(i)
        SET r.stance = $stance, r.confidence = $conf,
            r.yesRate = $yes, r.noRate = $no, r.abstainRate = $abstain,
            r.sampleSize = $sample
      `, {
        country: countryName, issueId: matchedIssue.id,
        stance, conf: Math.min(1, rates.sampleSize / 100),
        yes: rates.yesRate, no: rates.noRate, abstain: rates.abstainRate,
        sample: rates.sampleSize,
      });
      posCount++;
    }
  }
  console.log(`  Created ${posCount} POSITION_ON edges`);

  // ─── Alliances (from vote-similarity) ───────────────────────────────
  console.log(`Ingesting ${topAlliances.length} alliance relationships...`);
  for (const alliance of topAlliances) {
    await runWrite(`
      MATCH (a:Country {name: $c1}), (b:Country {name: $c2})
      MERGE (a)-[r:ALLIES_WITH]-(b)
      SET r.strength = $sim, r.sharedVotes = $shared, r.type = 'voting-bloc'
    `, { c1: alliance.country1, c2: alliance.country2, sim: alliance.similarity, shared: alliance.sharedVotes });
  }

  // ─── Rivalries ──────────────────────────────────────────────────────
  console.log(`Ingesting ${topRivalries.length} rivalry relationships...`);
  for (const rivalry of topRivalries) {
    await runWrite(`
      MATCH (a:Country {name: $c1}), (b:Country {name: $c2})
      MERGE (a)-[r:RIVALS_WITH]-(b)
      SET r.intensity = $intensity, r.sharedVotes = $shared, r.type = 'ideological'
    `, { c1: rivalry.country1, c2: rivalry.country2, intensity: Math.abs(rivalry.similarity), shared: rivalry.sharedVotes });
  }

  console.log("\n✓ Knowledge graph ingestion complete");
}
