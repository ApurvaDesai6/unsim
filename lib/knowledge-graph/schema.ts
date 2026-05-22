/**
 * Neo4j schema initialization — creates constraints, indexes, and the
 * foundational graph structure per our ontology.
 */

import { runWrite } from "./driver";

const CONSTRAINTS = [
  "CREATE CONSTRAINT country_iso3 IF NOT EXISTS FOR (c:Country) REQUIRE c.iso3 IS UNIQUE",
  "CREATE CONSTRAINT bloc_id IF NOT EXISTS FOR (b:Bloc) REQUIRE b.id IS UNIQUE",
  "CREATE CONSTRAINT resolution_id IF NOT EXISTS FOR (r:Resolution) REQUIRE r.id IS UNIQUE",
  "CREATE CONSTRAINT treaty_id IF NOT EXISTS FOR (t:Treaty) REQUIRE t.id IS UNIQUE",
  "CREATE CONSTRAINT issue_id IF NOT EXISTS FOR (i:Issue) REQUIRE i.id IS UNIQUE",
  "CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.id IS UNIQUE",
  "CREATE CONSTRAINT leader_id IF NOT EXISTS FOR (l:Leader) REQUIRE l.id IS UNIQUE",
];

const INDEXES = [
  "CREATE INDEX country_name IF NOT EXISTS FOR (c:Country) ON (c.name)",
  "CREATE INDEX country_region IF NOT EXISTS FOR (c:Country) ON (c.region)",
  "CREATE INDEX resolution_date IF NOT EXISTS FOR (r:Resolution) ON (r.date)",
  "CREATE INDEX resolution_session IF NOT EXISTS FOR (r:Resolution) ON (r.session)",
  "CREATE INDEX event_date IF NOT EXISTS FOR (e:Event) ON (e.date)",
  "CREATE INDEX issue_category IF NOT EXISTS FOR (i:Issue) ON (i.voetanCategory)",
  // Full-text search indexes
  "CREATE FULLTEXT INDEX resolution_text IF NOT EXISTS FOR (r:Resolution) ON EACH [r.title, r.description]",
  "CREATE FULLTEXT INDEX event_text IF NOT EXISTS FOR (e:Event) ON EACH [e.title, e.description]",
];

export async function initializeSchema(): Promise<void> {
  for (const constraint of CONSTRAINTS) {
    try { await runWrite(constraint); } catch {}
  }
  for (const index of INDEXES) {
    try { await runWrite(index); } catch {}
  }
}

export const ISSUE_TAXONOMY = [
  { id: "palestinian-conflict", name: "Palestinian Conflict", parent: null, voetanCategory: "Palestinian conflict" },
  { id: "nuclear-weapons", name: "Nuclear Weapons & Material", parent: "security", voetanCategory: "Nuclear weapons and nuclear material" },
  { id: "arms-control", name: "Arms Control & Disarmament", parent: "security", voetanCategory: "Arms control and disarmament" },
  { id: "colonialism", name: "Colonialism & Self-Determination", parent: null, voetanCategory: "Colonialism" },
  { id: "human-rights", name: "Human Rights", parent: null, voetanCategory: "Human rights" },
  { id: "economic-development", name: "Economic Development", parent: null, voetanCategory: "Economic development" },
  { id: "climate", name: "Climate Change", parent: "environment", voetanCategory: "Economic development" },
  { id: "environment", name: "Environment", parent: null, voetanCategory: null },
  { id: "security", name: "International Security", parent: null, voetanCategory: null },
  { id: "sovereignty", name: "State Sovereignty", parent: null, voetanCategory: null },
  { id: "terrorism", name: "Counter-Terrorism", parent: "security", voetanCategory: null },
  { id: "refugees", name: "Refugees & Migration", parent: "human-rights", voetanCategory: null },
  { id: "trade", name: "International Trade", parent: "economic-development", voetanCategory: null },
  { id: "technology", name: "Technology Governance", parent: null, voetanCategory: null },
  { id: "peacekeeping", name: "Peacekeeping Operations", parent: "security", voetanCategory: null },
  { id: "water", name: "Water & Sanitation", parent: "environment", voetanCategory: null },
  { id: "gender-equality", name: "Gender Equality", parent: "human-rights", voetanCategory: null },
  { id: "health", name: "Global Health", parent: null, voetanCategory: null },
];
