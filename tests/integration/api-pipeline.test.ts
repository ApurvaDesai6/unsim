import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("data integrity", () => {
  const dataDir = path.join(process.cwd(), "data");

  it("country-profiles.json has 193 countries", () => {
    const data = JSON.parse(readFileSync(path.join(dataDir, "country-profiles.json"), "utf-8"));
    expect(data).toHaveLength(193);
  });

  it("all countries have required fields", () => {
    const data = JSON.parse(readFileSync(path.join(dataDir, "country-profiles.json"), "utf-8"));
    for (const country of data) {
      expect(country.iso3).toBeTruthy();
      expect(country.name).toBeTruthy();
      expect(country.region).toMatch(/^(AFRICAN|APG|EEG|GRULAC|WEOG)$/);
      expect(country.idealPoint).toBeGreaterThanOrEqual(-1);
      expect(country.idealPoint).toBeLessThanOrEqual(1);
      expect(country.democracyIndex).toBeGreaterThanOrEqual(0);
      expect(country.democracyIndex).toBeLessThanOrEqual(1);
      expect(country.policyDimensions).toBeDefined();
      expect(country.policyDimensions.sovereignty).toBeDefined();
    }
  });

  it("blocs.json has valid structure", () => {
    const data = JSON.parse(readFileSync(path.join(dataDir, "blocs.json"), "utf-8"));
    expect(data.length).toBeGreaterThan(5);
    for (const bloc of data) {
      expect(bloc.id).toBeTruthy();
      expect(bloc.name).toBeTruthy();
      expect(bloc.members.length).toBeGreaterThan(0);
      expect(bloc.cohesionScore).toBeGreaterThan(0);
      expect(bloc.cohesionScore).toBeLessThanOrEqual(1);
    }
  });

  it("topic-history.json covers major countries", () => {
    const data = JSON.parse(readFileSync(path.join(dataDir, "topic-history.json"), "utf-8"));
    const majorCountries = ["United States", "China", "India", "Brazil", "Nigeria", "France"];
    for (const country of majorCountries) {
      expect(data[country]).toBeDefined();
      expect(Object.keys(data[country]).length).toBeGreaterThan(3);
    }
  });

  it("model-weights.json has correct dimensions", () => {
    const data = JSON.parse(readFileSync(path.join(dataDir, "model-weights.json"), "utf-8"));
    expect(data.weights).toHaveLength(3); // 3 classes
    expect(data.bias).toHaveLength(3);
    expect(data.featureNames.length).toBe(data.weights[0].length);
    expect(data.metadata.accuracy).toBeGreaterThan(0.5);
  });

  it("preset-resolutions.json has all 6 presets", () => {
    const data = JSON.parse(readFileSync(path.join(dataDir, "preset-resolutions.json"), "utf-8"));
    const expected = ["climate-treaty", "ai-governance", "nuclear-ban", "sc-reform", "cyber-norms", "water-rights"];
    for (const preset of expected) {
      expect(data[preset]).toBeDefined();
      expect(data[preset].title).toBeTruthy();
      expect(data[preset].operativeClauses.length).toBeGreaterThan(3);
      expect(data[preset].policyVector).toBeDefined();
    }
  });

  it("influence-network.json has entities and edges", () => {
    const data = JSON.parse(readFileSync(path.join(dataDir, "influence-network.json"), "utf-8"));
    expect(data.entities.length).toBeGreaterThan(10);
    expect(data.influence_edges.length).toBeGreaterThan(10);
    for (const edge of data.influence_edges) {
      expect(edge.source).toBeTruthy();
      expect(edge.target).toBeTruthy();
      expect(edge.strength).toBeGreaterThan(0);
      expect(edge.strength).toBeLessThanOrEqual(1);
      expect(edge.mechanism).toBeTruthy();
    }
  });

  it("vote-similarity.json has significant pairs", () => {
    const data = JSON.parse(readFileSync(path.join(dataDir, "vote-similarity.json"), "utf-8"));
    expect(data.topAlliances.length).toBeGreaterThan(20);
    expect(data.topRivalries.length).toBeGreaterThan(20);
    // Top alliance should be very high similarity
    expect(data.topAlliances[0].similarity).toBeGreaterThan(0.9);
    // Top rivalry should be very negative
    expect(data.topRivalries[0].similarity).toBeLessThan(-0.5);
  });
});
