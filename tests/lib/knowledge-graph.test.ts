import { describe, it, expect } from "vitest";
import {
  getGraph,
  getGraphStats,
  getAlliances,
  getRivalries,
  getIssuePositions,
  getBlocMemberships,
  getSubgraphForViz,
  predictVoteFromGraph,
} from "@/lib/knowledge-graph";

describe("knowledge-graph", () => {
  describe("getGraph", () => {
    it("initializes with correct node count", () => {
      const g = getGraph();
      expect(g.order).toBeGreaterThan(200); // 193 countries + blocs + issues
    });

    it("initializes with edges", () => {
      const g = getGraph();
      expect(g.size).toBeGreaterThan(1000);
    });
  });

  describe("getGraphStats", () => {
    it("returns expected structure", () => {
      const stats = getGraphStats();
      expect(stats.countries).toBe(193);
      expect(stats.blocs).toBe(7);
      expect(stats.issues).toBe(6);
      expect(stats.alliances).toBeGreaterThan(500);
      expect(stats.rivalries).toBeGreaterThan(300);
      expect(stats.positions).toBeGreaterThan(500);
    });
  });

  describe("getAlliances", () => {
    it("returns USA allies sorted by strength", () => {
      const allies = getAlliances("USA");
      expect(allies.length).toBeGreaterThan(0);
      expect(allies[0].strength).toBeGreaterThan(allies[allies.length - 1].strength);
    });

    it("USA top ally is Israel", () => {
      const allies = getAlliances("USA");
      expect(allies[0].iso3).toBe("ISR");
      expect(allies[0].strength).toBeGreaterThan(0.7);
    });

    it("returns empty for non-existent country", () => {
      const allies = getAlliances("ZZZ");
      expect(allies).toEqual([]);
    });
  });

  describe("getRivalries", () => {
    it("returns USA rivals", () => {
      const rivals = getRivalries("USA");
      expect(rivals.length).toBeGreaterThan(0);
      // USA's top rivals should include Syria, Iran, or North Korea
      const rivalIsos = rivals.map((r) => r.iso3);
      const hasExpectedRival = rivalIsos.includes("SYR") || rivalIsos.includes("IRN") || rivalIsos.includes("CUB");
      expect(hasExpectedRival).toBe(true);
    });
  });

  describe("getIssuePositions", () => {
    it("returns USA positions with correct structure", () => {
      const positions = getIssuePositions("USA");
      expect(positions.length).toBeGreaterThan(0);
      for (const p of positions) {
        expect(p.yesRate).toBeGreaterThanOrEqual(0);
        expect(p.yesRate).toBeLessThanOrEqual(1);
        expect(p.noRate).toBeGreaterThanOrEqual(0);
        expect(p.sampleSize).toBeGreaterThan(0);
        expect(p.yesRate + p.noRate + p.abstainRate).toBeCloseTo(1.0, 1);
      }
    });

    it("USA votes No majority on Palestinian conflict", () => {
      const positions = getIssuePositions("USA");
      const palestine = positions.find((p) => p.issueName.includes("Palestinian"));
      expect(palestine).toBeDefined();
      expect(palestine!.noRate).toBeGreaterThan(0.7);
    });
  });

  describe("getBlocMemberships", () => {
    it("India belongs to at least one bloc", () => {
      const blocs = getBlocMemberships("IND");
      expect(blocs.length).toBeGreaterThan(0);
    });

    it("France belongs to EU bloc", () => {
      const blocs = getBlocMemberships("FRA");
      const eu = blocs.find((b) => b.name.includes("European"));
      expect(eu).toBeDefined();
    });
  });

  describe("getSubgraphForViz", () => {
    it("returns nodes and edges for USA at depth 1", () => {
      const subgraph = getSubgraphForViz("USA", 1);
      expect(subgraph.nodes.length).toBeGreaterThan(1);
      expect(subgraph.edges.length).toBeGreaterThan(0);
      // Should include USA itself
      expect(subgraph.nodes.some((n) => n.id === "USA")).toBe(true);
    });

    it("caps at 100 nodes", () => {
      const subgraph = getSubgraphForViz("USA", 2);
      expect(subgraph.nodes.length).toBeLessThanOrEqual(100);
    });
  });

  describe("predictVoteFromGraph", () => {
    it("predicts USA No on Palestinian conflict from direct history", () => {
      const pred = predictVoteFromGraph("USA", "Palestinian");
      expect(pred.method).toBe("direct-history");
      expect(pred.no).toBeGreaterThan(0.7);
    });

    it("predicts Nigeria Yes on Economic development", () => {
      const pred = predictVoteFromGraph("NGA", "Economic");
      expect(pred.yes).toBeGreaterThan(0.8);
    });

    it("falls back gracefully for unknown country", () => {
      const pred = predictVoteFromGraph("ZZZ", "anything");
      expect(pred.yes + pred.no + pred.abstain).toBeCloseTo(1.0, 1);
    });
  });
});
